# Production Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make FifoFlow deployable to a DigitalOcean Droplet via Docker, with Supabase as the production database and the Express server serving the built frontend.

**Architecture:** Single Docker container runs the Express server which serves both API routes and the Vite-built static frontend. Supabase handles persistence in production; SQLite stays for local dev. Caddy on the Droplet handles reverse proxy and HTTPS.

**Tech Stack:** Docker (multi-stage build, node:22-alpine), Express static middleware, docker-compose, Caddy

---

### Task 1: Add static file serving to Express server

**Files:**
- Modify: `packages/server/src/index.ts`

**Step 1: Add path import**

Add `import path from 'node:path';` and `import { fileURLToPath } from 'node:url';` at the top of the file (after existing imports).

```typescript
import path from 'node:path';
import { fileURLToPath } from 'node:url';
```

**Step 2: Add static serving + SPA fallback after all API routes**

Insert this block AFTER the `/api/health` route and BEFORE the error handler middleware (between lines 33 and 35):

```typescript
// In production, serve the Vite-built client
if (process.env.NODE_ENV === 'production') {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}
```

Note: `path` and `fileURLToPath` may already be available if `db.ts` uses them, but `index.ts` does not import them yet. The `__dirname` / `__filename` trick is needed because the project uses ES modules (`"type": "module"`).

**Step 3: Verify server still compiles**

Run: `npm run build --workspace=packages/server`
Expected: Clean compilation to `packages/server/dist/`

**Step 4: Verify existing tests still pass**

Run: `npm test --workspace=packages/server`
Expected: All tests pass (static serving only activates when NODE_ENV=production)

**Step 5: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat: serve static frontend from Express in production

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Create .env.example

**Files:**
- Create: `.env.example`

**Step 1: Create the file**

Create `.env.example` in the project root:

```
# Production environment
NODE_ENV=production
PORT=3001

# Database driver: "sqlite" (default) or "supabase"
INVENTORY_STORE_DRIVER=supabase

# Supabase credentials (required when INVENTORY_STORE_DRIVER=supabase)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Step 2: Verify .env is already in .gitignore**

Check: `.gitignore` should contain `.env` (it does — confirmed during exploration).
The `.env.example` file is NOT in `.gitignore` and will be committed (this is intentional).

**Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: add .env.example with production config template

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Create .dockerignore

**Files:**
- Create: `.dockerignore`

**Step 1: Create the file**

Create `.dockerignore` in the project root:

```
node_modules
dist
packages/*/node_modules
packages/*/dist
packages/server/data
.git
.env
*.md
.DS_Store
```

**Step 2: Commit**

```bash
git add .dockerignore
git commit -m "chore: add .dockerignore for clean Docker builds

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Create Dockerfile

**Files:**
- Create: `Dockerfile`

**Step 1: Create the Dockerfile**

Create `Dockerfile` in the project root:

```dockerfile
# Stage 1: Build everything
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package files for all workspaces
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy source code
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY packages/client/ packages/client/

# Build all packages: shared -> server -> client
RUN npm run build

# Stage 2: Production image
FROM node:22-alpine
WORKDIR /app

# Copy package files for production install
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

# Install production dependencies only
RUN npm ci --omit=dev --workspace=packages/shared --workspace=packages/server

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/client/dist packages/client/dist

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "packages/server/dist/index.js"]
```

**Step 2: Verify Docker build works**

Run: `docker build -t fifoflow .`
Expected: Builds successfully. Final image should be ~150-200MB.

If Docker is not available locally, skip this verification — it will be tested on the Droplet.

**Step 3: Commit**

```bash
git add Dockerfile
git commit -m "feat: add multi-stage Dockerfile for production builds

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Create docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

**Step 1: Create the file**

Create `docker-compose.yml` in the project root:

```yaml
services:
  fifoflow:
    build: .
    ports:
      - "3001:3001"
    env_file:
      - .env
    restart: unless-stopped
```

**Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add docker-compose.yml for production deployment

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Update .gitignore for Docker artifacts

**Files:**
- Modify: `.gitignore`

**Step 1: Add Docker-related ignores**

Append to `.gitignore`:

```
*.db-shm
*.db-wal
```

These SQLite WAL files are already showing up as untracked (visible in git status). They should not be committed.

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add SQLite WAL files to .gitignore

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Verify full build pipeline

**Step 1: Run the full monorepo build**

Run: `npm run build`
Expected: shared, server, and client all build successfully.

**Step 2: Test production mode locally (optional)**

If you want to verify the static serving works locally:

```bash
NODE_ENV=production node packages/server/dist/index.js
```

Then visit `http://localhost:3001` — you should see the FifoFlow frontend served by Express. API calls should work if using SQLite (default driver).

Note: This step is optional. If Supabase is the intended production driver, the full end-to-end test will happen on the Droplet.

**Step 3: Run existing tests**

Run: `npm test --workspace=packages/server`
Expected: All tests pass. The static serving code is gated behind `NODE_ENV=production` so tests (which run without that env var) are unaffected.
