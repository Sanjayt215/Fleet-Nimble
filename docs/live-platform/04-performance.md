# Performance

## Caching Strategy

The LiveDataService uses an in-memory cache with configurable TTL:

```js
class LiveDataCache {
  constructor(ttlMs = 30000)  // Default: 30 seconds
}
```

### Cache Behavior
- **Read-through**: Every method checks cache before querying
- **Write-through**: Results are cached after successful queries
- **TTL-based expiry**: Entries expire after 30 seconds (configurable via code)
- **Prefix clearing**: `clearPrefix(prefix)` for targeted invalidation
- **Full clear**: `clearCache()` for administrative use

### Cache Hit Rate Tracking
```js
const CACHE_HITS = { hits: 0, misses: 0 };
function getCacheHitRate() {
  const total = CACHE_HITS.hits + CACHE_HITS.misses;
  return total === 0 ? 0 : Math.round((CACHE_HITS.hits / total) * 100);
}
```

## Performance Safeguards

### Timeout Protection
Every database query is wrapped with a timeout:

```js
async function withTimeout(promise, ms = 10000) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}
```

Default timeout: 10 seconds. Configurable via `LIVE_DATA_TIMEOUT_MS` env var.

### Result Limits
All list queries enforce maximum result counts:

- Fleet alerts: 50 max
- Maintenance items: 50 max
- Driver behavior events: 50 max
- DTC codes: 50 max
- Recent activity: 50 max
- Support tickets: 50 max

Configurable via `LIVE_DATA_RESULT_LIMIT` env var.

### Parallel Queries
Aggregated endpoints run independent queries in parallel:

```js
const [fleetSummary, alertSummary, maintenanceSchedule] = await Promise.all([
  getFleetSummary(userId),
  getAlertSummary(userId),
  getMaintenanceSchedule(userId),
]);
```

This ensures that a slow query for one data source doesn't block others.

## Monitoring

### Tool Usage Stats
Every tool execution is tracked:

```js
recordToolUsage(toolName, latencyMs, success)
```

Exposed via `getMonitoringStats()`:
```json
{
  "cacheSize": 15,
  "cacheHitRate": 72,
  "toolUsage": {
    "get_fleet_summary": { "calls": 45, "failures": 0, "avgLatencyMs": 120 },
    "get_vehicle_status": { "calls": 23, "failures": 1, "avgLatencyMs": 85 }
  }
}
```

### Logging
- Every tool call is logged with latency
- Slow queries (> 5s) are logged at WARN level
- Failures are logged at ERROR level with full context
- Cache statistics are available for operational monitoring

## Expected Latencies

| Tool | Expected Latency | Cached Latency |
|------|-----------------|----------------|
| get_fleet_summary | 100-300ms | <1ms |
| get_vehicle_status | 50-200ms | <1ms |
| get_driver_information | 100-400ms | <1ms |
| get_live_diagnostics | 50-200ms | <1ms |
| get_maintenance_schedule | 50-200ms | <1ms |
| get_alert_summary | 50-200ms | <1ms |
| get_customer_information | 100-500ms | <1ms |
| get_company_information | 50-100ms | <1ms |
| get_demo_schedule | 50-150ms | <1ms |
| get_support_ticket_status | 50-200ms | <1ms |
| get_dashboard_statistics | 200-800ms | <1ms |
| get_recent_activity | 100-400ms | <1ms |
