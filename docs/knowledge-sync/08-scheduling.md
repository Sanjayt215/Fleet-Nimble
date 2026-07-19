# Scheduling

## Overview

Knowledge sync runs on two schedules managed by `node-cron` in `cron/index.js`:

## 1. Full Source Sync — Every 6 Hours

```
0 */6 * * *
```

- Fetches all enabled sources that have a `schedule` value set (non-null)
- Runs each source's sync sequentially with overlap prevention (source-level lock)
- Logs per-source success/failure
- Updates `lastSyncStatus` and `lastSyncedAt` on each source

## 2. Cache Refresh — Every 30 Minutes

```
*/30 * * * *
```

- Calls `engine.refreshProvider('synchronized')` to reload only ACTIVE articles
- No crawl operations — only refreshes the in-memory cache of the SynchronizedContentProvider
- Degraded silently on failure (uses fallback cache)

## Overlap Prevention

- Source-level lock via `SYNC_LOCKS` Map
- If a sync is already running for a source, `syncSource()` returns `{ error: 'sync_already_running' }`
- Lock is released in `finally` block even on error
- Crawler state (`visitedUrls`, `rateLimitTimers`) is reset after each sync

## Per-Source Configuration

Each source can specify a custom cron schedule:

```js
"schedule": "0 6 * * 1"  // Mondays at 6 AM
"schedule": "0 */12 * * *" // Every 12 hours
"schedule": "0 0 * * *"  // Daily at midnight
```

## Retry Behavior

- Failed syncs set `lastSyncStatus: 'FAILED'` with error message
- No automatic retry on failure — next scheduled run will retry
- Manual retry via POST `/admin/knowledge/sources/:id/sync`

## Error Handling

```
KNOWLEDGE_CRON_ERROR  — top-level cron error
KNOWLEDGE_CRON_SOURCE_ERROR — per-source error (continues to next source)
KNOWLEDGE_CRON_SYNC_FAILED  — sync returned error result
```
