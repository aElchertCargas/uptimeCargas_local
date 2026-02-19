# Uptime Cargas

Internal uptime monitoring dashboard with authentication. Tracks HTTP endpoints, sends notifications via webhook and Pushover when monitors go down/up. Syncs with the Energy Customers API to auto-manage monitors.

## Features

- **Secure Authentication**: NextAuth.js with username/password login
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
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('yourpassword', 10).then(console.log)"
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
   - `CRON_SECRET` (any random string for cron auth)
   - `ENERGY_API_URL` (Energy Customers API endpoint)
   - `ENERGY_API_KEY` (API key for Energy Customers)
   - `AUTH_SECRET` (run `openssl rand -base64 32`)
   - `AUTH_URL` (your Railway domain, e.g., `https://your-app.up.railway.app`)
   - `AUTH_USER_NAME` (admin name)
   - `AUTH_USER_EMAIL` (admin email)
   - `AUTH_USER_PASSWORD_HASH` (bcrypt hash of your password)
5. Deploy

**To generate a password hash:**
```bash
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('your-secure-password', 10).then(console.log)"
```

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
| `AUTH_SECRET` | NextAuth.js secret (32+ char random string) | Required |
| `AUTH_URL` | Base URL of the application | Required |
| `AUTH_USER_NAME` | Admin user display name | "admin" |
| `AUTH_USER_EMAIL` | Admin user email/username | "admin@uptimecargas.local" |
| `AUTH_USER_PASSWORD_HASH` | Bcrypt hash of admin password | "changeme" (hashed) |

## Tech Stack

- Next.js 15 (App Router)
- PostgreSQL + Prisma 7
- shadcn/ui + Tailwind CSS v4
- TanStack React Query
- Recharts
