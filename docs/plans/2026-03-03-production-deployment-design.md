# Production Deployment Design

Deploy FifoFlow to a DigitalOcean Droplet using Docker, with Supabase as the production database and Caddy as a reverse proxy. The Droplet will host multiple projects.

## Architecture

- **Hosting**: Single DigitalOcean Droplet ($6-12/mo) running Docker
- **Database**: Supabase (production), SQLite (local dev)
- **Reverse Proxy**: Caddy (auto-HTTPS when domain is added)
- **Container**: Stateless — no volumes needed (Supabase handles persistence)
- **Deploy**: Manual `docker compose up -d` via SSH

## Dockerfile (Multi-stage)

Stage 1 (builder): Install all deps, run `npm run build` (shared → server → client).

Stage 2 (production): Copy only production deps for shared + server, plus compiled dist folders for all three packages. Uses `node:22-alpine` for small image.

- `NODE_ENV=production`
- `PORT=3001`
- Entry point: `node packages/server/dist/index.js`

## Express Static File Serving

In production, the Express server serves the Vite-built client:

1. `express.static()` middleware pointing at `packages/client/dist`
2. Catch-all `GET *` route that serves `index.html` for SPA routing (after all `/api` routes)
3. Only enabled when `NODE_ENV=production`

## Environment Config

`.env.example`:
```
NODE_ENV=production
PORT=3001
INVENTORY_STORE_DRIVER=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Local dev uses no `.env` — defaults to SQLite on port 3001.

## docker-compose.yml

Single service, no volumes. Reads env from `.env` file. Restart policy `unless-stopped`.

## .dockerignore

Excludes node_modules, dist, .git, data folder, markdown files.

## Droplet Setup (one-time)

1. Create Droplet with Docker pre-installed
2. Install Caddy
3. Clone repo, create `.env`
4. `docker compose up -d`
5. Access via `http://DROPLET_IP:3001` (or configure Caddy with domain later)

## Caddy Config (when domain is added)

```
fifoflow.yourdomain.com {
    reverse_proxy localhost:3001
}
```

Automatic HTTPS via Let's Encrypt, zero additional config.

## Files to Create/Modify

| File | Action |
|---|---|
| `Dockerfile` | Create |
| `docker-compose.yml` | Create |
| `.dockerignore` | Create |
| `.env.example` | Create |
| `packages/server/src/index.ts` | Modify — add static serving + SPA fallback |
