# Authentication Setup Guide

Uptime Cargas uses NextAuth.js v5 for secure authentication. All routes except `/login` and `/api/auth/*` require authentication.

## Quick Setup

### 1. Generate AUTH_SECRET

```bash
openssl rand -base64 32
```

Add to `.env`:
```bash
AUTH_SECRET="your-generated-secret-here"
```

### 2. Set Base URL

```bash
# Local development
AUTH_URL="http://localhost:3000"

# Production (Railway)
AUTH_URL="https://your-app.up.railway.app"
```

### 3. Configure Admin User

**Option A: Use default credentials (for testing only)**

Default login:
- Email: `admin@uptimecargas.local`
- Password: `changeme`

**Option B: Set custom credentials (recommended)**

Generate a password hash:
```bash
npm run hash-password your-secure-password
```

Add to `.env`:
```bash
AUTH_USER_NAME="Your Name"
AUTH_USER_EMAIL="admin@yourcompany.com"
AUTH_USER_PASSWORD_HASH="$2b$10$..."
```

## Railway Deployment

Set these environment variables in Railway:

```bash
AUTH_SECRET="<generated-with-openssl-rand-base64-32>"
AUTH_URL="https://your-service.up.railway.app"
AUTH_USER_NAME="Admin"
AUTH_USER_EMAIL="admin@company.com"
AUTH_USER_PASSWORD_HASH="<generated-with-npm-run-hash-password>"
```

## Security Notes

- **Never commit `.env` to version control** - it contains secrets
- **Change default password immediately** in production
- **Use strong passwords** - 16+ characters with mixed case, numbers, symbols
- **Rotate AUTH_SECRET periodically** for production deployments
- **Use HTTPS in production** - NextAuth requires secure connections

## Adding More Users

Currently supports a single admin user configured via environment variables. To add multiple users:

1. **Database approach**: Modify `src/auth.ts` to load users from Prisma/database
2. **Multiple env users**: Add additional `AUTH_USER_2_EMAIL`, `AUTH_USER_2_PASSWORD_HASH`, etc.
3. **SSO**: Add OAuth providers (Google, GitHub, etc.) to NextAuth config

## Troubleshooting

### "Invalid email or password"
- Check `AUTH_USER_EMAIL` matches your input
- Verify `AUTH_USER_PASSWORD_HASH` is correct
- Ensure `AUTH_SECRET` is set

### Redirects to login after successful auth
- Check `AUTH_URL` matches your actual URL
- Verify `AUTH_SECRET` is the same across restarts
- Check browser cookies aren't blocked

### "Middleware deprecated" warning
- This is a Next.js 16 warning, safe to ignore
- Middleware will continue to work

## Session Management

- Sessions last **30 days** by default
- JWT-based (no database session storage needed)
- Logout clears session and redirects to `/login`
- Use "Sign Out" button in sidebar
