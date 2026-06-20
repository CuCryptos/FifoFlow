# Week 1 Security Hardening — Design

**Date:** 2026-04-21
**Scope:** Auth, rate limiting, and automated backups for FifoFlow production deployment.
**Out of scope:** TLS/HTTPS (deferred pending domain acquisition), password reset, 2FA, user admin UI, role-based enforcement, multi-region backups.

## Motivation

Production deployment at `http://64.227.108.209/` currently:
- Exposes all API endpoints without authentication.
- Has no rate limiting on endpoints that invoke the Anthropic API, creating a billing-abuse vector.
- Stores business-critical data in a single SQLite file with no off-box backup.

This spec addresses all three gaps in a single implementation cycle.

## Decisions (summary)

| Decision | Choice |
|---|---|
| Auth model | Per-user accounts, manually provisioned via CLI |
| Session mechanism | HTTP-only cookie + SQLite-backed server sessions |
| TLS | Deferred; design must be TLS-ready via `COOKIE_SECURE` env flag |
| Backup tool | Litestream → DigitalOcean Spaces |
| Rate limiting | Generous global limiter + strict AI-endpoint limiter + login brute-force limiter |

## 1. Authentication

### 1.1 Schema

Two new tables added via the existing migration pattern in `packages/server/src/db.ts`.

```sql
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'staff',
  created_at    TEXT    NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT    PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT    NOT NULL,
  expires_at   TEXT    NOT NULL,
  last_seen_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
```

Notes:
- `password_hash` is bcrypt with cost factor 12. Library: `bcrypt` (native) or `bcryptjs` (pure JS) — choose `bcrypt` for speed, fall back to `bcryptjs` if native build fails on deploy target.
- `role` column is for future use; not enforced in this cycle. Default `'staff'` for all provisioned users. Bootstrap user may be `'admin'` but no code path branches on it yet.
- `session.id` is a 32-byte cryptographically random value, hex-encoded (64 chars). Generated via `crypto.randomBytes(32).toString('hex')`.

### 1.2 Routes

New file: `packages/server/src/routes/auth.ts`. Mounted at `/api/auth`.

| Method | Path | Behavior |
|---|---|---|
| POST | `/api/auth/login` | Body `{ email, password }`. Look up user by email. Compare bcrypt. On success: insert session, set `sid` cookie, update `users.last_login_at`, return `{ user: { id, email, name, role } }`. On failure: 401 `{ error: 'Invalid credentials' }` — do not disclose whether email exists. |
| POST | `/api/auth/logout` | Read `sid` cookie. Delete session row. Clear cookie. Return `{ ok: true }`. Idempotent (no error if already logged out). |
| GET | `/api/auth/me` | If valid session: return `{ user }`. If not: 401. Client calls this on boot to decide login vs app render. |

All auth routes are exempt from `requireAuth`.

### 1.3 Middleware: `requireAuth`

New file: `packages/server/src/middleware/requireAuth.ts`.

Behavior:
1. Read `sid` from signed cookie. If absent → 401.
2. Look up session by id. If absent → 401 + clear cookie.
3. If `expires_at < now` → delete session, 401 + clear cookie.
4. If `last_seen_at` is more than 24 h old → update `last_seen_at = now`, `expires_at = now + 30d` (sliding expiration).
5. Attach `req.user` (from `users` table join) and call `next()`.

Applied in `packages/server/src/index.ts` as a single `app.use('/api', requireAuth)` line placed **after** `/api/auth/*` routes and `/api/health`, **before** all other `/api/*` routes.

### 1.4 Cookie configuration

```ts
{
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  secure: process.env.COOKIE_SECURE === 'true',
  signed: true,
}
```

Cookie signing requires `COOKIE_SECRET` env var (32+ random bytes). Server refuses to start if missing in production. Uses `cookie-parser` middleware.

**TLS readiness:** `COOKIE_SECURE` defaults unset/`false` (plaintext HTTP). When TLS ships, set `COOKIE_SECURE=true` on droplet `.env` and restart. Documented in deployment notes.

### 1.5 User provisioning CLI

New file: `packages/server/src/scripts/createUser.ts`. Run via new npm script:

```
npm run create-user --workspace=packages/server -- --email curt@example.com --name "Curt" --role admin
```

- If `--password` flag omitted, prompts securely (no echo).
- Validates: email format, password ≥ 10 chars, unique email.
- Inserts directly into `users` table. Prints `User created: id=N`.

No signup endpoint exists. Account creation is an explicit operator action.

### 1.6 Client changes

**New files:**
- `packages/client/src/contexts/AuthContext.tsx` — provides `{ user, login, logout, isLoading }`.
- `packages/client/src/pages/LoginPage.tsx` — email + password form, submits to `/api/auth/login`, shows errors inline.
- `packages/client/src/hooks/useAuth.ts` — trivial consumer of `AuthContext`.

**Modified:**
- `packages/client/src/App.tsx` — wrap in `<AuthProvider>`. If `user === null && !isLoading`, render `<LoginPage />` instead of the existing router.
- `packages/client/src/api.ts` — fetch wrapper adds `credentials: 'include'` to every request. On 401, call `authContext.logout()` locally (clear user state, no server round-trip) and reject with a sentinel error; React Query retries are disabled for auth errors.

**Boot flow:**
1. `AuthProvider` mounts, calls `GET /api/auth/me`.
2. While pending: `isLoading = true`. Render a minimal splash (existing Layout shell, blank main content).
3. On 200: set user, render app.
4. On 401: user stays `null`, render `<LoginPage />`.

**Logout:** button in existing Layout header. Calls `POST /api/auth/logout`, clears auth state, invalidates all TanStack queries.

### 1.7 Password policy

- Min length: 10 characters.
- No composition rules (NIST-aligned).
- No reuse check, no rotation.
- Bcrypt cost: 12.

## 2. Rate limiting

### 2.1 Library and storage

`express-rate-limit` v7+. In-memory store (default). Limits reset on process restart — acceptable given restarts are manual and rare.

### 2.2 Limiters

Three instances, defined in `packages/server/src/middleware/rateLimiters.ts`:

| Name | Scope | Window | Max | Key |
|---|---|---|---|---|
| `loginLimiter` | `POST /api/auth/login` only | 15 min | 10 | `req.ip` |
| `globalLimiter` | All `/api/*` (post-auth) | 15 min | 300 | `req.user.id` |
| `aiLimiter` | Four AI routes (see below) | 60 min | 20 | `req.user.id` |

AI routes to wrap with `aiLimiter`:
- `/api/forecasts` — PDF upload route (forecast parsing).
- `/api/invoices` — PDF upload route (invoice parsing).
- `/api/recipe-intelligence`.
- `/api/allergy-assistant`.

Because `aiLimiter` applies to entire route prefixes, non-AI endpoints under those prefixes will also be limited. This is acceptable — those prefixes are narrowly AI-focused. If future non-AI sub-routes get added under these prefixes and the 20/hr limit is too tight, move the limiter down to the specific handler.

### 2.3 Response shape

On 429:
```json
{ "error": "Too many requests", "retryAfter": 842 }
```
`retryAfter` in seconds, also emitted as `Retry-After` header per express-rate-limit default.

### 2.4 Middleware order in `index.ts`

```
cors
cookieParser
express.json
/api/health                          (no auth, no limit)
/api/auth/logout, /api/auth/me       (no limit; auth-aware but not login)
loginLimiter → POST /api/auth/login  (login route only, IP-keyed)
requireAuth                          (applied to everything below)
globalLimiter        (applied once, catches all authed routes)
aiLimiter            (applied per-route on the four AI prefixes)
all other /api/* routes
```

## 3. Backups (Litestream)

### 3.1 Architecture

Litestream runs as a second container in `docker-compose.yml`, sharing the `fifoflow-data` volume (read-only relative to the DB — Litestream only needs to read WAL pages). Replicates to a DigitalOcean Spaces bucket in NYC3.

### 3.2 Configuration files

**`docker-compose.yml` additions:**

```yaml
services:
  app:
    environment:
      SQLITE_JOURNAL_MODE: WAL   # explicit; better-sqlite3 default but pin for clarity

  litestream:
    image: litestream/litestream:0.3
    restart: unless-stopped
    volumes:
      - fifoflow-data:/data
      - ./litestream.yml:/etc/litestream.yml:ro
    environment:
      LITESTREAM_ACCESS_KEY_ID:     ${DO_SPACES_KEY}
      LITESTREAM_SECRET_ACCESS_KEY: ${DO_SPACES_SECRET}
    command: replicate
    depends_on:
      - app
```

**`litestream.yml`:**

```yaml
dbs:
  - path: /data/fifoflow.db
    replicas:
      - type: s3
        endpoint: https://nyc3.digitaloceanspaces.com
        bucket: fifoflow-backups
        path: prod/fifoflow
        region: us-east-1       # required placeholder; DO Spaces ignores
        retention: 720h         # 30 days
        snapshot-interval: 24h
        sync-interval: 10s
```

Recovery point objective (RPO): ~10 seconds of transactions under normal operation.

### 3.3 One-time manual setup

Documented in `docs/runbooks/backup-setup.md`:

1. Create Spaces bucket `fifoflow-backups` in NYC3 via DO console.
2. Generate Spaces access key + secret via DO console → API → Spaces Keys.
3. Add to `/opt/FifoFlow/.env` on droplet:
   ```
   DO_SPACES_KEY=...
   DO_SPACES_SECRET=...
   ```
4. Deploy. Verify with `docker compose logs litestream` — expect `replicating db=/data/fifoflow.db replica=s3` messages.

### 3.4 Restore runbook

New file: `docs/runbooks/restore-backup.md`. Procedure:

```bash
# On droplet, from /opt/FifoFlow:
docker compose stop app

# Move the broken DB aside (never delete — may help diagnose root cause)
docker compose run --rm --entrypoint sh app \
  -c 'mv /app/packages/server/data/fifoflow.db /app/packages/server/data/fifoflow.db.broken'

# Restore latest
docker run --rm \
  -v fifoflow-data:/data \
  -e LITESTREAM_ACCESS_KEY_ID=$DO_SPACES_KEY \
  -e LITESTREAM_SECRET_ACCESS_KEY=$DO_SPACES_SECRET \
  litestream/litestream:0.3 \
  restore -o /data/fifoflow.db \
  s3://fifoflow-backups.nyc3.digitaloceanspaces.com/prod/fifoflow

docker compose start app

# Verify
curl http://localhost/api/health
```

### 3.5 Verification script

New file: `scripts/verify-backup.sh`. Pulls latest replica into a scratch dir, runs `PRAGMA integrity_check` via `sqlite3` CLI, reports OK / FAIL. Manual monthly run. No cron / automated alerting in this cycle.

## 4. Testing

### 4.1 Server tests (Vitest + supertest)

New file: `packages/server/src/__tests__/auth.test.ts`. Covers:
- Login with valid credentials returns 200 + sets cookie.
- Login with invalid password returns 401.
- Login with unknown email returns 401 (same response as invalid password).
- `/api/auth/me` returns 200 with valid session cookie.
- `/api/auth/me` returns 401 with no cookie.
- `/api/auth/me` returns 401 with expired session (insert row with `expires_at` in past).
- Logout deletes session row.
- `requireAuth` rejects requests to a protected route without a cookie.
- Sliding expiration: `last_seen_at` and `expires_at` updated when >24h old.

New file: `packages/server/src/__tests__/rateLimiting.test.ts`. Covers:
- 11th login attempt within 15 min from same IP returns 429.
- (Global and AI limiters not tested in this cycle — too flaky for a time-windowed in-memory limiter; verify manually.)

### 4.2 Client tests

Out of scope for this cycle beyond making sure the existing test suite (if any) still passes. Login page visual verification is manual.

### 4.3 Backup verification

Manual, one-time after deploy:
1. Confirm `docker compose logs litestream` shows replication activity.
2. Run `scripts/verify-backup.sh` against the prod bucket — expect `integrity_check ok`.
3. Test restore into scratch dir (not over prod DB) and verify row counts match.

## 5. Dependencies to add

- Server: `bcrypt` (or `bcryptjs`), `cookie-parser`, `express-rate-limit`.
- Server dev: `@types/bcrypt` (or none for `bcryptjs`), `@types/cookie-parser`.
- Docker: `litestream/litestream:0.3` image pulled at deploy time; no Node dep.
- Client: none.

## 6. Rollout order

Each track is independent; recommended deploy order to minimize risk:

1. **Backups first** — zero code risk, protects data during subsequent deploys. Deploy Litestream, verify replication, verify restore works.
2. **Rate limiting second** — pure additive middleware, no breaking changes. Deploy, observe.
3. **Auth last** — biggest behavior change; requires bootstrap user creation before staff lockout. Procedure: (a) provision first admin user via CLI on droplet before deploying the middleware; (b) deploy; (c) distribute credentials to staff.

## 7. Environment variables (summary)

Added to `/opt/FifoFlow/.env`:

```
COOKIE_SECRET=<32+ random bytes, hex>
COOKIE_SECURE=false                # flip to true when TLS ships
DO_SPACES_KEY=...
DO_SPACES_SECRET=...
```

Server refuses to start in production if `COOKIE_SECRET` is missing.

## 8. Explicit non-goals

- HTTPS / TLS termination (next week, pending domain).
- Password reset flow.
- Email verification.
- Two-factor authentication.
- User admin UI (provisioning is CLI-only).
- Role-based access control enforcement (schema ready, no branching yet).
- Automated backup verification / alerting.
- Multi-region or cross-cloud backup redundancy.
- Per-user rate limit overrides / admin bypass.
