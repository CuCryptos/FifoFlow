# FifoFlow

Inventory management system for multi-venue Hawaiian F&B hospitality (Star of Honolulu, Rock a Hula).

## Tech Stack

- **Monorepo**: npm workspaces — `packages/shared`, `packages/server`, `packages/client`
- **Backend**: Express + better-sqlite3 + TypeScript
- **Frontend**: React 19 + Vite + Tailwind CSS v4 + TanStack Query
- **Validation**: Zod schemas in `packages/shared` (single source of truth)
- **Database**: SQLite at `packages/server/data/fifoflow.db`
- **AI**: Anthropic Claude Sonnet for PDF parsing (invoices, forecasts)

## Commands

```bash
npm run dev          # Start server (3001) + client (5173)
npm run build        # Build all packages (shared → server → client)
npm test --workspace=packages/server  # Run server tests
```

## Architecture

- SQLite migrations in `packages/server/src/db.ts` use `pragma('table_info(...)') + ALTER TABLE ADD COLUMN` pattern
- `current_qty` is a running total updated atomically per transaction
- All store methods defined in `packages/server/src/store/types.ts` (InventoryStore interface)
- Implemented in `sqliteStore.ts`; `supabaseStore.ts` has stubs
- Express routes in `packages/server/src/routes/*.ts`
- Client API methods in `packages/client/src/api.ts`
- TanStack Query hooks in `packages/client/src/hooks/*.ts`

## Key Patterns

- **New DB column**: Add migration in `db.ts` using `addColumnIfMissing` or pragma check → ALTER TABLE. Add to shared types + schemas. Add to store interface + implementation + supabase stub.
- **New API endpoint**: Add route in `routes/*.ts` → store method in `types.ts` + `sqliteStore.ts` + `supabaseStore.ts` stub → API client in `api.ts` → TanStack hook in `hooks/*.ts`
- **Order qty rounding**: `ceilHalf(n) = Math.ceil(n * 2) / 2` rounds up to nearest 0.5
- **Venue filtering**: `show_in_menus` flag controls visibility on menu/calculate pages

## Deployment

```bash
ssh root@64.227.108.209 "cd /opt/FifoFlow && git pull && docker compose up -d --build"
```

No CI/CD — manual deploy after push to master.
