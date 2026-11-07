# Deployment Guide

## Prerequisites

- Node.js 20+ and pnpm 10+ (`corepack enable` or `npm i -g pnpm`)
- PostgreSQL 14+ reachable from the API process (local install, Docker, or a managed instance)
- A Google AI Studio API key for Gemini if you want real AI extraction (optional — the app runs fully functional in demo mode without one)

## Installation

```bash
git clone <repo-url> cargolens-ai
cd cargolens-ai
pnpm install
pnpm --filter @cargolens/shared build
```

The `apps/web` and `apps/api` packages import `@cargolens/shared` as a compiled package (`dist/`), not raw TypeScript — rebuild it (`pnpm --filter @cargolens/shared build`, or `pnpm --filter @cargolens/shared dev` to watch) any time you change `packages/shared/src`.

## Database setup

Create a role and database for the app. Using `psql` against any Postgres instance you control:

```sql
CREATE ROLE cargolens LOGIN PASSWORD 'cargolens_dev';
ALTER ROLE cargolens CREATEDB; -- needed by `prisma migrate dev`'s shadow database
CREATE DATABASE cargolens_dev OWNER cargolens;
GRANT ALL PRIVILEGES ON DATABASE cargolens_dev TO cargolens;
```

(If you'd rather use Docker: `docker run -e POSTGRES_USER=cargolens -e POSTGRES_PASSWORD=cargolens_dev -e POSTGRES_DB=cargolens_dev -p 5432:5432 postgres:16-alpine`.)

## Environment variables

Copy the example files and fill them in:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

**`apps/api/.env`**

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Random secret for signing session JWTs (generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `JWT_EXPIRES_IN` | Session lifetime (e.g. `8h`) |
| `COOKIE_NAME` | httpOnly session cookie name |
| `PORT` | API port (default `4000`) |
| `WEB_ORIGIN` | Frontend origin, for CORS |
| `AI_PROVIDER` | `demo` (deterministic, no API key needed) or `gemini` (real multimodal extraction) |
| `GEMINI_API_KEY` | Required only when `AI_PROVIDER=gemini` |
| `GEMINI_MODEL` | e.g. `gemini-3.5-flash-lite` |
| `STORAGE_DRIVER` | `local` (filesystem adapter under `STORAGE_LOCAL_DIR`) |
| `STORAGE_LOCAL_DIR` | Directory for uploaded documents |

**`apps/web/.env.local`**

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_API_URL` | `/api` — the frontend talks to a same-origin path that Next.js rewrites to the API |
| `API_PROXY_ORIGIN` | Where Next.js forwards `/api/*` (e.g. `http://localhost:4000`) |

The frontend never calls the API cross-origin directly. Next.js's `rewrites()` proxy makes the browser see a single origin, which keeps the session cookie's `SameSite=Lax` setting working correctly in local dev (a direct cross-origin `fetch` would silently drop the cookie on GET requests like the document viewer).

## Migrate and seed

```bash
pnpm --filter api prisma:migrate   # applies prisma/migrations, creates the schema
pnpm --filter api db:seed          # demo users + two canonical example shipments + a few extras
```

The seed script is destructive to whatever is already in the target database (it clears and recreates all tables) — only point it at a dev/demo database.

## Run

```bash
pnpm --filter api dev    # http://localhost:4000
pnpm --filter web dev    # http://localhost:3000
```

Or build for production:

```bash
pnpm --filter @cargolens/shared build
pnpm --filter api build && pnpm --filter api start
pnpm --filter web build && pnpm --filter web start
```

## Deployment architecture

This is a two-process deployment: a stateless Express API (needs a reachable Postgres instance and a writable volume for `STORAGE_LOCAL_DIR` if you keep the local storage adapter) and a stateless Next.js server. In front of them, a reverse proxy (or the hosting platform's own routing — e.g. a Vercel/Netlify rewrite, or an nginx `location /api`) should perform the same same-origin proxying that `next.config.ts`'s `rewrites()` does in dev, so the session cookie keeps working. For a real multi-instance deployment, swap `STORAGE_DRIVER=local` for an S3-compatible adapter (the `StorageAdapter` interface in `apps/api/src/lib/storage/types.ts` is already provider-agnostic; only a new adapter class needs to be written) so uploaded documents don't live on a single instance's disk.

## Demo login credentials

| Role | Email | Password |
|---|---|---|
| Documentation Executive | `executive@cargolens.demo` | `Executive123!` |
| Documentation Manager | `manager@cargolens.demo` | `Manager123!` |

## Running the test suites

```bash
# Vitest: validation-engine unit tests + API integration tests (needs a second database)
createdb cargolens_test   # or the SQL equivalent, owned by the same `cargolens` role
DATABASE_URL="postgresql://cargolens:cargolens_dev@localhost:5432/cargolens_test" pnpm --filter api exec prisma migrate deploy
pnpm --filter api test

# Playwright end-to-end lifecycle test (both dev servers must be reachable, or let Playwright's webServer config start them)
pnpm --filter web exec playwright install chromium   # first time only
pnpm --filter web exec playwright test
```
