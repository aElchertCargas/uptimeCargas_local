# Uptime Cargas

Internal uptime monitoring dashboard with authentication. Tracks HTTP endpoints, sends notifications via webhook and Pushover when monitors go down/up. Syncs with the Energy Customers API to auto-manage monitors.

## Features

- **Secure Authentication**: NextAuth.js with username/password login (see [AUTH_SETUP.md](./AUTH_SETUP.md) for details)
- **Monitor Management**: CRUD API for HTTP/HTTPS monitors
- **API Sync**: Auto-sync monitors from Energy Customers API with exclusion patterns
- **Notifications**: Webhook and Pushover alerts
- **Performance**: Materialized stats, batch processing, configurable retention
- **Dashboard**: Real-time status, uptime graphs, response time charts

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

### 3. Configure environment

Copy `.env` and update the values:

```bash
# Generate a secure AUTH_SECRET
openssl rand -base64 32

# Update AUTH_USER_EMAIL and AUTH_USER_PASSWORD_HASH
# To hash a password:
npm run hash-password yourpassword
```

**Default login credentials:**
- Email: `admin@uptimecargas.local`
- Password: `changeme`

**⚠️ IMPORTANT: Change the password before deploying to production!**

### 4. Seed sample data (optional)

```bash
npm run db:seed
```

### 5. Run dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in.

## Docker Compose (optional, full stack)

```bash
docker compose up
```

Starts Postgres and the app. Uses the included `Dockerfile` for local builds. Railway deployments use Railpack instead (see `railway.json`).

## Deploy to Railway

Railway uses **Railpack** to build this app (no Dockerfile required). The build runs `prisma generate` and `next build` automatically.

1. Create a new project on Railway
2. Add a PostgreSQL service and connect it to your app
3. Connect this GitHub repo
4. Set environment variables:
   - `DATABASE_URL` (auto-set by linking Railway Postgres)
   - `CRON_SECRET` (any random string for cron auth)
   - `ENERGY_API_URL` (Energy Customers API endpoint)
   - `ENERGY_API_KEY` (API key for Energy Customers)
   - `AUTH_SECRET` (run `openssl rand -base64 32`)
   - `AUTH_URL` (your Railway domain, e.g., `https://uptimecargas-production.up.railway.app`)
   - `AUTH_TRUST_HOST` (set to `true` — required for NextAuth behind Railway's proxy)
   - `AUTH_USER_NAME` (admin display name)
   - `AUTH_USER_EMAIL` (admin email/username)
   - `AUTH_USER_PASSWORD_HASH` (bcrypt hash of your password)
5. Deploy

**Generate a password hash:**
```bash
npm run hash-password your-secure-password
```

**Automated checks:** Set up a Railway cron job that POSTs to `/api/cron/check` with `Authorization: Bearer <CRON_SECRET>` every 60 seconds.

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
| `AUTH_SECRET` | NextAuth.js secret (32+ char random string) | Required |
| `AUTH_URL` | Base URL of the application | Required |
| `AUTH_TRUST_HOST` | Must be `true` for Railway/proxy deployments | Required on Railway |
| `AUTH_USER_NAME` | Admin user display name | "admin" |
| `AUTH_USER_EMAIL` | Admin user email/username | "admin@uptimecargas.local" |
| `AUTH_USER_PASSWORD_HASH` | Bcrypt hash of admin password | "changeme" (hashed) |

## Tech Stack

- Next.js 16 (App Router)
- PostgreSQL + Prisma 7
- NextAuth.js v5 (authentication)
- shadcn/ui + Tailwind CSS v4
- TanStack React Query
- Recharts
