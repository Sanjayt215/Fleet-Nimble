# Production Runbook

## First-Time Setup

1. Run Prisma migration to create the 5 new tables:
```bash
npx prisma migrate dev --name add_knowledge_sync
```

2. Verify migration applied:
```bash
npx prisma db push  # dry-run check
```

3. Start the backend — cron jobs register automatically

4. Configure at least one source via Admin UI or API

5. Trigger an initial sync from the Admin UI (Sources → Sync Now)

6. Review staged articles, approve those that look correct

7. Verify knowledge engine picks up approved content by checking AI Assistant responses

## Monitoring

### Key Metrics
- **Per-source sync duration** — tracked in `KnowledgeSyncRun.durationMs`
- **Article approval rate** — `articlesApproved / (articlesApproved + articlesRejected)`
- **Conflict rate** — `articlesConflicted / totalPagesFetched`
- **Cache hit ratio** — tracked by Knowledge Engine cache stats

### Log Events
| Event | Level | Description |
|---|---|---|
| KNOWLEDGE_SOURCE_CREATED | info | New source added |
| KNOWLEDGE_SYNC_STARTED | info | Sync run begins |
| KNOWLEDGE_SYNC_COMPLETED | info | Sync run completes with stats |
| KNOWLEDGE_SYNC_FAILED | error | Sync run failed with error |
| KNOWLEDGE_ARTICLE_APPROVED | info | Article approved via API |
| KNOWLEDGE_ARTICLE_REJECTED | info | Article rejected |
| KNOWLEDGE_CACHE_INVALIDATE_FAILED | warn | Cache invalidation error |

## Troubleshooting

### Sync Never Completes
1. Check `SYNC_LOCKS` — if a lock is stuck, restart the server
2. Check source connectivity — can the server reach the target URL?
3. Check robots.txt — may be blocking all paths

### Too Many Conflicted Articles
1. Review the conflict notes in the Admin UI (Staged Articles tab)
2. Adjust the content similarity threshold in `contentDiff.service.js`
3. Manually approve articles that are safe despite the conflict flag

### Article Not Appearing in AI Responses
1. Verify article status is `ACTIVE` in the staged articles list
2. Check that `synchronized` is in `KNOWLEDGE_PROVIDER_ORDER`
3. Trigger a cache refresh via POST `/admin/knowledge/cache/refresh`
4. Check the Knowledge Engine provider list in startup logs

### Crawl Slowness
1. Increase `rateLimitMs` on the source to avoid rate limiting
2. Reduce `maxPages` if crawling too many unnecessary pages
3. Add more specific `allowedPaths` patterns

### Secret Detection False Positives
1. Add the false positive string to an exclusion list
2. The warning is logged but does not block extraction

## Rollback

To remove all synchronized content:
1. POST `/admin/knowledge/cache/refresh` with `{ "provider": "synchronized" }`
2. Delete or disable all sources via Admin UI
3. Remove `synchronized` from `KNOWLEDGE_PROVIDER_ORDER`
4. Truncate the `knowledge_staged_articles` and `knowledge_sync_runs` tables (manual SQL)
