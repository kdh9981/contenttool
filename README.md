# ContentTool

AI-powered content intelligence and creation platform.

## Stack

- **Frontend**: Next.js 14 (App Router, TypeScript, Tailwind) — `apps/web/`
- **Database**: Supabase (PostgreSQL) — `supabase/`
- **Hosting**: Vercel (auto-deploy on push to `main`)

## Local Setup

```bash
# 1. Install deps
cd apps/web && npm install

# 2. Set env vars
cp .env.example apps/web/.env.local
# Fill in Supabase URL + keys from the dashboard

# 3. Run dev server
cd apps/web && npm run dev
```

## Deploy

Push to `main` → Vercel auto-deploys. PRs get preview URLs.

## Health Check

`GET /api/health` — returns `{ status: "ok", db: "connected" }` when DB is reachable.
