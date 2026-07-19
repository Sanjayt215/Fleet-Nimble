# Database Schema — AI Receptionist

## Models

### aiReceptionistCall
| Field | Type | Notes |
|-------|------|-------|
| id | String (UUID) | Primary key, `@default(autogen)` |
| callSid | String (UUID) | Application-generated UUID, `@unique` |
| twilioCallSid | String? | Twilio's SID, populated after stream starts |
| fromNumber | String? | Caller's phone number (E.164) |
| toNumber | String | `TWILIO_PHONE_NUMBER` from config |
| status | CallStatus | INITIATED, CONNECTING, IN_PROGRESS, COMPLETED, FAILED, ERROR, BUSY, NO_ANSWER, STREAM_ENDED, TIMEOUT, CANCELLED |
| duration | Int? | Call duration in seconds |
| direction | String | Always "inbound" |
| provider | String | "openai" or "gemini" |
| transcript | String? | JSON string of transcript entries |
| appointmentId | String? | FK to aiReceptionistAppointment (optional) |
| ticketId | String? | FK to aiReceptionistSupportTicket (optional) |
| endReason | String? | "call_ended", "ai_hangup", "error", etc. |
| errorMessage | String? | Error details |
| recordingUrl | String? | Twilio recording URL |
| answeredBy | String? | "human" or "machine" |
| callStartedAt | DateTime | `@default(now())`, indexed descending |
| callEndedAt | DateTime? | Populated on call end |
| userId | String | Tenant-scoped user ID |
| companyId | String | Tenant-scoped company ID |
| metadata | Json? | Extra data (deployment, greeting, etc.) |
| createdAt | DateTime | `@default(now())` |
| updatedAt | DateTime | `@updatedAt` |

**Indexes:** `callSId` (unique), `twilioCallSid` (unique), `status`, `callStartedAt` (desc), `userId`

### aiReceptionistAppointment
| Field | Type | Notes |
|-------|------|-------|
| id | String (UUID) | Primary key, `@default(autogen)` |
| callSid | String | FK to aiReceptionistCall |
| customerName | String | From caller |
| customerPhone | String? | From caller |
| customerEmail | String? | Optional email |
| scheduledDate | DateTime | The appointment time (⚠️ no timezone field) |
| duration | Int | Default 30 minutes |
| reason | String? | Reason for visit |
| status | String | "scheduled", "confirmed", "cancelled", "completed", "no_show" |
| notes | String? | Internal notes |
| userId | String | Tenant-scoped |
| companyId | String | Tenant-scoped |
| createdAt | DateTime | `@default(now())` |
| updatedAt | DateTime | `@updatedAt` |

**Indexes:** `scheduledDate` (desc), `status`, `userId`

### aiReceptionistSupportTicket
| Field | Type | Notes |
|-------|------|-------|
| id | String (UUID) | Primary key, `@default(autogen)` |
| callSid | String | FK to aiReceptionistCall |
| customerName | String | From caller |
| customerPhone | String? | From caller |
| customerEmail | String? | Optional email |
| issue | String | Description of the issue |
| priority | String | "low", "medium", "high", "urgent" |
| status | String | "open", "in_progress", "resolved", "closed" |
| assignedTo | String? | Who is assigned |
| userId | String | Tenant-scoped |
| companyId | String | Tenant-scoped |
| createdAt | DateTime | `@default(now())` |
| updatedAt | DateTime | `@updatedAt` |

### receptionistCustomer
| Field | Type | Notes |
|-------|------|-------|
| id | String (UUID) | Primary key, `@default(autogen)` |
| name | String | Customer name |
| phone | String? | Customer phone (⚠️ not unique) |
| email | String? | Customer email |
| source | String? | "call", "web", "referral" |
| notes | String? | Additional notes |
| userId | String | Tenant-scoped |
| companyId | String | Tenant-scoped |
| createdAt | DateTime | `@default(now())` |
| updatedAt | DateTime | `@updatedAt` |

**Indexes:** `name`, `phone`, `userId`

### aiReceptionistConfig
| Field | Type | Notes |
|-------|------|-------|
| id | String (UUID) | Primary key, `@default(autogen)` |
| userId | String | Unique per user (single config) |
| twilioPhoneNumber | String | Unique, used for tenant resolution |
| businessName | String | Display name used in greeting |
| businessHours | Json? | Business hours configuration |
| greetingMessage | String? | Custom greeting override |
| voiceStyle | String? | "professional", "friendly", "custom" |
| features | Json? | Feature flags |
| isActive | Boolean | `@default(true)` — enables/disables receptionist |
| createdAt | DateTime | `@default(now())` |
| updatedAt | DateTime | `@updatedAt` |

**Unique constraints:** `userId` (unique), `twilioPhoneNumber` (unique)

### aiReceptionistAuditLog
| Field | Type | Notes |
|-------|------|-------|
| id | String (UUID) | Primary key, `@default(autogen)` |
| callSid | String | FK to aiReceptionistCall |
| action | String | e.g., "TOOL_CALL", "TRANSFER", "ERROR", "APPOINTMENT_CREATED" |
| details | Json? | Action-specific data |
| userId | String | Tenant-scoped |
| companyId | String | Tenant-scoped |
| createdAt | DateTime | `@default(now())` |

## Missing Schema Items

1. **Timezone column** in `aiReceptionistAppointment.scheduledDate` — stored as-is, no timezone awareness
2. **Twilio call SID on appointment/ticket** — not stored directly; linked via `callSid` FK
3. **Provider error details** — no structured provider error log table
4. **Call ratings/satisfaction** — no schema for post-call satisfaction
5. **Slot/availability model** — no table for business hours slots
