# FleetNimble AI Receptionist — Conversation State Diagram

## Finite-State Conversation Engine

### States (13)

```
┌─────────────┐
│  GREETING   │
└──────┬──────┘
       │ (customer identified or timeout)
       ▼
┌──────────────────┐
│ IDENTIFY_CUSTOMER│
└──────┬───────────┘
       │ (customer found or new caller)
       ▼
┌─────────────────┐
│ INTENT_DETECTION│
└──────┬──────────┘
       │
       ├──────────────────┬──────────────────┬──────────────────┐
       ▼                  ▼                  ▼                  ▼
┌──────────┐       ┌──────────┐       ┌──────────┐       ┌────────┐
│   SALES  │       │  SUPPORT │       │   FAQ    │       │LEAD_QUAL│
└────┬─────┘       └────┬─────┘       └────┬─────┘       └────┬───┘
     │                  │                  │                  │
     │                  │                  │                  │
     ▼                  ▼                  ▼                  ▼
┌──────────────────┐ ┌───────────────┐ ┌─────────────┐ ┌───────────────────┐
│APPOINTMENT_COLL. │ │ TOOL_EXECUTION│ │  (back to   │ │APPOINTMENT_COLL.  │
│                  │ │ (create ticket)│ │ INTENT_DET.)│ │(qualify then APPT)│
└────────┬─────────┘ └───────┬───────┘ └─────────────┘ └────────┬──────────┘
         │                    │                                    │
         ▼                    ▼                                    ▼
┌───────────────────┐  ┌─────────────┐                    ┌──────────────────┐
│APPOINTMENT_CONFIRM│  │   SUMMARY   │                    │APPOINTMENT_CONFIRM│
└────────┬──────────┘  └──────┬──────┘                    └────────┬─────────┘
         │                    │                                    │
         ▼                    ▼                                    ▼
┌─────────────┐        ┌─────────────┐                      ┌─────────────┐
│TOOL_EXECUTION│        │  GOODBYE    │                      │TOOL_EXECUTION │
└──────┬──────┘        └─────────────┘                      └──────┬──────┘
       │                                                        │
       ▼                                                        ▼
┌─────────────┐                                        ┌─────────────┐
│   SUMMARY   │                                        │   SUMMARY   │
└──────┬──────┘                                        └──────┬──────┘
       │                                                        │
       ▼                                                        ▼
┌─────────────┐                                        ┌─────────────┐
│   GOODBYE   │                                        │   GOODBYE   │
└─────────────┘                                        └─────────────┘


INTERRUPTION / CORRECTION / TOPIC CHANGE HANDLING:
───────────────────────────────────────────────────

From ANY state → INTERRUPTION HANDLER → returns to:
  • Previous state (if minor interruption: "wait", "hold on")
  • INTENT_DETECTION (if topic change: "actually I need...")
  • Current state with updated context (if correction: "no, my name is...")

MULTIPLE INTENTS:
─────────────────
INTENT_DETECTION → returns PRIMARY intent + SECONDARY intents array
  • Process primary, queue secondary
  • After primary completes → process next queued intent
  • Or ask: "You mentioned X and Y. Which should we handle first?"

CONTEXT RECOVERY:
─────────────────
On provider reconnect / session restore:
  1. Load session from DB (conversationState, collectedData, transcript)
  2. Resume at conversationState
  3. Replay last N transcript entries to provider for context
  4. If state was TOOL_EXECUTION → check idempotency key before retry
```

### State Definitions & Transitions

| State | Entry Action | Exit Condition | Next States |
|-------|--------------|----------------|-------------|
| **GREETING** | Play greeting audio, start listening | Customer speaks or timeout | IDENTIFY_CUSTOMER |
| **IDENTIFY_CUSTOMER** | Lookup by phone/voiceprint | Customer found OR new caller confirmed | INTENT_DETECTION |
| **INTENT_DETECTION** | Classify intent(s) from utterance | Primary intent determined | SALES, SUPPORT, FAQ, LEAD_QUALIFICATION, GOODBYE |
| **SALES** | Acknowledge sales interest, ask qualifying questions | Enough info gathered | LEAD_QUALIFICATION, APPOINTMENT_COLLECTION |
| **SUPPORT** | Acknowledge issue, gather details | Issue + contact captured | TOOL_EXECUTION (create_support_ticket) |
| **FAQ** | Answer from knowledge base | Question answered OR user wants action | INTENT_DETECTION |
| **LEAD_QUALIFICATION** | Ask fleet size, timeline, budget, decision maker | Qualified or disqualified | APPOINTMENT_COLLECTION (if qualified) or GOODBYE |
| **APPOINTMENT_COLLECTION** | Collect: name, company, contact, date, time, purpose | All required fields collected | APPOINTMENT_CONFIRMATION |
| **APPOINTMENT_CONFIRMATION** | Read back summary, ask for confirmation | Yes/No received | TOOL_EXECUTION (if yes) or APPOINTMENT_COLLECTION (if no/change) |
| **TOOL_EXECUTION** | Execute tool (appointment/ticket/handoff) | Tool returns result | SUMMARY (success) or current collection state (failure) |
| **SUMMARY** | Generate AI summary, update CRM | Summary complete | GOODBYE |
| **GOODBYE** | Play farewell, close connection | Audio sent | (terminal) |

### Interruption Handling Matrix

| Interruption Type | Trigger | Handling | Resume State |
|-------------------|---------|----------|--------------|
| **Barge-in** | `speechStarted` during AI response | Cancel provider response, mark interrupted | Current state (re-prompt) |
| **Correction** | "No, my name is..." during collection | Update collectedData, acknowledge | Current state |
| **Topic Change** | "Actually I need support" during sales | Queue current intent, switch to new intent | INTENT_DETECTION |
| **Hold/Wait** | "Hold on", "One moment" | Pause timers, stay silent | Previous state |
| **Escalation** | "Talk to human" | Execute handoff tool | SUMMARY → GOODBYE |
| **Provider Failure** | Provider disconnects | Reconnect with resumption handle | Same state (replay context) |

### Session State Schema (Stored in DB / Session)

```javascript
{
  callSid: string,
  conversationState: Enum[GREETING, IDENTIFY_CUSTOMER, INTENT_DETECTION, 
    SALES, SUPPORT, FAQ, LEAD_QUALIFICATION, 
    APPOINTMENT_COLLECTION, APPOINTMENT_CONFIRMATION, 
    TOOL_EXECUTION, SUMMARY, GOODBYE],
  previousState: Enum,           // For interruption recovery
  collectedData: {
    callerName: string,
    company: string,
    phone: string,
    email: string,
    fleetSize: number,
    meetingPurpose: string,
    preferredDate: string,
    preferredTime: string,
    issue: string,
    urgency: string,
    vehicleReference: string,
    // ... dynamic fields
  },
  intentQueue: Array<{intent, priority, data}>,  // Multiple intents
  currentIntent: string,
  pendingToolCall: {name, args, idempotencyKey}, // For recovery
  transcript: Array<{role, content, timestamp}>,
  customerMemory: {isReturning, customer: {...}},
  metadata: {userId, companyId, callRecordId, startedAt}
}
```

### Deterministic Transition Rules

```
GREETING → IDENTIFY_CUSTOMER           : always (after greeting plays)
IDENTIFY_CUSTOMER → INTENT_DETECTION   : always (lookup completes)
INTENT_DETECTION → SALES               : intent in [sales_interest, pricing_question, product_question]
INTENT_DETECTION → SUPPORT             : intent in [support_request, technical_issue]
INTENT_DETECTION → FAQ                 : intent in [general_question, product_question] AND no action needed
INTENT_DETECTION → LEAD_QUALIFICATION  : intent in [sales_interest] AND needs qualification
INTENT_DETECTION → GOODBYE             : intent in [goodbye, end_call]

SALES → LEAD_QUALIFICATION             : needs fleet size/timeline/budget
SALES → APPOINTMENT_COLLECTION         : ready to book
SUPPORT → TOOL_EXECUTION               : issue + contact captured
FAQ → INTENT_DETECTION                 : after answer (loop back)
LEAD_QUALIFICATION → APPOINTMENT_COLLECTION : qualified
LEAD_QUALIFICATION → GOODBYE           : disqualified or not interested
APPOINTMENT_COLLECTION → APPOINTMENT_CONFIRMATION : all required fields
APPOINTMENT_CONFIRMATION → TOOL_EXECUTION : confirmed
APPOINTMENT_CONFIRMATION → APPOINTMENT_COLLECTION : denied/change
TOOL_EXECUTION → SUMMARY               : tool success
TOOL_EXECUTION → APPOINTMENT_COLLECTION/SUPPORT : tool failure (retry)
SUMMARY → GOODBYE                      : always
```

### State Persistence

- **In-Memory**: `RealtimeSessionManager` session object extended with `conversationState`
- **Database**: `aiReceptionistCall` record updated with `conversationState` on each transition
- **Recovery**: On provider reconnect, load latest `conversationState` from DB, resume