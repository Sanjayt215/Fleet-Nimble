# FleetNimble AI Receptionist — Intelligence Layer Architecture

**Scope:** Add a self-improving Intelligence Layer on top of the (already implemented) Enterprise AI Receptionist.
**Hard constraint:** Zero modification to existing modules — Twilio Media Streams, Gemini Live, CRM, Dashboard, Business Tools, RAG, and the Conversation Engine all stay untouched. The Intelligence Layer is a **read-only observer + additive writer**.

---

# PART A — ARCHITECTURE

## A1. Design Principles

1. **Observer pattern** — the Intelligence Layer never intercepts the live call path. It subscribes to events already emitted by the Conversation Engine (transcripts, FSM transitions, tool executions, planning log, emotion states, latency samples).
2. **Async pipeline** — all analysis runs post-call on a worker queue. Live-call latency is untouched.
3. **Admin-only mutations** — nothing modifies prompts, knowledge articles, or workflows automatically. The Layer only **recommends**; admins approve.
4. **Event-sourced** — every analysis artifact traces back to immutable call event data.
5. **Enterprise scale** — time-series rollups, partition-friendly tables, bounded queues, idempotent workers.

## A2. System Diagram

```
                ┌─────────────────────────────────────────────┐
                │        CONVERSATION ENGINE (EXISTING)        │
                │  FSM transitions · transcripts · planning    │
                │  tool executions · emotion · latency          │
                └──────────────────────┬──────────────────────┘
                                       │ event stream (already emitted)
                                       ▼
                ┌─────────────────────────────────────────────┐
                │   EVENT COLLECTOR (NEW, thin, synchronous)   │
                │   intelligence/eventCollector.js             │
                │   → writes raw CallEventLog rows (fast)      │
                └──────────────────────┬──────────────────────┘
                                       ▼
                ┌─────────────────────────────────────────────┐
                │   INTELLIGENCE WORKER (NEW, async queue)     │
                │   intelligence/worker.js                     │
                │   per completed call:                        │
                │   1. Call Review Engine   ──→ CallReviewReport│
                │   2. Conversation Scoring ──→ ConversationScore│
                │   3. Knowledge Gap Detection ──→ KnowledgeGap │
                │   4. Safety Layer        ──→ SafetyIssue      │
                │   5. Learning Engine     ──→ Recommendations  │
                │   6. Prompt Optimizer    ──→ PromptVariants   │
                │   7. Executive Rollups   ──→ MetricSnapshots  │
                └──────────────────────┬──────────────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              ▼                        ▼                        ▼
   ┌──────────────────┐    ┌───────────────────┐    ┌──────────────────┐
   │  DB (additive)   │    │  EXECUTIVE API    │    │  SUPERVISOR API  │
   │  intelligence_*  │    │  trends/reports   │    │  replay/timeline │
   └──────────────────┘    └────────┬──────────┘    └────────┬─────────┘
                                    ▼                         ▼
                        ┌───────────────────────────────────────────┐
                        │        FRONTEND (additive pages)          │
                        │  Executive · Supervisor · Simulator ·     │
                        │  Recommendations · Safety                 │
                        └───────────────────────────────────────────┘
```

## A3. Call Event Log (the foundation)

Every notable call event is captured with millisecond precision in a single append-only table:

```javascript
// Written synchronously by eventCollector (fire-and-forget insert, never awaited on call path)
{
  eventType: 'FSM_TRANSITION' | 'PLAN' | 'CALLER_TURN' | 'AI_TURN' |
             'TOOL_START' | 'TOOL_SUCCESS' | 'TOOL_FAIL' | 'INTERRUPTION' |
             'EMOTION_CHANGE' | 'KNOWLEDGE_RETRIEVAL' | 'LATENCY_SAMPLE' |
             'RECONNECT' | 'CONFIRMATION' | 'BUSINESS_INTELLIGENCE',
  payload: { ...eventData },      // e.g. fromState/toState, tool, args, latencyMs
  at: ISO timestamp
}
```

Supervisor replay, review engines, latency analysis, and safety checks all read from this log. It is capped per call (rolling ring of last 2,000 events) and retained 90 days.

---

# PART B — 1. CALL REVIEW ENGINE

**File:** `backend/src/intelligence/callReview.service.js`

## B1. What It Analyzes (per completed call)

| Dimension | Data Source | Signals |
|-----------|------------|---------|
| Conversation quality | AI turns, transcript, scoring (§D) | repetition, length variance, filler overuse, abrupt transitions |
| Caller satisfaction | emotion trajectory, denials, re-asks, hangup timing | sentiment trend, frustration duration |
| Booking success | FSM states + appointment record | reached APPOINTMENT_CONFIRMATION, confirmed, tool success |
| Missed opportunities | planning log + business intelligence | buying signals detected but no demo offer; FAQ-answered then no bridge |
| Confusing responses | caller "huh/what/repeat" signals following AI turns | per-AI-turn confusion correlation |
| Interruptions | INTERRUPTION events | count, where (state), whether re-entry succeeded |
| Caller sentiment | EMOTION_CHANGE history | start/end sentiment, worst moment, recovery |
| Tool failures | TOOL_FAIL events + retries | which tool, why, retry outcome |
| Response latency | LATENCY_SAMPLE + provider timestamps | p50/p95, longest gap, correlation with confusion |

## B2. Output — `CallReviewReport`

```javascript
{
  callId, callSid, userId,
  scores: { quality, satisfaction, booking, clarity, empathy, latency } // 0-100 each
  issues: [
    { severity: 'HIGH|MEDIUM|LOW', category: 'confusion|repetition|missed_opportunity|tool_failure|latency',
      evidence: { turn: 12, snippet: "...", metric: "confusionX2" } }
  ],
  highlights: [ { category: 'success', evidence } ],
  missedOpportunities: [ { type: 'demo_offer', reason: 'buying_signal_detected', evidence } ],
  summary: 'AI-generated 2-3 sentence review',
}
```

## B3. Failure Safety

Review generation is best-effort: if the LLM reviewer fails, a rule-based fallback report is produced from the signal rules (no call is left unreviewed).

---

# PART C — 2. KNOWLEDGE GAP DETECTION

**File:** `backend/src/intelligence/knowledgeGap.service.js`

## C1. Detection Triggers

1. **Low-confidence RAG responses** — `retrieve_knowledge` returns empty or `score < threshold` (read from `retrievalEngine.service.js` outputs; no modification to it).
2. **Model self-reported uncertainty** — AI turn containing "I'm not sure", "I don't have that information", "let me check".
3. **Caller re-asks** — the same/similar question repeated ≥ 2 turns later (embedding-similarity match via existing `hybridSearch`).
4. **AI deflection** — pattern where AI pivots without answering ("I'd be happy to help — what else?").
5. **Escalation for knowledge reasons** — caller asks for human after a factual question.

## C2. Output — `KnowledgeGapRecord`

```javascript
{
  id, callId, userId,
  question: 'Does FleetNimble integrate with Samsara?',   // canonicalized
  clusterKey: sha256(normalized(question)),               // dedupe across calls
  occurrenceCount: 4, occurrences: [ {callId, at, context} ],
  source: 'LOW_CONFIDENCE_RAG' | 'AI_UNCERTAINTY' | 'CALLER_REASK' | 'DEFLECTION',
  severity,                          // rises with occurrenceCount
  suggestions: {
    newFaq: 'FleetNimble currently integrates with...',
    documentationTopic: 'Integration partners overview',
    ragArticles: ['integration-ecosystem.md'],
    trainingData: 'utterance variants: "does it work with X"',
  },
  status: 'OPEN' | 'SUGGESTED' | 'APPROVED' | 'DISMISSED',
}
```

## C3. Suggested Content Factory

For each gap, generate draft FAQ Q&A + draft RAG article skeleton via the assistant provider (`createAssistantProvider()` — reused, not modified). Drafts are stored with the record; admins approve → existing knowledge-sync workflow (`knowledge/sync/`) ingests them. **No auto-approval.**

---

# PART D — 3. CONVERSATION SCORING

**File:** `backend/src/intelligence/conversationScoring.service.js`

## D1. Score Dimensions (0–100 each)

| Score | Primary Inputs |
|-------|----------------|
| Greeting | greeting delivered verbatim? pause cadence, no repetition |
| Naturalness | filler usage, contractions, sentence-length variance, repetition count |
| Professionalism | policy words, hedging, politeness markers |
| Accuracy | RAG hit vs. caller acceptance, no corrections needed, safety flags absent |
| Booking ability | readback used, confirmation captured, booking completed |
| Support quality | issue captured, ticket created, follow-up offered |
| Empathy | emotion alignment, apology quality on frustration, de-escalation success |
| Sales quality | qualification questions asked, buying signals bridged, demo offered |
| **Overall** | weighted composite (configurable weights, stored with snapshot) |

## D2. Scoring Method

- **Hybrid:** rule-based sub-scores from event log (deterministic, fast) + LLM judgment on transcript segments (perplexity-free, sampled) + business outcome factors (appointment/ticket created).
- One `ConversationScore` row per call; immutable; re-scoring only for benchmark re-runs (simulator).

---

# PART E — 4. LEARNING ENGINE

**File:** `backend/src/intelligence/learningEngine.service.js`

## E1. Failure Pattern Detection

Runs nightly over `KnowledgeGapRecord`, `CallReviewReport.issues`, `ConversationScore`, and `SafetyIssue`:

| Pattern | Threshold Example | Recommendation Type |
|---------|-------------------|---------------------|
| Topic fails repeatedly | ≥ 3 gaps same `clusterKey` in 7 days | prompt improvement (reworded instruction), knowledge article, training data |
| Booking flow leaks | ≥ 5 calls reached APPT_COLLECT but no confirmation | workflow improvement (reorder prompts, add readback) |
| Confusion hotspot | ≥ 3 HIGH confusion issues on same state | prompt improvement for that state instruction |
| Tool fails repeatedly | ≥ 3 TOOL_FAIL same tool+error | tool improvement (args validation, retry strategy) |
| Emotion drop at same point | ≥ 3 calls sentiment drops within same state | workflow improvement |
| Greeting variance | score < threshold on greeting | prompt improvement (greeting) |

## E2. Output — `LearningRecommendation`

```javascript
{
  id, type: 'PROMPT' | 'KNOWLEDGE' | 'WORKFLOW' | 'TOOL',
  category, severity,
  title: 'Appointment date parsing fails for "day after tomorrow"',
  description,
  proposedChange: {          // NEVER applied automatically
    promptSection: 'APPOINTMENT_COLLECTION',
    current: '...',
    suggested: '...',
    diffPreview: '+/- lines',
  },
  evidence: [ { callId, turn, snippet } ],
  supportingScores: { occurrences: 5, impactEstimate: 'medium' },
  status: 'RECOMMENDED' | 'APPROVED' | 'DEPLOYED' | 'REJECTED',
  version: 3,
}
```

---

# PART F — 5. EXECUTIVE DASHBOARD

**File:** `backend/src/intelligence/executiveAnalytics.service.js`

## F1. Precomputed Rollups (enterprise scale)

Hourly + daily snapshots stored in `ExecutiveMetricSnapshot` — dashboards read snapshots, never raw tables:

```javascript
{
  window: { start, end, type: 'HOURLY'|'DAILY' },
  userId?,                                            // per-tenant or global
  topUnansweredQuestions: [ { question, clusterKey, count } ],      // top 20
  topPainPoints: [ { painPoint, count } ],                          // from BI extraction
  bookingConversion: { reachedReadback, confirmed, created, rate },
  supportResolution: { ticketsCreated, escalated, resolvedRate },
  averageCallDurationSec,
  emotionTrends: { perEmotionCounts, frustrationResolutionAvgSec },
  leadQualityTrends: { avgLeadScore, qualifiedCount, stageDistribution },
  conversationQualityTrend: { avgOverall, avgPerDimension },
  aiConfidenceTrend: { avgConfidence, lowConfidenceCount, avgLatencyMs },
  safety: { openIssues, criticalCount },
}
```

## F2. Trend Endpoints (windowed, cached 5 min)

`GET /api/receptionist/intelligence/trends?metric=bookingConversion&window=30d`

---

# PART G — 6. SUPERVISOR MODE

**File:** `backend/src/intelligence/supervisor.service.js`

## G1. Replay

- Full transcript from `AiReceptionistCall.transcript` (existing field) + `CallEventLog`.
- Per-turn: caller turn → AI plan → FSM state → AI response, rendered as a conversation timeline.

## G2. Views (per call)

| View | Source | Renders |
|------|--------|---------|
| AI reasoning plan | `planningLog` (existing enterprise field) | currentGoal/nextGoal/missingInfo/bestQuestion per turn |
| FSM transitions | CallEventLog FSM_TRANSITION | state path graph + timestamps |
| Tool execution timeline | TOOL_* events | tool, args (masked), result, duration, retries |
| Memory updates | memory persist events | what changed per update |
| BI extraction | BUSINESS_INTELLIGENCE events | extracted signals per turn |
| Latency timeline | LATENCY_SAMPLE events | chart p50/p95, gaps, provider reconnects |
| Emotion overlay | EMOTION_CHANGE events | sentiment strip over transcript |

## G3. Access Control

`SUPERVISOR` role only (new role enum value on existing auth model — additive); full audit via existing `AiReceptionistAuditLog` (`eventType: 'supervisor_view'`).

---

# PART H — 7. CONVERSATION SIMULATOR

**File:** `backend/src/intelligence/conversationSimulator.service.js`

## H1. Capabilities

- Simulate full calls against the **real conversation engine** (same FSM, same providers via test-only config) using scripted caller personas.
- Injections per scenario: interruptions (barge-in at chosen state), provider reconnects, tool failures (fault injection hook — gated by `NODE_ENV !== 'production'`), noisy audio (corrupt frames at audio pipeline test seam), booking flows (full happy path, change-at-readback, denial).

## H2. Scenario Model

```javascript
{
  name: 'busy-buyer-interrupts-readback',
  persona: { name, company, fleetSize, emotions: ['BUSY','EXCITED'] },
  turns: [ { speak: '...', inject: 'INTERRUPTION' | 'RECONNECT' | 'TOOL_FAIL' | 'NOISE', atState } ],
  expectedOutcome: { finalState: 'GOODBYE', appointmentCreated: true },
}
```

## H3. Output — `SimulationRunReport`

- Assertions: reached expected state, booking confirmed only after confirmation, no duplicate tool calls, interruption recovered, reconnect resumed.
- Generated automatically after every run (rule-based pass/fail + LLM narrative).
- Regression suite: run corpus nightly; any behavior drift → `LearningRecommendation` (type WORKFLOW).

---

# PART I — 8. PROMPT OPTIMIZER

**File:** `backend/src/intelligence/promptOptimizer.service.js`

## I1. Analysis

Nightly batch over `ConversationScore` + `CallReviewReport` + clustered gaps:

1. Cluster underperforming turns by state + intent.
2. For each cluster, generate candidate improvements for: greeting, follow-up questions, booking prompts, objection handling, closing statements.
3. Score candidates by estimated impact (failure-rate delta in cluster).

## I2. Output — `PromptVariant` (versioned, never auto-deployed)

```javascript
{
  id, version, promptTarget: 'GREETING'|'FOLLOW_UP'|'BOOKING'|'OBJECTION'|'CLOSING',
  basePrompt: '<hash of current production prompt>',
  candidatePrompt: '...', rationale: '...', expectedImpact: '...',
  evidenceCluster: { intent, state, sampleSize, failureRate },
  status: 'CANDIDATE' | 'AWAITING_APPROVAL' | 'A_B_TEST' | 'DEPLOYED' | 'REJECTED',
}
```

## I3. A/B Test Support

Approved variants deploy only via the existing feature-flag mechanism (`AI_RECEPTIONIST_ENTERPRISE_ENABLED`-style env flag + admin endpoint toggling `conversationEngine.promptVariantId` for a % of calls). Results feed back as new variants. Production prompts are never overwritten in place.

---

# PART J — 9. SAFETY LAYER

**File:** `backend/src/intelligence/safetyLayer.service.js`

## J1. Detectors (run post-call on CallEventLog + outputs)

| Detector | Signal |
|----------|--------|
| Hallucination | AI asserted fact with no RAG hit + caller accepted (no correction); cross-check against knowledge corpus embeddings (`hybridSearch` similarity < threshold) |
| Policy violation | AI promised discounts/refunds/features not in knowledge base; phrase rules + LLM judge |
| Incorrect FleetNimble info | Claim contradicts approved knowledge corpus (semantic diff) |
| Incorrect pricing | Pricing mention with no matching RAG price article |
| Incorrect appointment confirmation | Confirmation spoken with data ≠ `AiReceptionistAppointment` record |
| Duplicate CRM update | Same customer updated 2× with identical payload within N seconds |
| Duplicate booking | Same callSid/caller+slot producing 2 appointments (idempotency audit) |

## J2. Output — `SafetyIssue`

```javascript
{
  id, severity: 'CRITICAL|HIGH|MEDIUM|LOW', detector,
  callId, turn?, snippet, expected: '...', actual: '...',
  verificationStatus: 'OPEN' | 'CONFIRMED' | 'FALSE_POSITIVE',
  notifiedAt,                       // realtime notification to admin for CRITICAL
}
```

CRITICAL issues trigger immediate admin notification via existing `receptionistNotification.service.js` (additive call, no modification).

---

# PART K — DATABASE MODELS (additive, `backend/prisma/schema.prisma`)

```prisma
model CallEventLog {
  id        String   @id @default(uuid())
  callId    String   @map("call_id")
  callSid   String?
  userId    String   @map("user_id")
  eventType String   @map("event_type")
  payload   Json     @default("{}")
  at        DateTime @default(now())
  @@index([callId, at])
  @@index([userId, eventType, at])
  @@index([at])                       // retention pruning (90d)
  @@map("call_event_logs")
}

model CallReviewReport {
  id        String   @id @default(uuid())
  callId    String   @unique @map("call_id")
  userId    String   @map("user_id")
  scores    Json     @default("{}")    // quality, satisfaction, booking, clarity, empathy, latency
  issues    Json     @default("[]")
  highlights Json    @default("[]")
  missedOpportunities Json @default("[]")
  summary   String?
  createdAt DateTime @default(now()) @map("created_at")
  @@index([userId, createdAt(sort: Desc)])
  @@map("call_review_reports")
}

model ConversationScore {
  id        String   @id @default(uuid())
  callId    String   @unique @map("call_id")
  userId    String   @map("user_id")
  greeting  Int      @default(0)
  naturalness Int    @default(0)
  professionalism Int @default(0)
  accuracy  Int      @default(0)
  bookingAbility Int  @default(0) @map("booking_ability")
  supportQuality Int  @default(0) @map("support_quality")
  empathy   Int      @default(0)
  salesQuality Int   @default(0) @map("sales_quality")
  overall   Int      @default(0)
  weights   Json     @default("{}")
  createdAt DateTime @default(now()) @map("created_at")
  @@index([userId, createdAt(sort: Desc)])
  @@map("conversation_scores")
}

model KnowledgeGapRecord {
  id              String   @id @default(uuid())
  clusterKey      String   @map("cluster_key")
  question        String
  source          String                       // LOW_CONFIDENCE_RAG | AI_UNCERTAINTY | CALLER_REASK | DEFLECTION
  occurrenceCount Int      @default(1) @map("occurrence_count")
  occurrences     Json     @default("[]")
  severity        String   @default("LOW")
  suggestions     Json     @default("{}")      // newFaq, documentationTopic, ragArticles, trainingData
  status          String   @default("OPEN")    // OPEN | SUGGESTED | APPROVED | DISMISSED
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  @@unique([clusterKey])
  @@index([status, severity])
  @@index([createdAt])
  @@map("knowledge_gap_records")
}

model LearningRecommendation {
  id              String   @id @default(uuid())
  type            String                       // PROMPT | KNOWLEDGE | WORKFLOW | TOOL
  category        String
  severity        String   @default("MEDIUM")
  title           String
  description     String?
  proposedChange  Json     @default("{}")
  evidence        Json     @default("[]")
  supportingScores Json   @default("{}")
  status          String   @default("RECOMMENDED") // RECOMMENDED | APPROVED | DEPLOYED | REJECTED
  version         Int      @default(1)
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  @@index([type, status])
  @@index([createdAt])
  @@map("learning_recommendations")
}

model PromptVariant {
  id             String   @id @default(uuid())
  version        Int      @default(1)
  promptTarget   String                       // GREETING | FOLLOW_UP | BOOKING | OBJECTION | CLOSING
  basePrompt     String?  @map("base_prompt")
  candidatePrompt String @map("candidate_prompt")
  rationale      String?
  expectedImpact String?  @map("expected_impact")
  evidenceCluster Json   @default("{}")
  status         String   @default("CANDIDATE") // CANDIDATE | AWAITING_APPROVAL | A_B_TEST | DEPLOYED | REJECTED
  createdAt      DateTime @default(now()) @map("created_at")
  @@index([promptTarget, status])
  @@index([createdAt])
  @@map("prompt_variants")
}

model SafetyIssue {
  id                String   @id @default(uuid())
  detector          String
  severity          String   @default("MEDIUM")  // CRITICAL | HIGH | MEDIUM | LOW
  callId            String?  @map("call_id")
  turn              Int?
  snippet           String?
  expected          String?
  actual            String?
  verificationStatus String  @default("OPEN") @map("verification_status")
  notifiedAt        DateTime? @map("notified_at")
  createdAt         DateTime @default(now()) @map("created_at")
  @@index([severity, verificationStatus])
  @@index([createdAt])
  @@map("safety_issues")
}

model SimulationRun {
  id          String   @id @default(uuid())
  scenarioName String  @map("scenario_name")
  config      Json     @default("{}")
  outcome     Json     @default("{}")      // assertions pass/fail, events, artifacts
  passed      Boolean  @default(false)
  report      String?                       // LLM narrative
  durationMs  Int?      @map("duration_ms")
  createdAt   DateTime @default(now()) @map("created_at")
  @@index([scenarioName, createdAt(sort: Desc)])
  @@map("simulation_runs")
}

model ExecutiveMetricSnapshot {
  id       String   @id @default(uuid())
  windowStart DateTime @map("window_start")
  windowEnd   DateTime @map("window_end")
  windowType String   @map("window_type")     // HOURLY | DAILY
  userId    String?  @map("user_id")
  payload   Json     @default("{}")            // full §F1 snapshot
  createdAt DateTime @default(now()) @map("created_at")
  @@index([windowType, windowStart(sort: Desc)])
  @@index([userId, windowType, windowStart(sort: Desc)])
  @@unique([userId, windowType, windowStart])
  @@map("executive_metric_snapshots")
}
```

Migration: `npx prisma migrate dev --name intelligence_layer` — additive tables only; existing tables untouched.

---

# PART L — API ENDPOINTS

New route file **`backend/src/routes/receptionistIntelligence.routes.js`** (mounted in `backend/src/app.js` next to existing routes; same `authenticate` + `rateLimit` patterns):

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/receptionist/intelligence/trends` | Executive rollups (windowed) |
| GET | `/api/receptionist/intelligence/scores?from&to` | Conversation scores list |
| GET | `/api/receptionist/intelligence/scores/:callId` | Single call score detail |
| GET | `/api/receptionist/intelligence/gaps` | Knowledge gap queue (filter: status/source/severity) |
| POST | `/api/receptionist/intelligence/gaps/:id/status` | Approve/dismiss gap (+ trigger suggested-content approval) |
| GET | `/api/receptionist/intelligence/recommendations` | Learning recommendations |
| POST | `/api/receptionist/intelligence/recommendations/:id/status` | Approve/reject/deploy recommendation |
| GET | `/api/receptionist/intelligence/prompt-variants?target=` | Optimizer variants |
| POST | `/api/receptionist/intelligence/prompt-variants/:id/status` | Candidate → A/B → deploy to flag (never in-place) |
| GET | `/api/receptionist/intelligence/safety?severity=&status=` | Safety issues |
| POST | `/api/receptionist/intelligence/safety/:id/verify` | Confirm / false-positive |
| GET | `/api/receptionist/supervisor/calls` | Call list (SUPERVISOR role) |
| GET | `/api/receptionist/supervisor/calls/:callId/replay` | Full replay payload (transcript + events + plans) |
| GET | `/api/receptionist/supervisor/calls/:callId/timeline?view=` | Specific timeline (fsm, tools, memory, bi, latency, emotion) |
| POST | `/api/receptionist/simulator/run` | Run one scenario (dev/staging only — `NODE_ENV` guard) |
| GET | `/api/receptionist/simulator/runs` | Simulation history + reports |
| POST | `/api/receptionist/simulator/runs/:id/regression` | Re-run corpus, produce drift report |

Role guards: executive endpoints → `admin`; supervisor/simulator → `supervisor` + `admin` (additive enum value on existing role model).

---

# PART M — METRICS

## M1. Realtime counters (in-memory, mirror `receptionistMetrics.service.js` pattern — new file, existing untouched)

`backend/src/intelligence/metrics.js`:
- `reviewsCompleted`, `scoresWritten`, `gapsDetected`, `recommendationsGenerated`, `safetyIssues`, `simulationRuns`, `workerLag`, `workerErrors`, `rollupsWritten`.

## M2. Stored trends (from ExecutiveMetricSnapshot)

All §F1 dimensions + worker health (queue depth, processing time, failure rate). Exposed via `/trends` for the dashboard.

## M3. Correlation Dashboards

- score dimensions × FSM state (weakest states surfaced)
- gap severity × intent (which intents lack knowledge)
- emotion × latency (does slowness cause frustration?)
- recommendation → status funnel (how many approved/deployed)

---

# PART N — TESTING STRATEGY

## N1. Unit Tests (`backend/tests/intelligence/`)

| File | Covers |
|------|--------|
| `eventCollector.test.js` | Event capture completeness, no call-path latency impact, JSON safety |
| `callReview.test.js` | Rule-based fallback, issue evidence pointers, missed-opportunity detection |
| `knowledgeGap.test.js` | All 4 triggers, clusterKey dedupe, severity escalation, suggestion factory |
| `scoring.test.js` | 9 dimensions, weight configuration, immutability |
| `learningEngine.test.js` | Pattern thresholds, recommendation generation, no-auto-apply guarantee |
| `promptOptimizer.test.js` | Variant versioning, A/B payloads, never-write-production assertion |
| `safetyLayer.test.js` | All 7 detectors, false-positive handling, CRITICAL notification |
| `simulator.test.js` | Scenario engine, injections, assertions, regression drift |

## N2. Integration Tests

- Simulated call → CallEventLog rows → worker → report/score/gap/safety rows → API returns them.
- Supervisor replay payload completeness for a real archived call.
- Idempotent worker: processing same call twice creates no duplicates.
- Rollup correctness: known fixture calls → expected hourly/daily snapshot values.

## N3. Regression

All existing suites (`ai-receptionist-*`, `receptionist-*`, `realtime-pipeline`, knowledge/rag tests) must pass with the collector attached — proving zero behavior change to the live path.

## N4. Chaos

Simulator fault-injection tests: tool failure + reconnect + interruption in one call → engine still completes; worker skips corrupted events without crashing.

---

# PART O — ROLLOUT STRATEGY

| Stage | Duration | Actions | Guard |
|-------|----------|---------|-------|
| 0. Build | — | Services, models, APIs, pages behind `AI_RECEPTIONIST_INTELLIGENCE_ENABLED` (default false) | No behavior change |
| 1. Capture | 1 week | EventCollector + CallEventLog only, on production calls | Zero analysis running; validate event fidelity |
| 2. Backfill + Analyze | 1 week | Worker processes historical + new calls in shadow; reports/scoring written but admin pages hidden | Compare review accuracy vs. manual review of 20 calls |
| 3. Executive preview | 2 weeks | Dashboard + trends visible to admins; gap/recommendation queues open for review | Human approval gates on everything |
| 4. Supervisor + Safety live | 1 week | Supervisor mode + safety alerts; CRITICAL notifications on | Read-only; no production mutation |
| 5. Optimizer A/B | ongoing | First approved PromptVariant A/B via flag at 5% traffic | Rollback = disable variant flag |

**Rollback:** any stage disables instantly via flag; event capture stops; all tables remain but are ignored. No migration rollback needed (additive).

---

# PART P — MIGRATION PLAN

1. `prisma migrate dev --name intelligence_layer` (additive).
2. Seed backfill worker: for existing `AiReceptionistCall` rows (last 90 days), replay transcript + extractedData + planningLog through review/scoring/gap/safety in batches of 500 (idempotent upserts).
3. Backfill `ExecutiveMetricSnapshot` daily for last 30 days from scored calls.
4. Prompt/safety thresholds configurable via existing config service (env vars with defaults — no schema change).
5. Post-migration verification: row counts, worker error rate, snapshot continuity, existing dashboards unchanged.

---

# PART Q — ENTERPRISE SCALABILITY

- **Worker pool:** queue backed by existing Redis; N workers with per-call idempotency keys; dead-letter queue for poisoned events.
- **Partition-friendly:** all intelligence tables indexed by `at`/`createdAt`; retention jobs prune CallEventLog (90d), SimulationRun (30d), snapshots (13 months hourly, 2 years daily).
- **Per-tenant isolation:** every model carries `userId`; rollups written per tenant with global fallback.
- **Read path:** dashboards hit snapshots + cached endpoints (5 min), never raw event tables.
- **LLM usage control:** review/scoring/optimizer prompts batched per call, token budgets enforced, fallbacks guaranteed (rule-based) so the layer degrades gracefully without outages.

---

# SUMMARY — DELIVERED

| Requirement | Delivered |
|-------------|-----------|
| 1. Call Review Engine | `callReview.service.js` + `CallReviewReport` (§B) |
| 2. Knowledge Gap Detection | `knowledgeGap.service.js` + `KnowledgeGapRecord` (§C) |
| 3. Conversation Scoring | `conversationScoring.service.js` + `ConversationScore` (§D) |
| 4. Learning Engine | `learningEngine.service.js` + `LearningRecommendation` — recommendations only, never auto-mutates (§E) |
| 5. Executive Dashboard | `executiveAnalytics.service.js` + `ExecutiveMetricSnapshot` + 10 trend dimensions (§F) |
| 6. Supervisor Mode | `supervisor.service.js` + replay/plan/FSM/tool/memory/BI/latency views (§G) |
| 7. Conversation Simulator | `conversationSimulator.service.js` + injections + auto reports (§H) |
| 8. Prompt Optimizer | `promptOptimizer.service.js` + versioned `PromptVariant` + A/B via flags (§I) |
| 9. Safety Layer | `safetyLayer.service.js` + 7 detectors + `SafetyIssue` + CRITICAL alerts (§J) |
| 10. Architecture/Services/DB/API/Dashboard/Metrics/Testing/Rollout/Migration | Parts A, K, L, M, N, O, P |

New services: `backend/src/intelligence/` (12 files). New DB models: 9 (all additive). New endpoints: 17 (all guarded). Zero changes to existing production modules.