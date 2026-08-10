# FleetNimble Enterprise AI Receptionist — Master Architecture

**Target:** Alivo-class enterprise receptionist on the existing FleetNimble stack.
**Constraint:** No rewrites of working modules. All changes are additive layers above the existing pipeline (Twilio Media Streams, Gemini Live, CRM, RAG, Dashboard, Business Tools, Appointment, Tickets, Memory).

---

# PART A — SYSTEM ARCHITECTURE

## A1. Layered Design

```
┌────────────────────────────────────────────────────────────────────┐
│                      EXISTING TRANSPORT LAYER                       │
│   Twilio Media Streams ←→ mediaStreamHandler.js ←→ Gemini Live      │
└────────────────────────────────────────────────────────────────────┘
                                │ events (transcript, speechStarted, toolCall)
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│                       ORCHESTRATION LAYER (NEW)                     │
│                                                                     │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────────────┐ │
│  │ Conversation   │  │ Conversation   │  │ Adaptive Response     │ │
│  │ Planner        │  │ Memory Service │  │ Engine                │ │
│  │ (think-before- │  │ (all facts,    │  │ (tone/pace/length per │ │
│  │  reply)        │  │  never lost)   │  │  caller state)        │ │
│  └───────┬────────┘  └───────┬────────┘  └───────────┬───────────┘ │
│          │                   │                       │             │
│  ┌───────┴───────────────────────────────────────────┴───────────┐ │
│  │              FINITE-STATE CONVERSATION ENGINE                  │ │
│  │  GREETING → IDENTIFY → INTENT → SALES/SUPPORT/FAQ/LEAD_QUAL   │ │
│  │  → APPT_COLLECT → APPT_CONFIRM → TOOL_EXEC → SUMMARY → GOODBYE│ │
│  │  (per docs/CONVERSATION_STATE_DIAGRAM.md)                      │ │
│  └───────┬────────────────────────────────────────────────────────┘ │
│          │                                                          │
│  ┌───────┴──────────────────────────────────────────────────────┐  │
│  │  BUSINESS INTELLIGENCE SERVICE (NEW)                         │  │
│  │  industry · fleet size · vehicle types · pain points ·       │  │
│  │  urgency · budget signals · buying stage · decision maker    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
  EXISTING TOOLS          EXISTING SERVICES       NEW PERSISTENCE
  appointment, ticket,    CRM, RAG, calendar,     ConversationRecord
  handoff, knowledge,     notification, metrics,  CallPlanRecord
  live tools, end_call    analytics, transcript
```

## A2. Data Flow per Turn

```
1. Caller utterance arrives (callerTranscript event)
2. Conversation Memory Service loads/refreshes caller facts
3. Business Intelligence Service extracts + stores signals
4. Conversation Planner computes: currentGoal, nextGoal, missingInfo,
   bestQuestion, expectedTool, exitCondition
5. Finite-State Engine validates transition (deterministic table)
6. Adaptive Response Engine selects length/tone/fill variants
7. Provider receives reply via Gemini Live (updateInstructions + sendText)
8. On state change → persist → dashboard socket events
```

---

# PART B — CONVERSATION PLANNING (Objective 1)

## B1. New Service: `ConversationPlanner`

**File:** `backend/src/services/conversation/ConversationPlanner.js`

```javascript
// Think before replying. Every turn produces a structured plan.
export class ConversationPlanner {
  constructor(context, memory, intelligence) { ... }

  async planForUtterance(utterance, emotion) {
    const intelligence = await this.intelligence.analyze(utterance); // §E
    const nextState = this.fsm.getNextState('user_utterance', intelligence);
    const stateHandler = this.registry.get(nextState);

    return {
      // what we are doing now
      currentGoal: stateHandler.describeGoal(this.context),

      // what happens after this turn
      nextGoal: stateHandler.describeNextGoal(),

      // what we still don't know about the caller / request
      missingInformation: stateHandler.getMissingFields(this.context),

      // the single best question to ask next (or null if none needed)
      bestQuestion: stateHandler.pickQuestion(this.context, intelligence),

      // tool expected to run at the end of this goal (or null)
      expectedTool: stateHandler.getExpectedTool(),

      // condition under which this state is exited
      exitCondition: stateHandler.getExitCondition(),

      // proactive suggestion eligibility (see §D)
      suggestions: this.proactive.maybeSuggest(intelligence, this.context),
    };
  }
}
```

## B2. Example Plan (Sales → Booking)

```javascript
// Caller: "Our 40 trucks keep losing GPS signal, and we're evaluating new options."
{
  currentGoal: "Understand GPS reliability pain and fleet context",
  nextGoal: "Qualify the lead (timeline, authority)",
  missingInformation: ["fleetSize confirmed=40", "timeline", "decisionRole",
                       "currentProvider", "contact"],
  bestQuestion: "When are you hoping to have a new solution in place?",
  expectedTool: "create_appointment",
  exitCondition: "Lead qualified AND caller agrees to demo",
  suggestions: [{ type: "demo_offer", reason: "evaluating + fleet pain" }]
}
```

## B3. Plan Record (persisted per turn)

```javascript
{
  callSid, turn, state, intent,
  currentGoal, nextGoal, missingInformation,
  bestQuestion, expectedTool, exitCondition,
  intelligenceSnapshot, planHash        // dedupe: identical plans get fresh wording
}
```

---

# PART C — CONVERSATION MEMORY (Objective 2)

## C1. New Service: `ConversationMemoryService`

**File:** `backend/src/services/conversation/ConversationMemoryService.js`

Extends the existing `receptionistMemory.service.js` (which stays untouched) with a live, in-call memory object that is persisted on every change:

```javascript
export class ConversationMemoryService {
  constructor(callSid, customerId, userId) {
    this.callSid = callSid;
    this.memory = {
      identity:      { name, company, fleetSize, phone, email, preferredLanguage, timezone },
      interaction:   { lastQuestions: [], lastSentiment, lastIntent, emotionTrajectory: [] },
      history:       { appointments: [], tickets: [], calls: [] },   // from getCustomerMemory()
      business:      {},                                              // §E output
      flags:         { returning, knowsFleetNimble, busy, talkative, interrupted: 0 },
    };
  }

  async hydrate() { /* getCustomerMemory() → fill history + identity */ }
  async update(patch) { /* merge, set lastSentiment, persist to DB (below) */ }

  async persist() {
    await prisma.receptionistCustomer.update({
      where: { id: this.customerId },
      data: {
        metadata: { ...existingMetadata, lastConversationMemory: this.memory },
      },
    });
  }

  buildContextPrompt() {
    // Injected into provider instructions at every state change:
    // - name/company/fleet size (always)
    // - returning-customer summary + last topic (first turn only)
    // - open ticket reference if one exists
    // - preferred language/timezone (never re-ask)
    // - last sentiment + emotion trajectory
    // - business intelligence snapshot
  }
}
```

## C2. What Is Remembered & How It Is Used

| Fact | Source | Natural Usage |
|------|--------|---------------|
| caller name | extract / CRM | "Thank you, Sarah." — every acknowledgement |
| company | extract / CRM | "How is Acme Logistics doing this week?" |
| fleet size | extract / CRM | "With 40 trucks, predictive maintenance would pay off quickly." |
| last questions | this call | "You asked about GPS earlier — related to the demo?" |
| previous appointments | CRM | "How did last month's demo go?" |
| support history | CRM | "I see your open ticket #AB12 — has the issue resolved?" |
| preferred language | detected / stored | Speak caller's language when detected |
| timezone | detected / stored | Schedule in caller's local time, never re-ask |
| last sentiment | CRM sentimentHistory | Warm re-entry: "Good to hear things are going well since we last spoke." |

## C3. Provider Context Injection (Modified)

**File:** `backend/src/services/mediaStreamHandler.js` (minimal change)

```javascript
// Existing: memoryContext built once at connect.
// New: on every conversation-state transition, call:
provider.updateInstructions(
  conversationEngine.buildStatePrompt({
    state, memory: memoryService.buildContextPrompt(), emotion, plan
  })
);
```

---

# PART D — ADAPTIVE CONVERSATION + PROACTIVE SUGGESTIONS (Objectives 3 & 4)

## D1. Adaptive Response Engine

**File:** `backend/src/services/conversation/AdaptiveResponseEngine.js`

```javascript
export const ADAPTIVE_PROFILES = {
  BUSY:      { maxSentences: 2, pace: 'fast', allowSmallTalk: false, fillers: 0 },
  NORMAL:    { maxSentences: 3, pace: 'normal', allowSmallTalk: true, fillers: 1 },
  TALKATIVE: { maxSentences: 4, pace: 'leisurely', allowSmallTalk: true, fillers: 2,
               inviteDetail: true },
  KNOWS_FLEETNIMBLE: { skipIntro: true, skipGreetingDetails: true, maxSentences: 3 },
};

export class AdaptiveResponseEngine {
  detectProfile(memory, emotion, utterance) {
    if (memory.flags.knowsFleetNimble) return ADAPTIVE_PROFILES.KNOWS_FLEETNIMBLE;
    if (/asap|quick|in a hurry|briefly|short answer/i.test(utterance)) return ADAPTIVE_PROFILES.BUSY;
    if (emotion === 'TALKATIVE' || utterance.length > 60) return ADAPTIVE_PROFILES.TALKATIVE;
    return ADAPTIVE_PROFILES.NORMAL;
  }

  injectProfile(profile) {
    return `
      RESPONSE ADAPTATION:
      - Maximum ${profile.maxSentences} sentences per turn.
      - ${profile.allowSmallTalk ? 'Brief pleasantries allowed.' : 'Skip small talk.'}
      - ${profile.inviteDetail ? 'Offer deeper explanation if they want it.' : 'Keep answers concise.'}
      - ${profile.skipIntro ? 'Caller already knows FleetNimble — do NOT reintroduce the company.' : ''}
      - Filler budget this turn: ${profile.fillers} (use zero or one).
    `;
  }
}
```

**Known-caller detection:** if `memory.history.appointments.length > 0 || memory.flags.returning` → skip intro. Same for `retrieve_knowledge` hits — do not re-answer identical questions: "We covered that earlier — happy to go deeper if you'd like."

## D2. Proactive Suggestion Engine

**File:** `backend/src/services/conversation/ProactiveSuggestionEngine.js`

| Trigger | Suggestion | Wording Pool (rotated) |
|---------|-----------|------------------------|
| Caller asks about GPS / tracking | Driver Analytics | "Since you're interested in tracking — our driver analytics pairs well with it. Worth a quick look?" |
| Caller books demo | Email confirmation offer | "I've got your email on file — shall I send the confirmation there?" |
| Caller reports issue | Ticket reference | "I'll raise a ticket so our team can follow up. Would you like the reference number?" |
| Caller asks pricing | Personalized demo | "Pricing depends on fleet size and modules. Would a personalized demo make it clearer?" |
| Returning customer w/ open ticket | Status check | "Before we continue — has your open ticket been resolved?" |
| Caller mentions competitors | Differentiator | "Good to know. Where most fleet tools fall short is [X] — FleetNimble does [Y] instead." |
| Silence after pricing answer | Demo offer | "Would it help to see this on your actual fleet profile?" |

Rules: max 1 proactive suggestion per turn, never on turn 1, never after a NO, suggestion must be relevant to detected intent (§E), and wording never repeats for the same caller.

---

# PART E — BUSINESS INTELLIGENCE (Objective 5)

## E1. New Service: `BusinessIntelligenceService`

**File:** `backend/src/services/conversation/BusinessIntelligenceService.js`

```javascript
export class BusinessIntelligenceService {
  constructor(userId) { this.customerId = null; }

  // Runs on every caller transcript (cheap, incremental) + at key turns.
  async analyze(utterance) {
    const signals = {
      industry:        detectIndustry(utterance),      // logistics, construction, food, healthcare...
      fleetSize:       detectFleetSize(utterance),     // reuse existing extractDetails regex
      vehicleTypes:    detectVehicleTypes(utterance),  // trucks, vans, buses, cars, trailers
      painPoints:      detectPainPoints(utterance),    // downtime, fuel, compliance, safety, theft
      urgency:         detectUrgency(utterance),       // HIGH/MEDIUM/LOW (§CONVERSATION_INTELLIGENCE)
      budgetSignals:   detectBudgetSignals(utterance), // budget, price sensitivity, "cost per vehicle"
      buyingStage:     inferBuyingStage(signals),      // AWARENESS → EVALUATION → DECISION
      decisionMaker:   detectDecisionMaker(utterance), // "I manage ops", "my CTO", "we have a team"
    };
    this.merge(signals);   // accumulate into memory.business
    return signals;
  }

  // Persisted automatically on every change (memory.persist()).
  // Feeds lead scoring + CRM metadata + dashboard intelligence widgets.
}
```

**Inference example:** `"We run 60 delivery vans in Mumbai and fuel is killing us"` →
`industry: logistics, fleetSize: 60, vehicleTypes: [vans], painPoints: [fuel_cost], urgency: MEDIUM, buyingStage: EVALUATION`.

## E2. What Happens With the Signals

| Signal | Consumer |
|--------|----------|
| industry + vehicleTypes | RAG query bias (knowledge retrieval tuned to context) |
| painPoints | Proactive suggestions (§D2), demo personalization |
| budgetSignals | Lead scoring bump (existing `computeLeadScore` extended) |
| buyingStage | FSM transition weight (AWARENESS → FAQ first; DECISION → book demo) |
| decisionMaker | CRM `metadata.decisionMaker`; handoff department routing |
| urgency | Appointment fast-track, ticket urgency field |
| ALL | `receptionistCustomer.metadata.businessIntelligence` (Json) + dashboard |

---

# PART F — NEVER LOSE CONTEXT (Objective 6)

## F1. Interruption Continuity

```
Caller interrupts mid-sentence → speechStarted → provider.cancelResponse()
→ ConversationMemory marks interruption point (lastPlan + state + transcript index)
→ After silence gap (600ms), engine re-prompts in the SAME state:
   "You were telling me about your fleet — how many vehicles was it?"
```

## F2. Provider Reconnect Resume

```
Provider drops → resumptionHandle saved → reconnect
→ Load AiReceptionistCall.conversationState + collectedData + intentQueue
→ Rebuild ConversationContext + Planner + Memory (hydrate from DB)
→ Replay last 4 transcript entries via updateInstructions (context seed)
→ Resume at exact state, not GREETING:
   "Apologies for the brief pause — you were about to book your demo for Thursday afternoon."
```

## F3. Topic Change (Task Stack)

```javascript
// Caller: "Actually, before that — my tracker stopped working."
this.context.taskStack.push({ state: SALES, goal: plan.currentGoal,
                              data: collectedDataSnapshot });
this.fsm.transition('INTENT_DETECTION');
// After support resolves:
const resume = this.context.taskStack.pop();
this.fsm.transitionTo(resume.state, { snapshot: resume.data });
// "Back to your demo — Thursday afternoon, correct?"
```

Task stack is bounded (max 3) and persisted with the session.

---

# PART G — CONVERSATION QUALITY (Objective 7)

## G1. Anti-Repetition Guarantees

| Dimension | Mechanism |
|-----------|-----------|
| No repeated greetings | Greeting spoken once; `greetingDelivered` flag persisted on call record |
| No repeated explanations | `explainedTopics` set in memory; re-ask → "We covered that — shall I go deeper?" |
| No repeated filler words | Filler budget per call (max 3), tracked list, variant pools ≥ 4 per type |
| Unique conversations | Variant pools seeded by `customerId` hash; planHash dedupes identical plan wording |
| No robotic replies | Contractions enforced in style prompt; sentence-length variance in adaptive profiles |

## G2. Style Prompt (canonical — applied on every state change)

```
STYLE RULES (always active):
- Speak like a human receptionist. Contractions only. No lists.
- 2–4 sentences per turn (adaptive profile overrides length only).
- One question per turn. Acknowledge every answer before the next question.
- Never repeat a phrase already used this call. Never stack fillers.
- Use the caller's name once per turn at most, never twice in a row.
- If unsure, say so honestly: "Let me check that for you."
- NEVER describe tools or internal mechanics to the caller.
```

---

# PART H — CODE CHANGES

## H1. New Services (all under `backend/src/services/conversation/`)

```
conversation/
├── index.js                        # exports + engine composition root
├── ConversationStateMachine.js     # FSM (per IMPLEMENTATION_PLAN.md)
├── ConversationContext.js          # session context + task stack + persistence
├── ConversationPlanner.js          # §B
├── ConversationMemoryService.js    # §C
├── AdaptiveResponseEngine.js       # §D1
├── ProactiveSuggestionEngine.js    # §D2
├── BusinessIntelligenceService.js  # §E
├── ResponseVariants.js             # §G anti-repetition pools
├── EmotionState.js                 # per EMOTION_AWARE_PERSONALITY.md
├── InterruptionHandler.js          # §F1
└── handlers/
    ├── BaseStateHandler.js
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

## H2. Modified Services (minimal, additive)

| File | Change |
|------|--------|
| `mediaStreamHandler.js` | Wire engine events; replace `currentStage` reads with `conversationEngine.state`; keep all audio/tool/reconnect logic intact |
| `realtimeSessionManager.js` | Session object gains `conversationEngine`, `conversationContext` (thin references) |
| `receptionistRealtime.service.js` | Proxy getters for conversation state (legacy compatibility) |
| `receptionistVoice.service.js` | `buildSystemPrompt()` now assembles: base Ava prompt (§G2) + adaptive profile + memory context + emotion modifier + state instruction; add `buildStatePrompt()` export |
| `receptionistMemory.service.js` | **No rewrite.** New `ConversationMemoryService` calls it; optionally add `metadata.lastConversationMemory` write path |
| `receptionistMetrics.service.js` | Add: state transitions, plan coverage, suggestion acceptance, intelligence signals, interruption recovery time |
| `twilioWebhook.service.js` | **No change** |
| `receptionistOrchestrator.service.js` | Retained for text/API mode; FSM becomes primary for voice; shared classifier moved to `IntentDetectionHandler` |
| `receptionistAgent.service.js` | Deprecated after rollout (text API migrates to FSM) |

## H3. Never-Touched List (guaranteed)

Twilio Media Streams handler internals, Gemini provider (`geminiLive.provider.js`), OpenAI provider, audio codecs/resampler/bridge, RAG engine + knowledge providers, CRM/notification/calendar/handoff/audit/cache-refresh services, socket events.

---

# PART I — DATABASE CHANGES (additive only)

**File:** `backend/prisma/schema.prisma`

```prisma
model ReceptionistCustomer {
  // existing fields unchanged ...

  // ── Enterprise additions ──
  preferredLanguage  String? @map("preferred_language")         // detected, never re-ask
  timezone           String? @map("timezone")                   // detected, used for scheduling
  industry           String?                                     // §E
  businessIntelligence Json @default("{}")                       // §E full snapshot
  lastEmotion        String? @map("last_emotion")
}

model AiReceptionistCall {
  // existing fields unchanged ...

  // ── Enterprise additions ──
  conversationState String  @default("GREETING") @map("conversation_state")
  previousState     String? @map("previous_state")
  intentQueue       Json    @default("[]") @map("intent_queue")
  taskStack         Json    @default("[]") @map("task_stack")
  pendingToolCall   Json?   @map("pending_tool_call")
  planningLog       Json    @default("[]") @map("planning_log")   // §B3, capped 50
  greeted           Boolean @default(false)
}

model AiReceptionistAppointment {
  // existing fields unchanged ...
  leadStage     String? @map("lead_stage")       // AWARENESS/EVALUATION/DECISION at booking
  confirmedBy   Boolean @default(false) @map("confirmed_by_caller")  // audit trail
}
```

Migration: `npx prisma migrate dev --name enterprise_receptionist` — purely additive, zero destructive operations.

---

# PART J — API CHANGES

## J1. Existing endpoints unchanged.

All routes in `backend/src/routes/aiReceptionist.routes.js` (calls, appointments, tickets, customers, pipeline, audit logs, agent text chat) remain unchanged and keep working during and after rollout.

## J2. New internal endpoints (registered in `backend/src/routes/aiReceptionist.routes.js`)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/receptionist/plans/:callSid` | Planning log for a call (debug/audit) |
| GET | `/api/receptionist/memory/:customerId` | Live conversation memory snapshot |
| GET | `/api/receptionist/intelligence/:customerId` | Business intelligence summary |
| GET | `/api/receptionist/suggestions/stats` | Suggestion acceptance metrics |
| POST | `/api/receptionist/plans/:callSid/pause` | Admin pause/resume (manual hold) |

All new routes: same auth middleware + rate limiting as existing receptionist routes (`aiReceptionistLimiter`), matching patterns in `aiReceptionist.routes.js`.

---

# PART K — FRONTEND / DASHBOARD UPDATES

Frontend is a Vite + React SPA (`frontend/src`). All changes are additive panels/components using existing service-layer patterns (`frontend/src/services`, `frontend/src/pages`).

| Dashboard Component | Change |
|---------------------|--------|
| Call detail drawer/page (`frontend/src/pages`) | Show live `conversationState`, planning log (currentGoal/nextGoal/bestQuestion) |
| Customer profile page (`frontend/src/pages`) | Business intelligence panel: industry, vehicle types, pain points, buying stage, decision maker, preferred language/timezone |
| Call analytics page (`frontend/src/pages`) | Suggestion acceptance rate, plan coverage, emotion trajectory chart |
| Realtime cards (`frontend/src/components`) | Active call state distribution (live from FSM transitions) |
| CRM customer row/table (`frontend/src/components`) | Intelligence badges (industry · stage · urgency) |

New API consumers added to `frontend/src/services` (e.g. `receptionistEnterprise.js`) fetching the J2 endpoints — no changes to existing services.

---

# PART L — TESTING PLAN

## L1. Unit Tests (`backend/tests/conversation/`)

| File | Coverage |
|------|----------|
| `planner.test.js` | Plan fields present for all 12 states; bestQuestion null when nothing missing; expectedTool correct per state; planHash dedupe |
| `memory.test.js` | Hydrate from CRM; update+persist round-trip; context prompt includes/omits intro correctly |
| `adaptive.test.js` | Profile selection (BUSY/TALKATIVE/KNOWS); sentence caps enforced; filler budget |
| `proactive.test.js` | Trigger→suggestion matrix; max 1/turn; never after NO; no repetition per caller |
| `intelligence.test.js` | Industry/fleet/vehicle/pain/urgency/stage/decision-maker detection fixtures |
| `fsm-continuity.test.js` | Interruption re-entry; reconnect resume at state; topic-change stack push/pop |
| `quality.test.js` | No repeated phrases across 20-turn simulated call; greeting once; closing exact |

## L2. Integration Tests (`backend/tests/conversation/integration.test.js`)

1. Full happy path: GREETING → IDENTIFY → INTENT(SALES) → LEAD_QUAL → APPT_COLLECT (one field/turn) → APPT_CONFIRM (readback) → TOOL_EXEC (create_appointment after confirmation) → SUMMARY → GOODBYE; assert DB rows (customer, appointment, call.conversationState=GOODBYE, CRM updated, socket events).
2. Interruption mid-booking → resume same field.
3. Topic change (sales→support→back) → task stack restored.
4. Provider disconnect at TOOL_EXECUTION → recovery → idempotent (no duplicate appointment).
5. Returning customer: no re-introduction, reference to last appointment.
6. Busy caller: replies ≤ 2 sentences.
7. Proactive suggestion offered and accepted → demo offered naturally.
8. Duplicate appointment attempt → blocked (confirmedBy flag).

## L3. Regression — existing suites must pass untouched

`ai-receptionist-greeting`, `ai-receptionist-realtime`, `receptionist-twilio`, `receptionist-business-tools`, `receptionist-ownership-validation`, `realtime-pipeline`.

## L4. Manual QA Script

Dial-in checklist: greeting exactness → booking flow readback → CRM/dashboard updates in real time → barge-in during long answer → close phone mid-reply → redial (memory recall) → second topic in one call → fillers not repeated.

---

# PART M — ROLLOUT & SUCCESS CRITERIA

1. **Flag:** `AI_RECEPTIONIST_ENTERPRISE_ENABLED` (default false)
2. **Shadow:** engine runs beside existing flow; planning logs compared; no behavioral change to callers
3. **Canary:** 10% of calls → monitor metrics (above) → 25% → 100%
4. **Rollback:** flag off; old orchestration path intact; new DB columns ignored

**Success criteria:** plan coverage 100% of turns · zero random state jumps · booking confirmation gate never bypassed (tested) · provider-reconnect resume < 2s · suggestion acceptance > 20% · duplicate appointments = 0 · all regression suites green · no repeated phrase for same caller across consecutive calls.