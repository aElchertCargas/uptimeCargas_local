# Uptime Cargas

Internal uptime monitoring dashboard. Tracks HTTP endpoints, sends notifications via webhook and Pushover when monitors go down/up. Syncs with the Energy Customers API to auto-manage monitors.

## Quick Start (Local)

### 1. Start Postgres

```bash
docker run --name uptime-pg \
  -e POSTGRES_USER=uptime \
  -e POSTGRES_PASSWORD=uptime_dev \
  -e POSTGRES_DB=uptime_cargas \
  -p 5433:5432 -d postgres:16-alpine
```

Or use `docker compose up db` if you have the compose plugin.

### 2. Install and migrate

```bash
npm install
npx prisma generate
npx prisma db push
```

### 3. Seed sample data (optional)

```bash
npm run db:seed
```

### 4. Run dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Docker Compose (full stack)

```bash
docker compose up
```

This starts both Postgres and the Next.js app. The app runs at `http://localhost:3000`.

## Deploy to Railway

1. Create a new project on Railway
2. Add a PostgreSQL service
3. Connect this repo
4. Set environment variables:
   - `DATABASE_URL` (auto-set by Railway Postgres)
   - `CRON_SECRET` (any random string)
   - `ENERGY_API_URL` (Energy Customers API endpoint)
   - `ENERGY_API_KEY` (API key for Energy Customers)
5. Deploy

For automated checks, set up a Railway cron job that POSTs to `/api/cron/check` with `Authorization: Bearer <CRON_SECRET>` every 60 seconds.

## API

| Endpoint | Method | Description |
|---|---|---|
| `/api/monitors` | GET | List all monitors |
| `/api/monitors` | POST | Create monitor |
| `/api/monitors/:id` | GET | Get monitor details |
| `/api/monitors/:id` | PUT | Update monitor |
| `/api/monitors/:id` | DELETE | Delete monitor |
| `/api/monitors/:id/checks` | GET | Paginated check history |
| `/api/monitors/bulk-interval` | PUT | Bulk update check interval |
| `/api/notifications` | GET | List notification channels |
| `/api/notifications` | POST | Create channel |
| `/api/notifications/:id` | PUT | Update channel |
| `/api/notifications/:id` | DELETE | Delete channel |
| `/api/notifications/:id/test` | POST | Send test notification |
| `/api/excluded-patterns` | GET | List excluded patterns |
| `/api/excluded-patterns` | POST | Add excluded pattern |
| `/api/excluded-patterns/:id` | DELETE | Remove excluded pattern |
| `/api/sync` | GET | Compare API customers vs monitors |
| `/api/sync/bulk-add` | POST | Bulk-add monitors from sync |
| `/api/sync/bulk-delete` | POST | Bulk-delete stale monitors |
| `/api/stats` | GET | Dashboard stats |
| `/api/cron/check` | POST | Trigger check cycle |

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `CRON_SECRET` | Auth token for cron endpoint | Optional |
| `ENERGY_API_URL` | Energy Customers public URLs endpoint | Required for sync |
| `ENERGY_API_KEY` | API key for Energy Customers API | Required for sync |

## Tech Stack

- Next.js 15 (App Router)
- PostgreSQL + Prisma 7
- shadcn/ui + Tailwind CSS v4
- TanStack React Query
- Recharts
