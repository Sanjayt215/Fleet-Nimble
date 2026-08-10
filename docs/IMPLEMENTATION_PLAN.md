# FleetNimble AI Receptionist — Finite-State Conversation Engine Implementation Plan

## Overview

Replace the ad-hoc conversation orchestration in `receptionistOrchestrator.service.js` and `receptionistAgent.service.js` with a deterministic finite-state machine. Preserve all existing integrations (Twilio, Gemini Live, Media Streams, Session Manager, Business Tools, CRM, RAG, Dashboard).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MEDIA STREAM HANDLER                      │
│  (Twilio WS → Audio Pipeline → Provider)                    │
└──────────────────────────┬──────────────────────────────────┘
                           │ Events: speechStarted, callerTranscript, toolCall
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              CONVERSATION ENGINE (NEW)                       │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐   │
│  │ State Machine│  │ Context Store │  │ Transition Rules  │   │
│  │ (Core)       │  │ (Session)     │  │ (Deterministic)   │   │
│  └─────────────┘  └──────────────┘  └───────────────────┘   │
│         │                │                    │              │
│         ▼                ▼                    ▼              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              STATE HANDLERS (per state)              │    │
│  │  GREETING → IDENTIFY_CUSTOMER → INTENT_DETECTION →  │    │
│  │  SALES/SUPPORT/FAQ/LEAD_QUAL → APPT_COLL → APPT_CONF│    │
│  │  → TOOL_EXECUTION → SUMMARY → GOODBYE                │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │  PROVIDER   │  │   TOOLS     │  │  PERSISTENCE │
   │ (Gemini/    │  │ (Appointment│  │  (Prisma,    │
   │  OpenAI)    │  │  Support,   │  │   Redis)     │
   │             │  │  CRM, RAG)  │  │              │
   └─────────────┘  └─────────────┘  └─────────────┘
```

## Implementation Phases

### Phase 1: Core State Machine (Week 1)

#### 1.1 Create `ConversationStateMachine` Class
**File**: `backend/src/services/conversation/ConversationStateMachine.js`

```javascript
// Core FSM with:
// - States enum (13 states)
// - Transition table (deterministic)
// - Current state + previous state
// - Event-driven transitions
// - Guard conditions for each transition
// - onEnter/onExit hooks per state
```

#### 1.2 Create `ConversationContext` Class
**File**: `backend/src/services/conversation/ConversationContext.js`

```javascript
// Session-scoped context:
// - conversationState (persisted)
// - collectedData (persisted)
// - intentQueue (multiple intents)
// - pendingToolCall (for recovery)
// - transcript (last N entries)
// - customerMemory
// - metadata (callSid, userId, etc.)
// - Methods: persist(), restore(), getStateSnapshot()
```

#### 1.3 Define State Enum & Transition Table
**File**: `backend/src/services/conversation/states.js`

```javascript
export const STATES = {
  GREETING: 'GREETING',
  IDENTIFY_CUSTOMER: 'IDENTIFY_CUSTOMER',
  INTENT_DETECTION: 'INTENT_DETECTION',
  SALES: 'SALES',
  SUPPORT: 'SUPPORT',
  FAQ: 'FAQ',
  LEAD_QUALIFICATION: 'LEAD_QUALIFICATION',
  APPOINTMENT_COLLECTION: 'APPOINTMENT_COLLECTION',
  APPOINTMENT_CONFIRMATION: 'APPOINTMENT_CONFIRMATION',
  TOOL_EXECUTION: 'TOOL_EXECUTION',
  SUMMARY: 'SUMMARY',
  GOODBYE: 'GOODBYE',
};

// Deterministic transition table: fromState → event → toState
export const TRANSITIONS = {
  [STATES.GREETING]: {
    'greeting_complete': STATES.IDENTIFY_CUSTOMER,
  },
  [STATES.IDENTIFY_CUSTOMER]: {
    'customer_identified': STATES.INTENT_DETECTION,
    'new_caller': STATES.INTENT_DETECTION,
  },
  [STATES.INTENT_DETECTION]: {
    'intent_sales': STATES.SALES,
    'intent_support': STATES.SUPPORT,
    'intent_faq': STATES.FAQ,
    'intent_lead_qual': STATES.LEAD_QUALIFICATION,
    'intent_goodbye': STATES.GOODBYE,
  },
  [STATES.SALES]: {
    'qualify_needed': STATES.LEAD_QUALIFICATION,
    'ready_to_book': STATES.APPOINTMENT_COLLECTION,
    'faq_requested': STATES.FAQ,
  },
  [STATES.SUPPORT]: {
    'details_collected': STATES.TOOL_EXECUTION,
    'escalation_requested': STATES.TOOL_EXECUTION,
  },
  [STATES.FAQ]: {
    'answer_given': STATES.INTENT_DETECTION,
    'action_requested': STATES.INTENT_DETECTION, // re-detect with new context
  },
  [STATES.LEAD_QUALIFICATION]: {
    'qualified': STATES.APPOINTMENT_COLLECTION,
    'disqualified': STATES.GOODBYE,
    'not_interested': STATES.GOODBYE,
  },
  [STATES.APPOINTMENT_COLLECTION]: {
    'all_fields_collected': STATES.APPOINTMENT_CONFIRMATION,
    'field_missing': STATES.APPOINTMENT_COLLECTION, // stay, ask for missing
  },
  [STATES.APPOINTMENT_CONFIRMATION]: {
    'confirmed': STATES.TOOL_EXECUTION,
    'denied': STATES.APPOINTMENT_COLLECTION,
    'change_requested': STATES.APPOINTMENT_COLLECTION,
  },
  [STATES.TOOL_EXECUTION]: {
    'success': STATES.SUMMARY,
    'failure': STATES.APPOINTMENT_COLLECTION, // or SUPPORT depending on tool
    'retry': STATES.TOOL_EXECUTION,
  },
  [STATES.SUMMARY]: {
    'complete': STATES.GOODBYE,
  },
  [STATES.GOODBYE]: {
    'farewell_sent': null, // terminal
  },
};

// Interruption transitions (from ANY state)
export const INTERRUPTION_TRANSITIONS = {
  'barge_in': 'SAME_STATE',           // Re-prompt in current state
  'correction': 'SAME_STATE',         // Update context, stay
  'topic_change': 'INTENT_DETECTION', // Queue current, detect new
  'hold_request': 'PAUSE',            // Pause timers, resume previous
  'escalation': 'TOOL_EXECUTION',     // Execute handoff tool
  'provider_reconnect': 'SAME_STATE', // Resume with context replay
};
```

### Phase 2: State Handlers (Week 1-2)

Each state gets a handler module with `onEnter`, `onEvent`, `onExit` methods.

#### 2.1 State Handler Interface
**File**: `backend/src/services/conversation/handlers/BaseStateHandler.js`

```javascript
export class BaseStateHandler {
  constructor(context, services) {}
  
  async onEnter() {}           // Called when entering state
  async onEvent(event, data) {} // Handle events (transcript, tool result, etc.)
  async onExit() {}            // Called when leaving state
  getNextState(event, data) {}  // Return next state or null
}
```

#### 2.2 Implement Handlers (13 files)
```
backend/src/services/conversation/handlers/
├── GreetingHandler.js
├── IdentifyCustomerHandler.js
├── IntentDetectionHandler.js
├── SalesHandler.js
├── SupportHandler.js
├── FaqHandler.js
├── LeadQualificationHandler.js
├── AppointmentCollectionHandler.js
├── AppointmentConfirmationHandler.js
├── ToolExecutionHandler.js
├── SummaryHandler.js
└── GoodbyeHandler.js
```

**Key behaviors per handler:**

| Handler | onEnter | onEvent (callerTranscript) | Tools Called |
|---------|---------|----------------------------|--------------|
| Greeting | Send greeting audio | — | — |
| IdentifyCustomer | Lookup customer by phone | — | `lookup_customer` |
| IntentDetection | — | Classify intent(s), queue secondary | `retrieve_knowledge` (if FAQ) |
| Sales | Acknowledge, ask qualifying Qs | Extract details, detect ready-to-book | — |
| Support | Acknowledge, ask for issue details | Extract issue, contact, urgency | — |
| Faq | Answer from KB | If follow-up → stay; if action → re-detect | `retrieve_knowledge` |
| LeadQualification | Ask fleet size, timeline, budget | Score lead, decide qualified | — |
| AppointmentCollection | Prompt for next missing field | Extract field, validate | — |
| AppointmentConfirmation | Read summary, ask confirm | Parse yes/no/change | — |
| ToolExecution | Execute pending tool | Handle result, retry on failure | `create_appointment`, `create_support_ticket`, `request_human_handoff` |
| Summary | Generate AI summary, update CRM | — | `update_conversation_memory` |
| Goodbye | Send farewell audio | — | `end_call` |

### Phase 3: Integration with Media Stream Handler (Week 2)

#### 3.1 Extend `RealtimeSessionManager` Session
**File**: `backend/src/services/realtimeSessionManager.js`

Add to `RealtimeSession` class:
```javascript
this.conversationEngine = null; // ConversationStateMachine instance
this.conversationContext = null; // ConversationContext instance
this.conversationState = STATES.GREETING;
this.previousConversationState = null;
```

#### 3.2 Wire Events in `mediaStreamHandler.js`
Replace ad-hoc `currentStage` logic with conversation engine:

```javascript
// In handleMediaStream():
// 1. On 'start': create ConversationContext, ConversationStateMachine
// 2. On provider 'ready': engine.handleEvent('greeting_complete')
// 3. On 'callerTranscript': engine.handleEvent('user_utterance', {text, isInterruption})
// 4. On 'speechStarted': engine.handleEvent('barge_in')
// 5. On 'toolCall': engine.handleEvent('tool_requested', {name, args, callId})
// 6. On provider 'responseCompleted': engine.handleEvent('ai_response_complete')
// 7. On 'stop'/'close': engine.handleEvent('call_ended')
```

#### 3.3 Provider Instruction Updates
When state changes, call `provider.updateInstructions()` with state-specific prompt:

```javascript
const STATE_PROMPTS = {
  [STATES.GREETING]: 'Greet the caller warmly. One sentence.',
  [STATES.IDENTIFY_CUSTOMER]: 'Silent - system is looking up caller.',
  [STATES.INTENT_DETECTION]: 'Listen for what the caller needs. Classify intent.',
  [STATES.SALES]: 'You are in sales mode. Qualify the lead. Ask about fleet size, timeline.',
  [STATES.SUPPORT]: 'You are in support mode. Gather issue details and contact info.',
  [STATES.FAQ]: 'Answer the question from knowledge base. Be concise.',
  [STATES.LEAD_QUALIFICATION]: 'Qualify the lead: fleet size, decision timeline, budget, authority.',
  [STATES.APPOINTMENT_COLLECTION]: 'Collect missing appointment fields. One at a time.',
  [STATES.APPOINTMENT_CONFIRMATION]: 'Read back the appointment summary. Ask for confirmation.',
  [STATES.TOOL_EXECUTION]: 'Executing tool. Wait for result.',
  [STATES.SUMMARY]: 'Generate a brief call summary for the CRM.',
  [STATES.GOODBYE]: 'Say goodbye warmly. End the call.',
};
```

### Phase 4: Persistence & Recovery (Week 2-3)

#### 4.1 Database Schema Updates
**File**: `backend/prisma/schema.prisma`

Add to `AiReceptionistCall` model:
```prisma
model AiReceptionistCall {
  // ... existing fields
  conversationState   String   @default("GREETING")
  previousState       String?
  collectedData       Json     @default("{}")
  intentQueue         Json     @default("[]")
  pendingToolCall     Json?
  customerMemory      Json?
}
```

#### 4.2 Persist on Every State Transition
**File**: `backend/src/services/conversation/ConversationContext.js`

```javascript
async persist() {
  await prisma.aiReceptionistCall.update({
    where: { id: this.callRecordId },
    data: {
      conversationState: this.conversationState,
      previousState: this.previousState,
      collectedData: this.collectedData,
      intentQueue: this.intentQueue,
      pendingToolCall: this.pendingToolCall,
      customerMemory: this.customerMemory,
    }
  });
}
```

#### 4.3 Recovery on Provider Reconnect
**File**: `backend/src/services/mediaStreamHandler.js` → `connectProvider()`

```javascript
// On provider reconnect (has resumptionHandle):
const call = await prisma.aiReceptionistCall.findUnique({ where: { twilioCallSid: callSid } });
if (call && call.conversationState !== 'GOODBYE') {
  // Restore context
  context.restore(call);
  engine = new ConversationStateMachine(context, services);
  
  // Replay last 5 transcript entries to provider for context
  const recentTranscript = call.transcript?.slice(-5) || [];
  for (const entry of recentTranscript) {
    provider.sendText(`[Context] ${entry.role}: ${entry.content}`);
  }
  
  // Resume at saved state
  engine.handleEvent('provider_reconnect');
}
```

#### 4.4 Idempotency for Tool Execution
**File**: `backend/src/services/conversation/handlers/ToolExecutionHandler.js`

```javascript
async executeTool(toolName, args) {
  const idempotencyKey = `${callSid}_${toolName}_${JSON.stringify(args)}`;
  if (await redis.exists(`idempotent:${idempotencyKey}`)) {
    return { success: true, duplicate: true, cached: true };
  }
  
  const result = await toolRegistry.execute(toolName, args);
  
  if (result.success) {
    await redis.setex(`idempotent:${idempotencyKey}`, 3600, JSON.stringify(result));
  }
  return result;
}
```

### Phase 5: Interruption & Multi-Intent Support (Week 3)

#### 5.1 Interruption Handler
**File**: `backend/src/services/conversation/InterruptionHandler.js`

```javascript
export class InterruptionHandler {
  static handle(engine, interruptionType, data) {
    switch (interruptionType) {
      case 'barge_in':
        engine.provider.cancelResponse();
        return engine.stayInState({ rePrompt: true });
      
      case 'correction':
        engine.context.updateCollectedData(data.corrections);
        return engine.stayInState({ acknowledgeCorrection: true });
      
      case 'topic_change':
        engine.context.queueIntent(data.newIntent, data.priority);
        return engine.transitionTo(STATES.INTENT_DETECTION);
      
      case 'hold_request':
        engine.pauseTimers();
        return engine.pauseState();
      
      case 'escalation':
        engine.context.setPendingTool('request_human_handoff', data);
        return engine.transitionTo(STATES.TOOL_EXECUTION);
    }
  }
}
```

#### 5.2 Multi-Intent Queue
**File**: `backend/src/services/conversation/ConversationContext.js`

```javascript
queueIntent(intent, priority = 'normal', data = {}) {
  this.intentQueue.push({ intent, priority, data, timestamp: Date.now() });
  this.intentQueue.sort((a, b) => priorityOrder(b.priority) - priorityOrder(a.priority));
}

async processNextIntent() {
  if (this.intentQueue.length === 0) return null;
  const next = this.intentQueue.shift();
  this.currentIntent = next.intent;
  return next;
}
```

### Phase 6: Testing & Migration (Week 3-4)

#### 6.1 Unit Tests for State Machine
**File**: `backend/tests/conversation/stateMachine.test.js`

- Test all valid transitions
- Test invalid transitions are rejected
- Test interruption handling from each state
- Test multi-intent queue ordering
- Test persistence/restore

#### 6.2 Integration Tests
**File**: `backend/tests/conversation/integration.test.js`

- Full call flow: GREETING → GOODBYE
- Sales flow with appointment booking
- Support flow with ticket creation
- FAQ flow with follow-up
- Interruption scenarios (barge-in, correction, topic change)
- Provider failure + recovery
- Concurrent calls

#### 6.3 Migration Strategy
1. **Feature flag**: `AI_RECEPTIONIST_FSM_ENABLED` (default: false)
2. **Shadow mode**: Run FSM in parallel, compare outputs, log discrepancies
3. **Gradual rollout**: Enable for 10% of calls, monitor metrics
4. **Full enable**: After 1 week stable, enable for all
5. **Deprecate**: Remove `receptionistOrchestrator.processReceptionistTurn` and `receptionistAgent.processMessage` after confirmation

### Phase 7: Observability (Week 4)

#### 7.1 Metrics
Add to `receptionistMetrics.service.js`:
```javascript
recordStateTransition(fromState, toState, trigger, durationMs)
recordInterruption(type, fromState)
recordIntentDetected(intent, confidence)
recordToolExecution(tool, success, durationMs)
recordRecovery(success, reason)
```

#### 7.2 Dashboard Updates
- Real-time state distribution
- Transition funnel (GREETING → GOODBYE conversion)
- Interruption rate by type
- Recovery success rate
- Average states per call

## File Structure (New)

```
backend/src/services/conversation/
├── ConversationStateMachine.js       # Core FSM
├── ConversationContext.js            # Session context + persistence
├── states.js                         # State enum + transition table
├── InterruptionHandler.js            # Interruption logic
├── handlers/
│   ├── BaseStateHandler.js
│   ├── GreetingHandler.js
│   ├── IdentifyCustomerHandler.js
│   ├── IntentDetectionHandler.js
│   ├── SalesHandler.js
│   ├── SupportHandler.js
│   ├── FaqHandler.js
│   ├── LeadQualificationHandler.js
│   ├── AppointmentCollectionHandler.js
│   ├── AppointmentConfirmationHandler.js
│   ├── ToolExecutionHandler.js
│   ├── SummaryHandler.js
│   └── GoodbyeHandler.js
└── index.js                          # Exports
```

## Modified Files (Existing)

| File | Changes |
|------|---------|
| `realtimeSessionManager.js` | Add `conversationEngine`, `conversationContext`, `conversationState` to session |
| `mediaStreamHandler.js` | Replace `currentStage`/`pendingAction` logic with engine events |
| `receptionistRealtime.service.js` | Add conversation state to legacy session proxy |
| `prisma/schema.prisma` | Add conversationState, collectedData, intentQueue, pendingToolCall fields |
| `receptionistMetrics.service.js` | Add FSM metrics |
| `receptionistVoice.service.js` | Add `buildStatePrompt(state, context)` for provider instructions |

## Deprecated (After Migration)

| File | Replacement |
|------|-------------|
| `receptionistOrchestrator.service.js` | `ConversationStateMachine` + handlers |
| `receptionistAgent.service.js` | `ConversationStateMachine` + handlers (text API uses same engine) |

## Rollback Plan

If issues arise:
1. Set `AI_RECEPTIONIST_FSM_ENABLED=false`
2. Old orchestrators remain functional
3. Database fields are additive (no breaking changes)
4. Session manager falls back to `currentStage` logic

## Success Criteria

- [ ] Zero random state jumps (deterministic transitions only)
- [ ] 100% of responses move to next logical state
- [ ] Interruption handling: barge-in < 500ms, correction acknowledged, topic change queued
- [ ] Context recovery: 99%+ session restore success after provider reconnect
- [ ] Multi-intent: secondary intents processed after primary completes
- [ ] Metrics: state transition funnel visible in dashboard
- [ ] All existing tests pass
- [ ] New test coverage > 90% for conversation engine

## Timeline Summary

| Week | Deliverable |
|------|-------------|
| 1 | Core FSM, Context, State Enum, Transition Table, Base Handler |
| 2 | 13 State Handlers, Media Stream Integration, Provider Prompts |
| 3 | Persistence, Recovery, Idempotency, Interruption Handler, Multi-Intent |
| 4 | Testing, Migration, Observability, Rollout |