# Business Tools Audit — AI Receptionist

## Tool Architecture

The orchestrator (`receptionistOrchestrator.service.js`) is the central dispatcher for business tool execution.

```
mediaStreamHandler receives tool_call from provider
  ↓
  calls orchestrator.handleToolCall(callSid, toolName, args)
    ↓
    if PENDING_ACTIONS has entry for this callSid (duplicate guard):
      → log duplicate request, wait
    else:
      → set PENDING_ACTIONS[callSid] = pending
      → tools.execute(toolName, args, userId, companyId)
      → clear PENDING_ACTIONS
      → return result to provider
```

## Tool Definitions Sent to Provider

The following tools are defined in `receptionistRealtime.service.js`'s `_buildSystemTools()`:

### 1. `create_appointment`
| Property | Value |
|----------|-------|
| Description | Book an appointment for a customer |
| Parameters | `customerName` (req), `customerPhone` (opt), `customerEmail` (opt), `scheduledDate` (req, ISO 8601), `duration` (opt, default 30), `reason` (opt), `notes` (opt) |
| Handler | `appointmentService.createAppointment()` |
| DB writes | Creates `aiReceptionistAppointment` record + audit log |
| Validation | Checks required fields: `customerName`, `scheduledDate` |
| Calendar | Attempts `createCalendarEvent()` — silently catches error |
| **Missing: slot availability check** | Does NOT check for existing appointments at same time |

### 2. `create_support_ticket`
| Property | Value |
|----------|-------|
| Description | Create a support ticket for a customer issue |
| Parameters | `customerName` (req), `customerPhone` (opt), `customerEmail` (opt), `issue` (req), `priority` (req: low/medium/high/urgent) |
| Handler | `supportService.createSupportTicket()` |
| DB writes | Creates `aiReceptionistSupportTicket` record + audit log |
| Validation | Checks required fields: `customerName`, `issue`, `priority` |

### 3. `lookup_customer`
| Property | Value |
|----------|-------|
| Description | Look up a customer by name or phone |
| Parameters | `name` (opt), `phone` (opt) |
| Handler | `crmService.lookupCustomer()` |
| DB reads | Queries `receptionistCustomer` table by name OR phone |
| **Issue: partial match** | Uses `contains` mode for name and `equals` for phone — case sensitivity depends on DB collation |

### 4. `update_customer_info`
| Property | Value |
|----------|-------|
| Description | Update or create customer record |
| Parameters | `name` (opt), `phone` (opt), `email` (opt), `notes` (opt) |
| Handler | `crmService.upsertCustomer()` |
| DB writes | Upserts `receptionistCustomer` record |
| Lookup logic | Looks up by phone first, then name; updates if found, creates if not |

## Duplicate Execution Prevention

| Mechanism | Details |
|-----------|---------|
| `PENDING_ACTIONS` Map | Keyed by `callSid`, prevents concurrent tool execution for the same call |
| Logging on duplicate | Logs "DUPLICATE TOOL CALL REQUEST DETECTED" |
| Wait and proceed | If duplicate detected, logs but still continues (not strict deduplication) |
| **Gap: idempotency** | If model retries after the first tool call completes, `PENDING_ACTIONS` will be clear and the tool executes again |

## Tool Availability Check

```
orchestrator.areToolsAvailable() → checks AI_RECEPTIONIST_BUSINESS_TOOLS_ENABLED
```

**Default state:** `AI_RECEPTIONIST_BUSINESS_TOOLS_ENABLED=false` in `.env.example`
- When disabled, no tool definitions are sent to the provider
- When disabled, `handleToolCall` will throw an error

## Tool Execution Results

Results are formatted as JSON and sent back to the provider:
```json
{
  "success": true,
  "appointment": { "id": "uuid", "customerName": "...", "scheduledDate": "...", ... }
}
```

**Metadata:** The tool result is also logged to the session metadata for transcript enrichment.

## Error Handling

| Error | Handling |
|-------|----------|
| Missing required fields | Returns `{ success: false, error: "Missing required fields: ..." }` |
| DB error | Caught by try/catch, logs error, returns `{ success: false, error: "..." }` |
| Tool disabled | `handleToolCall` throws an error which is caught in `mediaStreamHandler` |

## Notification Stubs

| Feature | File | Status |
|---------|------|--------|
| `sendConfirmationEmail()` | `receptionistNotification.service.js` | **STUB** — logs "EMAIL SENDING DISABLED - NOT IMPLEMENTED", returns `{ sent: true }` |
| `sendSmsNotification()` | Same file | **STUB** — logs "SMS SENDING DISABLED - NOT IMPLEMENTED", returns `{ sent: true }` |
| `createCalendarEvent()` | Same file | **BEST EFFORT** — tries Google Calendar API, silently catches error |

These stubs are called from `orchestrator.handleToolCall()` after successful appointment/ticket creation, but they never actually send anything.

## Audit Logging

| Action | Logged? |
|--------|---------|
| Appointment created | ✅ `aiReceptionistAuditLog` with action `TOOL_CALL`, `APPOINTMENT_CREATED` |
| Support ticket created | ✅ `aiReceptionistAuditLog` with action `TOOL_CALL`, `TICKET_CREATED` |
| Tool call executed | ✅ `aiReceptionistAuditLog` with action `TOOL_CALL`, tool name, args |
| Tool call failed | ✅ Audit log with error details |
| Customer lookup | ✅ Audit log |
| Customer upsert | ✅ Audit log |
