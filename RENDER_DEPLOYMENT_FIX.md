# Render Deployment Fix - P1002 Advisory Lock Error

## Root Cause

**CRITICAL DISCOVERY:** This Neon project does NOT expose a separate reachable direct (non-pooled) endpoint. The Neon Dashboard only provides a pooled connection URL containing "-pooler". Even when the "-pooler" suffix is manually removed, the resulting hostname is not actually a direct connection and still experiences P1002 advisory lock errors.

**Previous failed approach:** Attempted to use a "direct" endpoint by removing "-pooler" from the hostname. This did not work because:
1. The hostname without "-pooler" is not actually a direct connection for this Neon project
2. It still routes through PgBouncer or similar connection pooling
3. P1002 errors persisted even with the "direct" hostname

**New working approach:** Use the pooled endpoint with P1002 retry logic. The migration wrapper (`db-migrate-deploy.js`) now:
- Uses the pooled DATABASE_URL for migrations
- Retries transient P1002 errors with exponential backoff and jitter
- Checks for active migration processes before retrying
- Does not require a separate direct endpoint

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
- P1002 errors occur and fail the deployment immediately

### Fixed Command:
```bash
npm ci && npx prisma generate && npm run db:migrate:deploy && npm run db:seed
```

- Runs `npm run db:migrate:deploy` which executes `backend/scripts/db-migrate-deploy.js`
- The wrapper script:
  - Uses the pooled DATABASE_URL (only reachable endpoint for this Neon project)
  - Retries P1002 errors with exponential backoff (5s, 10s, 20s, 30s, 60s) + jitter
  - Checks for active migration processes before retrying
  - Logs structured diagnostics without exposing credentials
  - Does NOT require a separate direct endpoint
- `npm run db:seed` ensures admin user exists after deployment

## Environment Variables Required

Ensure these are set in Render Dashboard (Environment section):

```
DATABASE_URL
= postgresql://USER:PASSWORD@ep-xxxxx-123-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require
= Pooled endpoint for both application runtime AND migrations

DIRECT_DATABASE_URL
= (Optional, can be empty or omitted)
= If a separate direct endpoint is available, set it here.
= For this Neon project, it is ignored since only pooled is reachable.
```

**NOTE:** `DIRECT_DATABASE_URL` is now optional. The migration wrapper will use `DATABASE_URL` with retry logic.

## Verification

After updating the Build Command, the Render deployment log should show:

```
[MIGRATE-DEPLOY] verifying database configuration...
[MIGRATE-DEPLOY] Using pooled DATABASE_URL with P1002 retry logic
[MIGRATE-DEPLOY] NOTE: DIRECT_DATABASE_URL is ignored for this Neon project
[MIGRATE-DEPLOY] application connection : protocol=postgresql host=ep-xxxxx-123-pooler... type=pooled
[MIGRATE-DEPLOY] migration connection   : protocol=postgresql host=ep-xxxxx-123-pooler... type=pooled
[MIGRATE-DEPLOY] connection preflight: OK (pooled)
[MIGRATE-DEPLOY] running prisma migrate deploy (attempt 1, type=pooled)...
```

If P1002 occurs, you will see:
```
[MIGRATE-DEPLOY] advisory-lock contention detected (P1002). Retrying in X.Xs...
[MIGRATE-DEPLOY] running prisma migrate deploy (attempt 2, type=pooled)...
```

## Why render.yaml Is Not Being Used

Render's native blueprint system (`render.yaml`) is only used when:
1. The service is created via the "New Blueprint Instance" flow
2. No manual Build Command override exists in the Dashboard

Since this service has a manual Build Command override in the Dashboard, that setting takes precedence over `render.yaml`.

## Migration Wrapper Guarantees

The `backend/scripts/db-migrate-deploy.js` wrapper ensures:

1. ✅ Works with pooled-only Neon endpoints
2. ✅ Retries transient P1002 errors with exponential backoff + jitter
3. ✅ Checks for active migration processes before retrying
4. ✅ Never prints database passwords
5. ✅ Logs structured diagnostics (host type, attempt number, retry status)
6. ✅ Exits non-zero for genuine migration failures
7. ✅ Does NOT terminate unrelated database sessions
8. ✅ Uses DIRECT_DATABASE_URL if available and valid (not pooled)
9. ✅ Falls back to pooled with retry logic if no valid direct endpoint

## Prisma Configuration

`backend/prisma/schema.prisma` is configured:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_DATABASE_URL")
}
```

The migration wrapper overrides these at runtime to ensure consistent behavior.

## Summary

- **Root Cause:** This Neon project only exposes a pooled endpoint; the "direct" hostname is not actually direct
- **Fix:** Use pooled endpoint with P1002 retry logic in migration wrapper
- **Why previous fix failed:** Attempted to use a non-existent direct endpoint
- **After fix:** Migrations use pooled endpoint with retry, P1002 errors are handled gracefully
- **Manual action required:** Update Render Dashboard Build Command to use `npm run db:migrate:deploy`
