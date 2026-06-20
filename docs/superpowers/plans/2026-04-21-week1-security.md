# Week 1 Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-user authentication, rate limiting, and Litestream-based automated backups to FifoFlow in a single implementation cycle.

**Architecture:** Express middleware for auth (cookie + SQLite-backed sessions) and rate limiting (express-rate-limit, in-memory). User provisioning via CLI script. Backups run as a sidecar `litestream` container replicating WAL to DigitalOcean Spaces. Client gets an `AuthContext` + `LoginPage`; existing fetch wrapper updated to send cookies and handle 401.

**Tech Stack:** Express 5, better-sqlite3, bcryptjs, cookie-parser, express-rate-limit, React 19, TanStack Query, Vitest, supertest, Litestream 0.3, DigitalOcean Spaces (S3-compatible).

**Spec:** `docs/superpowers/specs/2026-04-21-week1-security-design.md`

---

## File Map

**Create:**
- `packages/server/src/auth/schema.ts` — users/sessions table DDL + migration registration.
- `packages/server/src/auth/passwords.ts` — bcrypt hash/compare wrappers.
- `packages/server/src/auth/sessions.ts` — session CRUD (create, find, delete, slide expiry).
- `packages/server/src/middleware/requireAuth.ts` — Express middleware.
- `packages/server/src/middleware/rateLimiters.ts` — three rate limiter instances.
- `packages/server/src/routes/auth.ts` — `/api/auth/login|logout|me` routes.
- `packages/server/src/scripts/createUser.ts` — CLI to provision users.
- `packages/server/src/__tests__/auth.test.ts` — auth behavior tests.
- `packages/server/src/__tests__/rateLimiting.test.ts` — login rate limiter test.
- `packages/client/src/contexts/AuthContext.tsx` — provides `{ user, login, logout, isLoading }`.
- `packages/client/src/hooks/useAuth.ts` — hook wrapping the context.
- `packages/client/src/pages/LoginPage.tsx` — login form.
- `litestream.yml` — Litestream config at repo root.
- `docs/runbooks/backup-setup.md` — one-time DO Spaces setup.
- `docs/runbooks/restore-backup.md` — DB restore procedure.
- `scripts/verify-backup.sh` — manual backup verification.

**Modify:**
- `packages/server/package.json` — add deps.
- `packages/server/src/db.ts` — call `initializeAuthDb`.
- `packages/server/src/index.ts` — wire middleware in correct order.
- `packages/client/src/api.ts:1200-1212` — `fetchJson` adds `credentials: 'include'`, 401 handling.
- `packages/client/src/App.tsx` — wrap in `<AuthProvider>`, conditional render login.
- `packages/client/src/components/Layout.tsx` — add logout button (verify path, may be different).
- `docker-compose.yml` — add `litestream` service.

---

## Phase 1 — Dependencies and environment

### Task 1: Add server dependencies

**Files:**
- Modify: `packages/server/package.json`

- [ ] **Step 1: Install packages**

Run from repo root:

```bash
npm install --workspace=packages/server bcryptjs cookie-parser express-rate-limit
npm install --workspace=packages/server --save-dev @types/cookie-parser
```

Using `bcryptjs` (pure JS) rather than `bcrypt` (native) to avoid Alpine build issues in the production Docker image.

- [ ] **Step 2: Commit**

```bash
git add packages/server/package.json package-lock.json
git commit -m "chore: add auth, cookie, rate-limit deps"
```

---

### Task 2: Document required environment variables

**Files:**
- Create: `docs/runbooks/env-vars.md`

- [ ] **Step 1: Create env reference**

```markdown
# Environment Variables

## Required in production

| Var | Example | Purpose |
|---|---|---|
| `COOKIE_SECRET` | `a1b2...` (64 hex chars) | Signs the `sid` session cookie. Server refuses to start in production if missing. Generate with `openssl rand -hex 32`. |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Claude API key for PDF parsing routes. |
| `DO_SPACES_KEY` | `DO00...` | DigitalOcean Spaces access key for Litestream. |
| `DO_SPACES_SECRET` | `...` | DigitalOcean Spaces secret key. |

## Optional

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | Server listen port. |
| `NODE_ENV` | (unset) | Set to `production` on droplet to enable static client serving and strict env checks. |
| `COOKIE_SECURE` | `false` | Set to `true` once TLS ships. Causes browsers to refuse the cookie over plain HTTP. |
| `INVENTORY_STORE_DRIVER` | `sqlite` | Store implementation selector. |
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/env-vars.md
git commit -m "docs: document required env vars"
```

---

## Phase 2 — Auth schema

### Task 3: Create auth schema module

**Files:**
- Create: `packages/server/src/auth/schema.ts`

- [ ] **Step 1: Write the module**

```ts
import type Database from 'better-sqlite3';

export function initializeAuthDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      name          TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'staff',
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
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
  `);
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  created_at: string;
  last_login_at: string | null;
}

export interface SessionRow {
  id: string;
  user_id: number;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
}

export interface AuthedUser {
  id: number;
  email: string;
  name: string;
  role: string;
}
```

- [ ] **Step 2: Wire into `initializeDb`**

Open `packages/server/src/db.ts`. At the top of the file, add import:

```ts
import { initializeAuthDb } from './auth/schema.js';
```

In the `initializeDb` function, after the existing intelligence/mapping initialize calls, add:

```ts
initializeAuthDb(db);
```

- [ ] **Step 3: Verify DB still initializes**

```bash
npm run build --workspace=packages/shared
npm test --workspace=packages/server -- db.test
```

Expected: existing db tests pass; no errors from the new schema.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/auth/schema.ts packages/server/src/db.ts
git commit -m "feat(auth): add users and sessions schema"
```

---

## Phase 3 — Password hashing

### Task 4: Password utility (TDD)

**Files:**
- Create: `packages/server/src/auth/passwords.ts`
- Create: `packages/server/src/__tests__/passwords.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/server/src/__tests__/passwords.test.ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../auth/passwords.js';

describe('passwords', () => {
  it('hashes and verifies correctly', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await verifyPassword('correct-horse-battery', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('produces different hashes for the same password (salted)', async () => {
    const a = await hashPassword('same-password-12');
    const b = await hashPassword('same-password-12');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --workspace=packages/server -- passwords
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/server/src/auth/passwords.ts
import bcrypt from 'bcryptjs';

const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --workspace=packages/server -- passwords
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/auth/passwords.ts packages/server/src/__tests__/passwords.test.ts
git commit -m "feat(auth): password hashing utility"
```

---

## Phase 4 — Session management

### Task 5: Session CRUD (TDD)

**Files:**
- Create: `packages/server/src/auth/sessions.ts`
- Modify: `packages/server/src/__tests__/auth.test.ts` (create later — this task builds the module only)

- [ ] **Step 1: Write the module**

```ts
// packages/server/src/auth/sessions.ts
import { randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { SessionRow, UserRow, AuthedUser } from './schema.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SLIDE_THRESHOLD_MS = 24 * 60 * 60 * 1000;  // slide once per day

export function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}

export function createSession(db: Database.Database, userId: number): string {
  const id = generateSessionId();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  db.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, userId, now.toISOString(), expires.toISOString(), now.toISOString());
  return id;
}

export function deleteSession(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export interface ResolvedSession {
  session: SessionRow;
  user: AuthedUser;
}

export function findValidSession(
  db: Database.Database,
  id: string,
  now: Date = new Date(),
): ResolvedSession | null {
  const row = db
    .prepare(
      `SELECT s.id as s_id, s.user_id, s.created_at as s_created, s.expires_at, s.last_seen_at,
              u.id as u_id, u.email, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;

  const expiresAt = new Date(row.expires_at as string);
  if (expiresAt.getTime() <= now.getTime()) {
    deleteSession(db, id);
    return null;
  }

  const lastSeen = new Date(row.last_seen_at as string);
  if (now.getTime() - lastSeen.getTime() > SLIDE_THRESHOLD_MS) {
    const newExpires = new Date(now.getTime() + SESSION_TTL_MS);
    db.prepare(
      `UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?`,
    ).run(now.toISOString(), newExpires.toISOString(), id);
  }

  return {
    session: {
      id: row.s_id as string,
      user_id: row.user_id as number,
      created_at: row.s_created as string,
      expires_at: row.expires_at as string,
      last_seen_at: row.last_seen_at as string,
    },
    user: {
      id: row.u_id as number,
      email: row.email as string,
      name: row.name as string,
      role: row.role as string,
    },
  };
}

export function findUserByEmail(db: Database.Database, email: string): UserRow | null {
  const row = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(email.toLowerCase().trim()) as UserRow | undefined;
  return row ?? null;
}

export function touchLastLogin(db: Database.Database, userId: number): void {
  db.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?').run(userId);
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build --workspace=packages/server
```

Expected: no TS errors.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/auth/sessions.ts
git commit -m "feat(auth): session CRUD with sliding expiration"
```

---

## Phase 5 — requireAuth middleware and auth routes

### Task 6: requireAuth middleware

**Files:**
- Create: `packages/server/src/middleware/requireAuth.ts`

- [ ] **Step 1: Write the module**

```ts
// packages/server/src/middleware/requireAuth.ts
import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';
import { findValidSession } from '../auth/sessions.js';
import type { AuthedUser } from '../auth/schema.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export function createRequireAuth(db: Database.Database) {
  return function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const sid = req.signedCookies?.sid;
    if (typeof sid !== 'string' || sid.length === 0) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const resolved = findValidSession(db, sid);
    if (!resolved) {
      res.clearCookie('sid');
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    req.user = resolved.user;
    next();
  };
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build --workspace=packages/server
```

Expected: no TS errors.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/middleware/requireAuth.ts
git commit -m "feat(auth): requireAuth middleware"
```

---

### Task 7: Auth routes (TDD)

**Files:**
- Create: `packages/server/src/routes/auth.ts`
- Create: `packages/server/src/__tests__/auth.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/server/src/__tests__/auth.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createAuthRoutes } from '../routes/auth.js';
import { createRequireAuth } from '../middleware/requireAuth.js';
import { hashPassword } from '../auth/passwords.js';

const COOKIE_SECRET = 'test-secret-cookie-test-secret-cookie';

async function makeApp() {
  const db = new Database(':memory:');
  initializeDb(db);
  const hash = await hashPassword('correct-horse-battery');
  db.prepare(
    `INSERT INTO users (email, password_hash, name, role, created_at)
     VALUES ('curt@example.com', ?, 'Curt', 'admin', datetime('now'))`,
  ).run(hash);
  const app = express();
  app.use(express.json());
  app.use(cookieParser(COOKIE_SECRET));
  app.use('/api/auth', createAuthRoutes(db));
  const requireAuth = createRequireAuth(db);
  app.get('/api/protected', requireAuth, (req, res) => res.json({ user: req.user }));
  return { app, db };
}

describe('auth routes', () => {
  let app: express.Express;
  let db: Database.Database;

  beforeEach(async () => {
    ({ app, db } = await makeApp());
  });
  afterEach(() => db.close());

  it('logs in with valid credentials and sets a cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'curt@example.com', password: 'correct-horse-battery' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'curt@example.com', name: 'Curt' });
    expect(res.headers['set-cookie']?.[0]).toMatch(/^sid=/);
  });

  it('rejects invalid password with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'curt@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('rejects unknown email with the same 401 message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('GET /me returns 401 without cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /me returns user with valid cookie', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({
      email: 'curt@example.com', password: 'correct-horse-battery',
    });
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('curt@example.com');
  });

  it('logout deletes the session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({
      email: 'curt@example.com', password: 'correct-horse-battery',
    });
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    const logout = await agent.post('/api/auth/logout');
    expect(logout.status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect(db.prepare('SELECT COUNT(*) as c FROM sessions').get()).toEqual({ c: 0 });
  });

  it('requireAuth rejects protected routes without a session', async () => {
    const res = await request(app).get('/api/protected');
    expect(res.status).toBe(401);
  });

  it('requireAuth allows protected routes with a valid session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({
      email: 'curt@example.com', password: 'correct-horse-battery',
    });
    const res = await agent.get('/api/protected');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('curt@example.com');
  });

  it('expired sessions are rejected and removed', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({
      email: 'curt@example.com', password: 'correct-horse-battery',
    });
    // Force expiry
    db.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 hour')").run();
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(db.prepare('SELECT COUNT(*) as c FROM sessions').get()).toEqual({ c: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test --workspace=packages/server -- auth.test
```

Expected: FAIL — `createAuthRoutes` not found.

- [ ] **Step 3: Implement the routes**

```ts
// packages/server/src/routes/auth.ts
import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { verifyPassword } from '../auth/passwords.js';
import {
  createSession,
  deleteSession,
  findUserByEmail,
  findValidSession,
  touchLastLogin,
} from '../auth/sessions.js';

const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_MAX_AGE_MS,
    secure: process.env.COOKIE_SECURE === 'true',
    signed: true,
  };
}

export function createAuthRoutes(db: Database.Database): Router {
  const router = Router();

  router.post('/login', async (req: Request, res: Response) => {
    const email = typeof req.body?.email === 'string' ? req.body.email : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const user = findUserByEmail(db, email);
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const sid = createSession(db, user.id);
    touchLastLogin(db, user.id);
    res.cookie('sid', sid, cookieOptions());
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  });

  router.post('/logout', (req: Request, res: Response) => {
    const sid = req.signedCookies?.sid;
    if (typeof sid === 'string') deleteSession(db, sid);
    res.clearCookie('sid', { path: '/' });
    res.json({ ok: true });
  });

  router.get('/me', (req: Request, res: Response) => {
    const sid = req.signedCookies?.sid;
    if (typeof sid !== 'string' || sid.length === 0) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const resolved = findValidSession(db, sid);
    if (!resolved) {
      res.clearCookie('sid');
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    res.json({ user: resolved.user });
  });

  return router;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test --workspace=packages/server -- auth.test
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/auth.ts packages/server/src/__tests__/auth.test.ts
git commit -m "feat(auth): login, logout, me routes with tests"
```

---

## Phase 6 — User provisioning CLI

### Task 8: createUser CLI script

**Files:**
- Create: `packages/server/src/scripts/createUser.ts`
- Modify: `packages/server/package.json`

- [ ] **Step 1: Implement the script**

```ts
// packages/server/src/scripts/createUser.ts
import { getDb } from '../db.js';
import { hashPassword } from '../auth/passwords.js';
import { createInterface } from 'node:readline';
import { stdin, stdout, exit } from 'node:process';

interface Args {
  email?: string;
  name?: string;
  role?: string;
  password?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--email') { out.email = next; i++; }
    else if (a === '--name') { out.name = next; i++; }
    else if (a === '--role') { out.role = next; i++; }
    else if (a === '--password') { out.password = next; i++; }
  }
  return out;
}

function prompt(question: string, silent = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    if (silent) {
      const stdoutAny = stdout as unknown as { write: (s: string) => void };
      const origWrite = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
        if (s.startsWith(question)) origWrite.call(rl, s);
        else origWrite.call(rl, '');
        void stdoutAny;
      };
    }
    rl.question(question, (ans) => {
      rl.close();
      if (silent) stdout.write('\n');
      resolve(ans.trim());
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email ?? (await prompt('Email: '));
  const name = args.name ?? (await prompt('Name: '));
  const role = args.role ?? 'staff';
  const password = args.password ?? (await prompt('Password (min 10 chars): ', true));

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Invalid email format');
    exit(1);
  }
  if (password.length < 10) {
    console.error('Password must be at least 10 characters');
    exit(1);
  }
  if (role !== 'staff' && role !== 'admin') {
    console.error("Role must be 'staff' or 'admin'");
    exit(1);
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    console.error(`User with email ${email} already exists`);
    exit(1);
  }
  const hash = await hashPassword(password);
  const result = db
    .prepare(
      `INSERT INTO users (email, password_hash, name, role, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    )
    .run(email.toLowerCase().trim(), hash, name, role);
  console.log(`User created: id=${result.lastInsertRowid}, email=${email}, role=${role}`);
}

main().catch((err) => {
  console.error(err);
  exit(1);
});
```

- [ ] **Step 2: Add npm script**

Open `packages/server/package.json`. In `"scripts"`, add:

```json
"create-user": "tsx src/scripts/createUser.ts"
```

- [ ] **Step 3: Manual verification (local)**

```bash
npm run create-user --workspace=packages/server -- --email test@example.com --name "Test" --password "testpassword12"
```

Expected: `User created: id=1, email=test@example.com, role=staff`.

Running it again should fail with `User with email test@example.com already exists`.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/scripts/createUser.ts packages/server/package.json
git commit -m "feat(auth): createUser CLI for provisioning"
```

---

## Phase 7 — Rate limiting

### Task 9: Rate limiter module

**Files:**
- Create: `packages/server/src/middleware/rateLimiters.ts`

- [ ] **Step 1: Implement**

```ts
// packages/server/src/middleware/rateLimiters.ts
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

function userOrIp(req: Request): string {
  if (req.user?.id) return `u:${req.user.id}`;
  return `ip:${ipKeyGenerator(req.ip ?? '')}`;
}

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? '')}`,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many requests', retryAfter: 900 });
  },
});

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userOrIp,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many requests', retryAfter: 900 });
  },
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userOrIp,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many requests', retryAfter: 3600 });
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/middleware/rateLimiters.ts
git commit -m "feat: rate limiter instances"
```

---

### Task 10: Login rate limiter test

**Files:**
- Create: `packages/server/src/__tests__/rateLimiting.test.ts`

- [ ] **Step 1: Write the test**

```ts
// packages/server/src/__tests__/rateLimiting.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createAuthRoutes } from '../routes/auth.js';
import { loginLimiter } from '../middleware/rateLimiters.js';

const COOKIE_SECRET = 'test-secret-cookie-test-secret-cookie';

function makeApp() {
  const db = new Database(':memory:');
  initializeDb(db);
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use(cookieParser(COOKIE_SECRET));
  // Apply limiter only to /login, matching production wiring
  app.use('/api/auth/login', loginLimiter);
  app.use('/api/auth', createAuthRoutes(db));
  return { app, db };
}

describe('login rate limiter', () => {
  let app: express.Express;
  let db: Database.Database;

  beforeEach(() => { ({ app, db } = makeApp()); });
  afterEach(() => db.close());

  it('returns 429 after 10 attempts from the same IP within the window', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'x@y.com', password: 'nope' });
      expect(res.status).toBe(401);
    }
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'x@y.com', password: 'nope' });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Too many requests');
  });
});
```

- [ ] **Step 2: Run**

```bash
npm test --workspace=packages/server -- rateLimiting
```

Expected: 1 test passes.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/__tests__/rateLimiting.test.ts
git commit -m "test: login rate limiter enforces 10/15min"
```

---

## Phase 8 — Wire middleware in production index.ts

### Task 11: Update server entry with middleware chain

**Files:**
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Verify current state**

```bash
grep -n "app.use\|app.listen" packages/server/src/index.ts
```

Note existing middleware order. You will insert the new middleware between `cors`/`json` and the route mounts.

- [ ] **Step 2: Apply the edit**

Open `packages/server/src/index.ts`. Replace the existing block:

```ts
app.use(cors());
app.use(express.json());

const storeDriver = (process.env.INVENTORY_STORE_DRIVER ?? 'sqlite').toLowerCase();
const store = storeDriver === 'supabase'
  ? createSupabaseInventoryStoreFromEnv()
  : createSqliteInventoryStore(getDb());
```

with:

```ts
app.use(cors({ credentials: true }));
app.use(express.json());

const COOKIE_SECRET = process.env.COOKIE_SECRET;
if (process.env.NODE_ENV === 'production' && !COOKIE_SECRET) {
  console.error('COOKIE_SECRET is required in production');
  process.exit(1);
}
app.use(cookieParser(COOKIE_SECRET ?? 'dev-insecure-secret-change-me'));

const storeDriver = (process.env.INVENTORY_STORE_DRIVER ?? 'sqlite').toLowerCase();
const store = storeDriver === 'supabase'
  ? createSupabaseInventoryStoreFromEnv()
  : createSqliteInventoryStore(getDb());

const db = getDb();
const requireAuth = createRequireAuth(db);

// Public, unlimited
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', store: storeDriver });
});

// Auth routes: login is rate-limited by IP; logout/me are light
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', createAuthRoutes(db));

// Everything below requires auth
app.use('/api', requireAuth);

// Global per-user limiter for authed traffic
app.use('/api', globalLimiter);

// AI-endpoint limiter (stricter)
app.use('/api/forecasts', aiLimiter);
app.use('/api/invoices', aiLimiter);
app.use('/api/recipe-intelligence', aiLimiter);
app.use('/api/allergy-assistant', aiLimiter);
```

At the top of the file, add the imports (alongside existing imports):

```ts
import cookieParser from 'cookie-parser';
import { createAuthRoutes } from './routes/auth.js';
import { createRequireAuth } from './middleware/requireAuth.js';
import { loginLimiter, globalLimiter, aiLimiter } from './middleware/rateLimiters.js';
```

Remove the duplicate `/api/health` route further down in the file if present (it moved above `requireAuth`).

- [ ] **Step 3: Build to check TS**

```bash
npm run build --workspace=packages/server
```

Expected: no errors.

- [ ] **Step 4: Run all server tests**

```bash
npm test --workspace=packages/server
```

Expected: all tests pass. Existing route tests use their own mini-apps (see `items.test.ts:9-17`) so the new middleware chain does not break them.

- [ ] **Step 5: Manual smoke test**

In a terminal:

```bash
export COOKIE_SECRET=$(openssl rand -hex 32)
npm run dev
```

In another terminal:

```bash
# Unauthenticated — should get 401
curl -i http://localhost:3001/api/items

# Health check — should get 200
curl -i http://localhost:3001/api/health

# Create a user
npm run create-user --workspace=packages/server -- --email me@me.com --name "Me" --password "testpassword12"

# Log in — should get 200 with Set-Cookie
curl -i -c cookies.txt -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"me@me.com","password":"testpassword12"}'

# Authenticated — should get 200
curl -i -b cookies.txt http://localhost:3001/api/items
```

Expected: the four behaviors above match.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat: wire auth, cookie parser, rate limiters into server"
```

---

## Phase 9 — Client: auth context and login page

### Task 12: Update fetchJson to send cookies and surface 401

**Files:**
- Modify: `packages/client/src/api.ts:1200-1212`

- [ ] **Step 1: Apply the edit**

Replace the existing `fetchJson` function:

```ts
async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('fifoflow:unauthenticated'));
    const error = await res.json().catch(() => ({ error: 'Not authenticated' }));
    throw new Error(typeof error.error === 'string' ? error.error : 'Not authenticated');
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    const msg = typeof error.error === 'string' ? error.error : res.statusText;
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
```

Note: `credentials: 'include'` is set before the spread so callers can override it if ever needed.

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/api.ts
git commit -m "feat(client): send credentials on every fetch; emit event on 401"
```

---

### Task 13: AuthContext

**Files:**
- Create: `packages/client/src/contexts/AuthContext.tsx`
- Create: `packages/client/src/hooks/useAuth.ts`

- [ ] **Step 1: Write the context**

```tsx
// packages/client/src/contexts/AuthContext.tsx
import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';

export interface AuthedUser {
  id: number;
  email: string;
  name: string;
  role: string;
}

export interface AuthContextValue {
  user: AuthedUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchMe(): Promise<AuthedUser | null> {
  const res = await fetch('/api/auth/me', { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Failed to fetch current user');
  const body = await res.json();
  return body.user as AuthedUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const onUnauth = () => setUser(null);
    window.addEventListener('fifoflow:unauthenticated', onUnauth);
    return () => window.removeEventListener('fifoflow:unauthenticated', onUnauth);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(body.error ?? 'Login failed');
    }
    const body = await res.json();
    setUser(body.user as AuthedUser);
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 2: Write the hook**

```ts
// packages/client/src/hooks/useAuth.ts
import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from '../contexts/AuthContext';

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/contexts/AuthContext.tsx packages/client/src/hooks/useAuth.ts
git commit -m "feat(client): AuthContext and useAuth hook"
```

---

### Task 14: LoginPage

**Files:**
- Create: `packages/client/src/pages/LoginPage.tsx`

- [ ] **Step 1: Write the page**

```tsx
// packages/client/src/pages/LoginPage.tsx
import { useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F1419] text-white">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 p-6 bg-slate-900/50 rounded-lg border border-slate-800">
        <h1 className="text-xl font-semibold">FifoFlow</h1>
        <div>
          <label className="block text-sm mb-1">Email</label>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded bg-slate-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Password</label>
          <input
            type="password"
            autoComplete="current-password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded bg-slate-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        {error && <div className="text-red-400 text-sm">{error}</div>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded px-4 py-2 font-medium"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/pages/LoginPage.tsx
git commit -m "feat(client): LoginPage"
```

---

### Task 15: Wire AuthProvider into App

**Files:**
- Modify: `packages/client/src/App.tsx`

- [ ] **Step 1: Read the current App.tsx**

```bash
cat packages/client/src/App.tsx
```

Identify the existing root (usually `<QueryClientProvider>` wrapping a router or Layout).

- [ ] **Step 2: Apply the edit**

Wrap the existing root in `<AuthProvider>` and gate rendering with `useAuth`.

Add to the top of the file:

```tsx
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
```

Split the existing `App` component so the authenticated part becomes a child component that calls `useAuth`, and the exported `App` wraps everything in `AuthProvider`. Example transformation — replace the existing exported `App` component with:

```tsx
function AuthedApp() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return <div className="min-h-screen bg-[#0F1419]" />;
  }
  if (!user) {
    return <LoginPage />;
  }
  // Return what the previous App component returned (Layout, Router, etc.)
  return <ExistingAppContent />;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthedApp />
    </AuthProvider>
  );
}
```

Rename the previous exported App to `ExistingAppContent` (not exported), keeping its body and its existing providers (`<QueryClientProvider>`, etc.) inside it. The `QueryClientProvider` stays wrapping the routes, not wrapping the login page — so the order from outer to inner is: `AuthProvider → AuthedApp → QueryClientProvider → Layout/Router`.

- [ ] **Step 3: Build client**

```bash
npm run build --workspace=packages/client
```

Expected: no TS errors.

- [ ] **Step 4: Manual smoke test**

With server running (from Task 11 smoke test) and `COOKIE_SECRET` set:

```bash
npm run dev  # from repo root
```

Open http://localhost:5173. Expected:
1. Login page renders.
2. Submit with the user you created: app loads.
3. Click logout (you'll add it in Task 16): redirected back to login.
4. Refresh while logged in: stays logged in.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/App.tsx
git commit -m "feat(client): gate app behind AuthProvider + login page"
```

---

### Task 16: Logout button in Layout

**Files:**
- Modify: `packages/client/src/components/Layout.tsx`

- [ ] **Step 1: Read Layout**

```bash
cat packages/client/src/components/Layout.tsx
```

- [ ] **Step 2: Add logout button**

At the top:

```tsx
import { useAuth } from '../hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
```

Inside the component function body, add:

```tsx
const { user, logout } = useAuth();
const queryClient = useQueryClient();
async function handleLogout() {
  await logout();
  queryClient.clear();
}
```

In the header JSX, add a button (position depends on existing layout — typically next to the app title or in the top-right):

```tsx
{user && (
  <div className="flex items-center gap-3 text-sm">
    <span className="text-slate-400">{user.name}</span>
    <button
      type="button"
      onClick={handleLogout}
      className="text-slate-300 hover:text-white underline underline-offset-2"
    >
      Log out
    </button>
  </div>
)}
```

- [ ] **Step 3: Build + smoke test**

```bash
npm run build --workspace=packages/client
```

Then repeat the smoke test from Task 15 step 4 — confirm logout works.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/Layout.tsx
git commit -m "feat(client): logout button in layout header"
```

---

## Phase 10 — Backups (Litestream)

### Task 17: Create Litestream config

**Files:**
- Create: `litestream.yml`

- [ ] **Step 1: Write the config**

```yaml
# litestream.yml
dbs:
  - path: /data/fifoflow.db
    replicas:
      - type: s3
        endpoint: https://nyc3.digitaloceanspaces.com
        bucket: fifoflow-backups
        path: prod/fifoflow
        region: us-east-1
        retention: 720h
        snapshot-interval: 24h
        sync-interval: 10s
```

If your droplet is closer to a different DO region, swap `nyc3` for that region (e.g. `sfo3`, `sgp1`).

- [ ] **Step 2: Commit**

```bash
git add litestream.yml
git commit -m "feat(backup): litestream config replicating to DO Spaces"
```

---

### Task 18: Add Litestream sidecar to docker-compose

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Apply the edit**

Replace the existing docker-compose.yml with:

```yaml
services:
  fifoflow:
    build: .
    ports:
      - "3001:3001"
    env_file:
      - .env
    volumes:
      - fifoflow-data:/app/packages/server/data
    restart: unless-stopped

  litestream:
    image: litestream/litestream:0.3
    restart: unless-stopped
    depends_on:
      - fifoflow
    volumes:
      - fifoflow-data:/data
      - ./litestream.yml:/etc/litestream.yml:ro
    environment:
      LITESTREAM_ACCESS_KEY_ID: ${DO_SPACES_KEY}
      LITESTREAM_SECRET_ACCESS_KEY: ${DO_SPACES_SECRET}
    command: replicate

volumes:
  fifoflow-data:
```

Note: the `fifoflow` volume is mounted at `/app/packages/server/data` in the app container but at `/data` in the Litestream container. The `litestream.yml` references `/data/fifoflow.db` — that matches.

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(backup): litestream sidecar in docker-compose"
```

---

### Task 19: Write backup setup runbook

**Files:**
- Create: `docs/runbooks/backup-setup.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Litestream backup setup (one-time)

## 1. Create the Spaces bucket

1. Log in to DigitalOcean.
2. Spaces → Create a Spaces Bucket.
3. Region: NYC3 (match `litestream.yml`). Change both if you use a different region.
4. Name: `fifoflow-backups`.
5. File Listing: Restricted.
6. Create.

## 2. Create access keys

1. API → Spaces Keys → Generate New Key.
2. Name: `fifoflow-litestream`.
3. Copy the access key and secret immediately — the secret is shown once.

## 3. Install on droplet

SSH to the droplet:

```bash
ssh root@64.227.108.209
cd /opt/FifoFlow
```

Edit `.env` and add:

```
DO_SPACES_KEY=<access key from step 2>
DO_SPACES_SECRET=<secret from step 2>
```

## 4. Pull and deploy

```bash
git pull
docker compose up -d --build
```

## 5. Verify replication

```bash
docker compose logs -f litestream
```

Within 10–30 seconds you should see lines like:

```
litestream | level=INFO msg="replicating db" db=/data/fifoflow.db replica=s3
litestream | level=INFO msg="snapshot written" ...
```

## 6. Verify in Spaces console

DigitalOcean → Spaces → `fifoflow-backups` → you should see a `prod/fifoflow/` prefix containing `snapshots/` and `wal/` directories within a few minutes.

## Rotation / retention

- WAL segments retained 720 h (30 days) per `litestream.yml`.
- Snapshots taken every 24 h.
- Nothing else to manage; retention is enforced by Litestream.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/backup-setup.md
git commit -m "docs(backup): Litestream + DO Spaces setup runbook"
```

---

### Task 20: Write restore runbook

**Files:**
- Create: `docs/runbooks/restore-backup.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Restore FifoFlow database from Litestream backup

Use this when `fifoflow.db` is corrupt, accidentally wiped, or the droplet was rebuilt.

**RPO:** ~10 seconds (Litestream streams WAL every 10 s).

## Steps

SSH to the droplet:

```bash
ssh root@64.227.108.209
cd /opt/FifoFlow
source .env
```

Stop the app (Litestream can keep running):

```bash
docker compose stop fifoflow
```

Move the broken DB aside — never delete it outright, keep for forensics:

```bash
docker run --rm -v fifoflow_fifoflow-data:/data alpine \
  sh -c 'mv /data/fifoflow.db /data/fifoflow.db.broken-$(date +%Y%m%dT%H%M%S) 2>/dev/null || true'
```

(Adjust the volume name if your compose project prefix differs — check with `docker volume ls`.)

Restore the latest replica into the volume:

```bash
docker run --rm \
  -v fifoflow_fifoflow-data:/data \
  -e LITESTREAM_ACCESS_KEY_ID="$DO_SPACES_KEY" \
  -e LITESTREAM_SECRET_ACCESS_KEY="$DO_SPACES_SECRET" \
  litestream/litestream:0.3 \
  restore -o /data/fifoflow.db \
  s3://fifoflow-backups.nyc3.digitaloceanspaces.com/prod/fifoflow
```

Restart the app:

```bash
docker compose start fifoflow
```

Smoke test:

```bash
curl http://localhost:3001/api/health
# expect: {"status":"ok","store":"sqlite"}
```

Open the app in a browser and confirm items and recent transactions look correct.

## Point-in-time restore

Add `-timestamp '2026-04-21T03:15:00Z'` to the restore command to roll back to an earlier point. See [Litestream docs](https://litestream.io/reference/restore/).
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/restore-backup.md
git commit -m "docs(backup): Litestream restore runbook"
```

---

### Task 21: Verification script

**Files:**
- Create: `scripts/verify-backup.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# scripts/verify-backup.sh
# Manual monthly sanity check: restore latest replica to a scratch file
# and run integrity_check. Run from droplet after sourcing /opt/FifoFlow/.env.

set -euo pipefail

if [[ -z "${DO_SPACES_KEY:-}" || -z "${DO_SPACES_SECRET:-}" ]]; then
  echo "ERROR: DO_SPACES_KEY / DO_SPACES_SECRET not set. Source .env first." >&2
  exit 1
fi

SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT

echo "Restoring latest replica to $SCRATCH/fifoflow.db ..."
docker run --rm \
  -v "$SCRATCH":/out \
  -e LITESTREAM_ACCESS_KEY_ID="$DO_SPACES_KEY" \
  -e LITESTREAM_SECRET_ACCESS_KEY="$DO_SPACES_SECRET" \
  litestream/litestream:0.3 \
  restore -o /out/fifoflow.db \
  s3://fifoflow-backups.nyc3.digitaloceanspaces.com/prod/fifoflow

echo "Running integrity_check ..."
RESULT=$(docker run --rm -v "$SCRATCH":/d alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 /d/fifoflow.db "PRAGMA integrity_check;"')

echo "$RESULT"
if [[ "$RESULT" == "ok" ]]; then
  echo "OK: restored DB passes integrity check."
  exit 0
else
  echo "FAIL: integrity_check returned: $RESULT" >&2
  exit 1
fi
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/verify-backup.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-backup.sh
git commit -m "chore(backup): verify-backup.sh for monthly sanity check"
```

---

## Phase 11 — Final verification

### Task 22: Full test suite green

**Files:**
- (verification only)

- [ ] **Step 1: Run all tests**

```bash
npm test --workspace=packages/server
```

Expected: all existing tests plus the new `passwords`, `auth`, and `rateLimiting` suites pass.

- [ ] **Step 2: Full build**

```bash
npm run build
```

Expected: shared, server, client all build clean.

- [ ] **Step 3: End-to-end local smoke**

With `COOKIE_SECRET` set and a provisioned user:

```bash
export COOKIE_SECRET=$(openssl rand -hex 32)
npm run create-user --workspace=packages/server -- --email staff@example.com --name "Staff" --password "staffpassword12"
npm run dev
```

Open http://localhost:5173. Verify:
1. Login page shown when unauthenticated.
2. Login succeeds, app loads.
3. Refresh keeps session.
4. Logout returns to login page.
5. Unauthenticated `curl http://localhost:3001/api/items` returns 401.

- [ ] **Step 4: Rate-limit smoke**

```bash
for i in {1..11}; do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3001/api/auth/login \
    -H 'Content-Type: application/json' -d '{"email":"x@y.com","password":"nope"}'
done
```

Expected: ten `401`s then one `429`.

- [ ] **Step 5: No-op commit with release notes**

```bash
git commit --allow-empty -m "chore: week 1 security hardening — verification complete

Auth (session cookies), rate limiting (login/global/AI), and Litestream
backups all deployed behind the /api/* auth gate. TLS still deferred;
COOKIE_SECURE=false until then.

Operator follow-up:
- Provision first admin user with: npm run create-user --workspace=packages/server
- Create DO Spaces bucket per docs/runbooks/backup-setup.md
- Add DO_SPACES_KEY, DO_SPACES_SECRET, COOKIE_SECRET to /opt/FifoFlow/.env
- Deploy in order: backups → rate limiting → auth (see spec §6)"
```

---

## Deployment order (operator, after merge to master)

1. **Bootstrap user**: `ssh root@64.227.108.209 "cd /opt/FifoFlow && git pull && docker compose run --rm fifoflow npm run create-user --workspace=packages/server -- --email you@example.com --name 'You' --role admin --password '<strong>'"`.
2. **Set env**: SSH to droplet, add `COOKIE_SECRET=$(openssl rand -hex 32)`, `DO_SPACES_KEY`, `DO_SPACES_SECRET` to `/opt/FifoFlow/.env`.
3. **Create Spaces bucket + keys** per `docs/runbooks/backup-setup.md`.
4. **Deploy**: `docker compose up -d --build`.
5. **Verify replication**: `docker compose logs litestream` should show `replicating db` within 30 s.
6. **Verify auth**: open http://64.227.108.209/ — should redirect to login; log in with provisioned user.
