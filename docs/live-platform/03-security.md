# Security Model

## Tenant Isolation

Every live data query enforces tenant isolation at multiple layers:

### Layer 1: Input Validation
```js
// receptionistLiveTools.service.js — every handler validates userId exists
async function safeExecute(userId, toolName, handler) {
  if (!userId) return wrapResult(false, null, 'Authentication required');
  // ...
}
```

### Layer 2: Tenant Verification
```js
// liveData.service.js — every method calls verifyTenantAccess
async function verifyTenantAccess(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, companyId: true, role: true },
  });
  if (!user) throw new ValidationError('User not found');
  return user;
}
```

### Layer 3: Ownership Checks
```js
// liveData.service.js — vehicle access verification
async function verifyVehicleAccess(userId, vehicleId) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, userId, deletedAt: null },
    select: { id: true },
  });
  if (!vehicle) throw new ValidationError('Vehicle not found or access denied');
}
```

### Layer 4: Existing Service Isolation
Existing services (`fleetDataService`, `vehicleService`, etc.) already filter by `userId` in every query. The LiveDataService delegates to these services, inheriting their isolation.

## Authorization

| Role | Access Level |
|------|-------------|
| ADMIN | Full access to all live data tools |
| MANAGER | Full access to all live data tools |
| DISPATCHER | Fleet data, vehicle status, alerts, diagnostics (no CRM) |
| DRIVER | Own vehicle data only |
| VIEWER | Read-only fleet summary, no CRM/company data |

Role checking is inherited from existing services.

## Input Validation

Every tool validates inputs before processing:

```js
validateVehicleIdentifier(identifier)  // must be non-empty string
validateId(value, label)               // required, non-empty string
validateOptionalId(value)              // optional, but must be valid if provided
```

Invalid inputs return early with descriptive error messages:
```json
{ "success": false, "error": "Vehicle identifier is required" }
```

## Error Handling

Errors are categorized and handled gracefully:

| Error Type | Example | Response |
|-----------|---------|----------|
| Validation | Missing required field | Descriptive message |
| Not Found | Vehicle does not exist or belongs to another user | "Vehicle not found or access denied" |
| Timeout | Database query exceeds 10s | "Request timed out, please try again" |
| System | Prisma connection error | "System error, our team has been notified" |
| Auth | Invalid/missing userId | "Authentication required" |

Errors never expose:
- Database structure or query details
- Other users' data existence
- Internal system information
- Stack traces to the LLM or caller

## Audit Logging

Every tool execution is logged:
```js
await logAuditEvent(userId, 'fleet_summary', { ... });
```

Audit log entries record:
- User ID
- Action type (e.g., `live_data_fleet_summary`)
- Timestamp (automatic via Prisma)
- Relevant identifiers (vehicle IDs, customer IDs, etc.)

## Monitoring

Security-relevant metrics:
- Authorization failures
- Tool failures (could indicate probing)
- Cache hit rate (unexpected patterns)
- Tool usage frequency

These are exposed via `getMonitoringStats()` and logged at WARN level when thresholds are exceeded.
