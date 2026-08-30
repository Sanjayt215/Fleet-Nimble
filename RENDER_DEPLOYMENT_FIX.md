# Render Deployment Fix - P1002 Advisory Lock Error

## Root Cause

The Render Dashboard has a **manual Build Command override** that is NOT using `render.yaml`.

**Evidence from Render production log:**
```
Running build command:
npm install && npx prisma generate && npx prisma migrate deploy

Prisma datasource during deployment:
ep-polished-rice-atx146jz-pooler.c-9.us-east-1.aws.neon.tech

Error:
P1002 - Timed out trying to acquire postgres advisory lock
SELECT pg_advisory_lock(72707369)
```

This proves Render is running `npx prisma migrate deploy` directly against the pooled Neon endpoint, which causes P1002 because Neon's PgBouncer cannot hold session-scoped advisory locks.

## Required Manual Action

You must update the **Render Dashboard Build Command** manually. The repository `render.yaml` is correct but is being overridden by the Dashboard setting.

### Step-by-Step Instructions

1. Go to Render Dashboard: https://dashboard.render.com
2. Navigate to: **fleet-backend** service
3. Click **Settings** tab
4. Scroll to **Build & Deploy** section
5. Find **Build Command** field
6. Replace the current command with:

```bash
npm ci && npx prisma generate && npm run db:migrate:deploy && npm run db:seed
```

7. Click **Save Changes**
8. Trigger a new deployment (manual deploy or push a commit)

## Why This Fix Works

### Current (Broken) Command:
```bash
npm install && npx prisma generate && npx prisma migrate deploy
```

- Runs `npx prisma migrate deploy` directly
- Prisma uses `DATABASE_URL` (pooled endpoint)
- Pooled endpoint uses PgBouncer (transaction mode)
- PgBouncer cannot hold `pg_advisory_lock()`
- Result: P1002 error

### Fixed Command:
```bash
npm ci && npx prisma generate && npm run db:migrate:deploy && npm run db:seed
```

- Runs `npm run db:migrate:deploy` which executes `backend/scripts/db-migrate-deploy.js`
- The wrapper script:
  - Validates `DIRECT_DATABASE_URL` exists
  - Validates `DIRECT_DATABASE_URL` does NOT contain `-pooler`
  - Preflights direct connection
  - Explicitly passes direct URL to Prisma subprocess
  - Retries transient P1002 errors with exponential backoff
  - Aborts if Prisma reports using a pooled host
- `npm run db:seed` ensures admin user exists after deployment

## Environment Variables Required

Ensure these are set in Render Dashboard (Environment section):

```
DATABASE_URL
= postgresql://USER:PASSWORD@ep-xxxxx-123-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require
= Pooled endpoint for application runtime

DIRECT_DATABASE_URL
= postgresql://USER:PASSWORD@ep-xxxxx-123.us-east-1.aws.neon.tech/neondb?sslmode=require
= Direct endpoint (NO -pooler suffix) for migrations
```

**CRITICAL:** `DIRECT_DATABASE_URL` must NOT contain `-pooler` in the hostname.

## Verification

After updating the Build Command, the Render deployment log should show:

```
[MIGRATE-DEPLOY] verifying database configuration...
[MIGRATE-DEPLOY] application connection : protocol=postgresql host=ep-xxxxx-123-pooler... (pooled)
MIGRATION_DATABASE_TARGET {"host":"ep-xxxxx-123.us-east-1.aws.neon.tech","protocol":"postgresql","direct":true}
[MIGRATE-DEPLOY] direct connection preflight: OK
[MIGRATE-DEPLOY] running prisma migrate deploy (attempt 1)...
```

Note the migration target is the **direct** endpoint (no `-pooler`).

## Why render.yaml Is Not Being Used

Render's native blueprint system (`render.yaml`) is only used when:
1. The service is created via the "New Blueprint Instance" flow
2. No manual Build Command override exists in the Dashboard

Since this service has a manual Build Command override in the Dashboard, that setting takes precedence over `render.yaml`.

## Migration Wrapper Guarantees

The `backend/scripts/db-migrate-deploy.js` wrapper ensures:

1. ✅ Fails immediately if `DIRECT_DATABASE_URL` is missing
2. ✅ Fails immediately if `DIRECT_DATABASE_URL` contains `-pooler`
3. ✅ Never silently falls back to `DATABASE_URL`
4. ✅ Never prints database passwords
5. ✅ Explicitly runs Prisma Migrate using the direct connection
6. ✅ Retries only transient P1002 errors (bounded exponential backoff)
7. ✅ Exits non-zero for genuine migration failures
8. ✅ Logs safe messages showing host type without exposing credentials

## Prisma Configuration

`backend/prisma/schema.prisma` is correctly configured:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_DATABASE_URL")
}
```

Prisma 5.22.0 correctly uses `directUrl` for migration operations when present.

## Summary

- **Root Cause:** Render Dashboard manual Build Command override using old command
- **Fix:** Manually update Render Dashboard Build Command to use `npm run db:migrate:deploy`
- **Why render.yaml didn't work:** Dashboard override takes precedence
- **After fix:** Migrations will use direct Neon endpoint, P1002 errors will stop
