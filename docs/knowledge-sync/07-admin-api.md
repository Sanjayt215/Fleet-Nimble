# Admin API Reference

All endpoints require JWT authentication with `ADMIN` role. Mounted at `/api/admin/knowledge`.

## Sources

### GET /sources
List all knowledge sources.

### GET /sources/:id
Get a single source by ID.

### POST /sources
Create a new knowledge source.

**Body:**
```json
{
  "name": "FleetNimble Docs",
  "sourceType": "website",
  "baseUrl": "https://docs.fleetnimble.com",
  "enabled": true,
  "requiresApproval": true,
  "crawlDepth": 2,
  "maxPages": 50,
  "rateLimitMs": 1000,
  "schedule": "0 */6 * * *",
  "defaultCategory": "Web",
  "defaultMode": "both",
  "priority": 5,
  "allowedDomains": ["docs.fleetnimble.com"],
  "allowedPaths": ["/docs", "/guides"],
  "blockedPaths": ["/admin", "/login"]
}
```

### PATCH /sources/:id
Update a source. Accepts partial body.

### DELETE /sources/:id
Delete a source permanently.

### POST /sources/:id/sync
Trigger an immediate sync for a source. Returns sync stats.

**Response:**
```json
{
  "success": true,
  "data": {
    "syncRunId": "uuid",
    "stats": {
      "pagesDiscovered": 15,
      "pagesFetched": 12,
      "articlesNew": 3,
      "articlesUpdated": 2,
      "articlesConflicted": 1
    },
    "duration": 12345
  }
}
```

## Staged Articles

### GET /staged
List staged articles with filters.

**Query params:** `status`, `sourceId`, `conflictType`, `page`, `limit`

### GET /staged/:id
Get full article with versions and approval events.

### POST /staged/:id/approve
Approve an article. Optional body: `{ "notes": "Looks good" }`

### POST /staged/:id/reject
Reject an article. Body: `{ "reason": "Outdated information" }`

### POST /staged/:id/archive
Archive an article. Body: `{ "reason": "No longer relevant" }`

### POST /staged/:id/restore/:version
Restore a historical version to ACTIVE.

## Sync Runs

### GET /runs
List sync runs. Query params: `sourceId`, `status`, `page`, `limit`

### GET /runs/:id
Get single sync run details.

## Cache

### POST /cache/refresh
Refresh knowledge cache. Optional body: `{ "provider": "synchronized" }`
Without provider, refreshes all providers.
