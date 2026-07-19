# Production Readiness

## Deployment Checklist

### Environment Variables
```env
LIVE_DATA_TIMEOUT_MS=10000       # Max query time before timeout
LIVE_DATA_RESULT_LIMIT=50        # Max items per list result
LIVE_DATA_CACHE_TTL_MS=30000     # Cache TTL in milliseconds
```

### Database
- All queries go through existing Prisma models — no schema changes required
- Existing indexes on `vehicle.userId`, `vehicle.deletedAt`, `alert.vehicleId`, `alert.read`, `dtcCode.vehicleId`, `dtcCode.active` are sufficient
- The `aiReceptionistAuditLog` table may see increased write volume from live data queries

### Monitoring

The LiveDataService exposes operational metrics:

```js
import { getMonitoringStats } from './liveData.service.js';
const stats = getMonitoringStats();
// { cacheSize: 15, cacheHitRate: 72, toolUsage: { ... } }
```

Key metrics to monitor:
- **Cache hit rate** (< 50% may indicate cache TTL is too short)
- **Average tool latency** (> 2s may indicate database performance issues)
- **Tool failure rate** (> 5% may indicate systemic issues)
- **Authorization failures** (unexpected spikes may indicate probing)

### Error Budget
- Target: 99.9% success rate for live data tool calls
- Timeout budget: 10 seconds per query
- Monthly uptime: matching the existing FleetNimble API (99.5%+)

## Operational Runbook

### Cache Management
```js
import { clearCache } from './liveData.service.js';
clearCache();  // Clears all cached data, forcing fresh queries
```

### Debugging a Failed Tool Call
1. Check the logs for `LIVE_TOOL_FAILED` entries
2. Check `VOICE_AGENT_TOOL_FAILED` for orchestration errors
3. Verify `userId` is valid and the user has the expected data
4. Check cache state with `getMonitoringStats()`
5. Test the underlying service directly (e.g., `fleetDataService.getFleetSummary(userId)`)

### Known Limitations
- Cache is in-memory per process — not shared across instances
- Cache TTL is fixed at 30 seconds (configurable at startup only)
- No cache warming — first request after startup always misses
- No pagination for very large datasets (50 result limit is hard-coded)

## Dependencies

### Internal Dependencies
| Dependency | Version | Purpose |
|-----------|---------|---------|
| fleetDataService.js | existing | Core fleet queries |
| vehicleService.js | existing | Vehicle CRUD |
| receptionistCRM.service.js | existing | CRM queries |
| receptionistAppointment.service.js | existing | Appointment queries |
| receptionistSupport.service.js | existing | Support ticket queries |
| prisma | existing | Database ORM |
| logger | existing | Logging |

### External Dependencies
- PostgreSQL (via Prisma)
- No new external dependencies added

## Rollback Plan

If the live tools cause issues:

1. **Disable live tools**: Set `LIVE_TOOLS_ENABLED=false` in the environment
2. **Remove tool definitions**: Comment out `...LIVE_TOOL_DEFINITIONS` in `buildToolDefinitions()`
3. **Remove from ALLOWED_TOOLS**: Remove the spread in `mediaStreamHandler.js`
4. **Deploy revert**: All changes are in 2 files + 2 new files — easy to revert

## Performance Budget

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Tool call latency | < 500ms | > 2s | > 10s |
| Cache hit rate | > 60% | < 40% | < 20% |
| Error rate | < 1% | > 3% | > 10% |
| Memory (cache) | < 50MB | > 100MB | > 200MB |
