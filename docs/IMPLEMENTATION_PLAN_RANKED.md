# FleetNimble AI Receptionist — Implementation Plan (Ranked by Impact)

## Plan Summary

Based on the production audit (66.9/100), the highest-impact work is in the **conversation layer**. All items below preserve the existing architecture — no changes to Twilio, Gemini Live, Media Streams, CRM, RAG, or business tools.

---

## Phase 1: Quick Wins (Days 1–2)

### 1.1 Personality System Prompt Overhaul — Impact 80 / Effort S

**Do:** Replace `buildSystemPrompt()` in `receptionistVoice.service.js` with the new Ava personality prompt (`docs/PERSONALITY_UPGRADE.md`).

**Changes:**
- Exact greeting opening: "Thank you for calling FleetNimble."
- 2–4 sentence reply limit.
- Contractions, natural fillers (max 3/call), anti-repetition rules.
- Exact closing: "Thank you for calling FleetNimble. We appreciate your time. Have a wonderful day."
- Returning-customer greeting with name + last-topic reference.

**Touch points:** `receptionistVoice.service.js` (system prompt only). No architecture change.

### 1.2 Anti-Repetition Across Calls — Impact 45 / Effort S

**Do:** Add a variant-pool mechanism seeded by customer ID hash so identical phrasing is not reused for the same customer on consecutive calls.

**Touch points:** New `responseVariants.js` utility; used by the prompt assembly.

### 1.3 Sentiment Telemetry — Impact 40 / Effort S

**Do:** Emit `emotion_transition` and `sentiment` metrics events from the transcript handler; surface in dashboard.

**Touch points:** `receptionistMetrics.service.js` (additive).

---

## Phase 2: Appointment Booking Enforcement (Days 3–5)

### 2.1 One-Field-At-A-Time Collection — Impact 80 / Effort S

**Do:** Update the appointment state prompt to collect exactly one field per turn (name → company → email → phone → fleet size → date → morning/afternoon). Acknowledge each field.

**Touch points:** State prompt templates only.

### 2.2 Readback + Confirmation Gate — Impact 80 / Effort S

**Do:**
- After all fields: read back full details and ask "Have I captured everything correctly?"
- `create_appointment` tool call is **only** allowed when:
  1. State == `APPOINTMENT_CONFIRMATION`
  2. `confirmationReceived == true` in collectedData
  3. Tool args validated against collectedData
- If `create_appointment` is requested without confirmation, the engine denies it and prompts readback.

**Touch points:** `mediaStreamHandler.js` `executeToolCall` guard + state prompt. This is the only non-prompt enforcement change.

### 2.3 Post-Creation Confirmation Script — Impact 60 / Effort S

**Do:** On success, speak the exact confirmation script ("Wonderful. Your FleetNimble demo has been booked successfully...") with variant rotation.

---

## Phase 3: Finite-State Conversation Engine (Weeks 1–2) ⭐ Highest Impact

### 3.1 Core FSM — Impact 95 / Effort M

**Do:** Implement `ConversationStateMachine` (states, transition table, guard conditions) exactly as specified in `docs/IMPLEMENTATION_PLAN.md`.

**States:** GREETING, IDENTIFY_CUSTOMER, INTENT_DETECTION, SALES, SUPPORT, FAQ, LEAD_QUALIFICATION, APPOINTMENT_COLLECTION, APPOINTMENT_CONFIRMATION, TOOL_EXECUTION, SUMMARY, GOODBYE.

**Deterministic:** No random jumps. Every transition is event-driven through the transition table.

**Touch points:** New `backend/src/services/conversation/` directory. `realtimeSessionManager.js` and `mediaStreamHandler.js` become thin adapters (session holds engine instance; events forwarded).

### 3.2 Conversation Context & Persistence — Impact 85 / Effort M

**Do:** Add `conversationState`, `previousState`, `collectedData`, `intentQueue`, `pendingToolCall` to `AiReceptionistCall` in Prisma. Persist on every transition. Restore on provider reconnect.

### 3.3 Interruption Handling — Impact 75 / Effort M

**Do:** `InterruptionHandler` with:
- Barge-in → cancel response, stay in state, re-prompt
- Correction → update collectedData, acknowledge, stay
- Topic change → queue intent, transition to INTENT_DETECTION
- Hold → pause timers
- Escalation → transition to TOOL_EXECUTION (handoff)

### 3.4 Multi-Intent Queue — Impact 65 / Effort S

**Do:** Intent queue in context. Primary handled first; secondary processed after; caller informed: "And regarding the [X] you mentioned — [resolve]."

---

## Phase 4: Conversation Intelligence (Weeks 2–3)

### 4.1 Intent Detection Upgrade — Impact 70 / Effort M

**Do:** Replace keyword-only classifier with weighted multi-signal scoring (keywords + context state + history + entity references). Add small-talk and emergency handling as first-class intents.

**Touch points:** `receptionistOrchestrator.service.js` classifier → moved into `IntentDetectionHandler.js`.

### 4.2 Business Introduction Engine — Impact 60 / Effort S

**Do:** Dynamic "Tell me about FleetNimble" and "Why should I choose FleetNimble?" — assembled from capability pillars (tracking, driver analytics, maintenance, CRM, AI copilot, marketing automation, AI receptionist), selecting 2–3 most relevant to the caller, never a memorized paragraph.

### 4.3 Lead Qualification Conversation — Impact 65 / Effort S

**Do:** Structured qualification flow in `LEAD_QUALIFICATION` state: fleet size → decision timeline → decision authority → budget. One question per turn. Score internally. Qualified → offer demo; disqualified → informative exit.

### 4.4 Buying Signal & Urgency Detection — Impact 55 / Effort S

**Do:** Detect buying signals (budget, authority, need, timeline) and urgency; inject into context; influence state transitions (e.g., buying signal → prompt for demo; HIGH urgency → fast-track).

---

## Phase 5: Emotion-Aware Personality (Week 3)

### 5.1 Emotion Detection — Impact 70 / Effort M

**Do:** Implement `EmotionState` (CONFUSED, EXCITED, FRUSTRATED, ANXIOUS, EXPLORING, READY_TO_BUY, NEUTRAL) with scoring from caller transcripts, decay over turns.

### 5.2 Tone Modifiers — Impact 65 / Effort S

**Do:** `buildToneModifier(emotion)` injected into provider instructions via `updateInstructions()` on emotion state change. Adaptive flows for confusion recovery, frustration de-escalation, enthusiasm momentum, and anti-push exploring.

---

## Phase 6: Memory & Summary Enrichment (Week 3–4)

### 6.1 Context Injection Every Turn — Impact 60 / Effort S

**Do:** Inject memory, emotion, urgency, buying signals into provider context on every state transition (not just at connect).

### 6.2 Structured Summary — Impact 50 / Effort S

**Do:** Enrich AI summary with structured outcome: appointment id, ticket id, lead score, qualified status, emotion history, resolution status.

### 6.3 Mid-Call Summarization — Impact 45 / Effort M

**Do:** For calls > 15 min, generate a rolling summary and compress transcript context to keep the model within window.

---

## Phase 7: Testing, Rollout & Observability (Week 4)

### 7.1 Unit Tests

- FSM transitions (valid + invalid)
- Interruption matrix from each state
- Multi-intent ordering
- Emotion detection accuracy
- Confirmation-gate enforcement (create_appointment denied without confirmation)

### 7.2 Integration Tests

- Full happy-path call: greeting → booking → confirmation → CRM → dashboard
- Interruption scenarios (barge-in mid-booking, correction at readback, topic change from sales to support)
- Provider disconnect at each state + recovery assertions
- Long call (>10 min) with mid-call summarization

### 7.3 Rollout

1. Feature flag `AI_RECEPTIONIST_FSM_ENABLED` (default false)
2. Shadow mode: run FSM alongside old flow, log discrepancies
3. 10% rollout → monitor metrics → 100%
4. Old orchestrator code kept until stable; then deprecated

### 7.4 Dashboard Additions

- State distribution (live)
- Transition funnel (GREETING → GOODBYE)
- Interruption rate by type
- Emotion distribution + frustration resolution time
- Recovery success rate
- Booking confirmation rate (readbacks accepted / total)

---

## Effort Summary

| Phase | Effort | Timeline | Cumulative Score Gain (est.) |
|-------|--------|----------|-------------------------------|
| 1. Quick Wins | S | Days 1–2 | +3 |
| 2. Booking Enforcement | S | Days 3–5 | +4 |
| 3. FSM + Recovery | M | Weeks 1–2 | +15 |
| 4. Conversation Intelligence | M | Weeks 2–3 | +5 |
| 5. Emotion-Aware | M | Week 3 | +4 |
| 6. Memory & Summary | S–M | Weeks 3–4 | +2 |
| 7. Testing & Rollout | M | Week 4 | +2 |

**Estimated final score: ~85–90/100** (from 66.9/100) after all phases.

## Success Criteria

- [ ] Zero random state jumps
- [ ] `create_appointment` never executes before explicit confirmation
- [ ] 100% of callers receive the exact greeting opening
- [ ] 100% of successful calls receive the exact closing
- [ ] Provider reconnect restores conversation state in < 2s
- [ ] Interruption handling verified in tests for all 12 states
- [ ] No repeated phrasing for the same customer across consecutive calls
- [ ] Booking confirmation rate tracked and improving