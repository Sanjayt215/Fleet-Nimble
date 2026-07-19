# Live Platform Architecture

## Overview

The Live Platform connects the AI Receptionist to live FleetNimble business data. It enables the AI to answer real-time questions like "How many vehicles are online?" and "What maintenance is due?" using actual database data rather than static knowledge.

## Architecture

```
Caller: "How many vehicles are online?"
  ↓
LLM (Gemini/OpenAI)
  ↓  functionCall: get_fleet_summary({})
  ↓
mediaStreamHandler.js
  ↓  handleToolCall()
  ↓  executeToolCall()
  ↓  receptionistLiveTools.service.js
  ↓  executeLiveTool(userId, 'get_fleet_summary')
  ↓
liveData.service.js
  ↓  getFleetSummary(userId)
  ↓  verifyTenantAccess(userId)
  ↓  fleetDataService.getFleetSummary(userId)  [existing service]
  ↓  cache lookup → Prisma query → cache store
  ↓  audit log
  ↓
JSON result returned to LLM
  ↓
LLM: "There are 12 vehicles online right now."
```

## Layered Design

```
┌─────────────────────────────────────────────────────┐
│                   LLM Layer                          │
│  (Gemini / OpenAI — function calling)                │
├─────────────────────────────────────────────────────┤
│              Orchestration Layer                     │
│  mediaStreamHandler.js — tool dispatch, retry,       │
│    timeout, dedup                                    │
├─────────────────────────────────────────────────────┤
│            Live Tools Layer                          │
│  receptionistLiveTools.service.js                    │
│  - Tool definitions (functionDeclarations)            │
│  - Input validation                                  │
│  - Safe execution wrapper                            │
│  - Voice-friendly formatting                         │
├─────────────────────────────────────────────────────┤
│           Live Data Service Layer                    │
│  liveData.service.js                                 │
│  - Cache (in-memory, 30s TTL)                       │
│  - Tenant verification                               │
│  - Input validation                                  │
│  - Timeout protection                                │
│  - Audit logging                                     │
│  - Monitoring stats                                  │
├─────────────────────────────────────────────────────┤
│         Existing Backend Services                    │
│  fleetDataService.js   — fleet queries                │
│  vehicleService.js     — vehicle CRUD                 │
│  receptionistCRM.service.js — CRM queries             │
│  receptionistAppointment.service.js — appointments    │
│  receptionistSupport.service.js — support tickets     │
│  Prisma ORM → PostgreSQL                              │
└─────────────────────────────────────────────────────┘
```

## Data Flow

1. **LLM decides** to call a tool based on the caller's question
2. **Provider** emits `toolCall` event with tool name + arguments
3. **mediaStreamHandler** catches it, validates against `ALLOWED_TOOLS`, enforces timeout/retry
4. **receptionistLiveTools** validates inputs and dispatches to liveData service
5. **liveData.service** verifies tenant, checks cache, queries existing backend services, logs to audit
6. **Result** flows back through the provider as `functionResponse`
7. **LLM** interprets the JSON result and responds to the caller naturally

## Key Design Decisions

- **No direct SQL in AI code**: All database access goes through existing FleetNimble services
- **No duplicate business logic**: The LiveDataService delegates to `fleetDataService`, `vehicleService`, etc.
- **Tenant isolation enforced at every layer**: Every function requires `userId` and verifies ownership
- **Caching is transparent**: 30-second in-memory TTL built into the service layer
- **Tools are additive**: Live tools sit alongside existing business tools (lookup_customer, create_appointment, etc.)
