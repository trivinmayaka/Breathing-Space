# TrivinFX Pro

A Forex trading simulator platform with a demo account terminal, live real-account trading, and an admin dashboard.

## Run & Operate

- `pnpm --filter @workspace/forex-simulator run dev` — run the TrivinFX Pro frontend
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secrets: `ADMIN_PASSWORD` — password for the admin dashboard; `DATABASE_URL` is provided by Replit's managed PostgreSQL

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/forex-simulator` — React/Vite frontend and public trading experience
- `artifacts/api-server` — Express API and admin routes
- `lib/db` — Drizzle schema and database client
- `lib/api-spec` — OpenAPI source of truth and generated client contracts

## Architecture decisions

- The imported pnpm workspace and existing React/Vite + Express stack are kept intact.
- The frontend and API are registered as separate Replit artifacts with managed workflows.

## Product

TrivinFX Pro provides demo and real-account Forex trading experiences, market data displays,
trading terminals, and an admin dashboard for account and platform management.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Admin routes return a configuration error until the `ADMIN_PASSWORD` Replit secret exists.
- The API health check is available at `/api/healthz`.
- The current API production build starts successfully; the workspace typecheck still reports
  pre-existing typing errors in several API route files.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
