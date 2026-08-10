# FleetNimble AI Receptionist — Self-Improving AI Employee Layer

**Scope:** Build the continuous-learning layer on top of the existing Enterprise Receptionist, Multi-Agent Architecture, and Intelligence Layer.
**Constraint:** Zero modification to existing production modules. The AI gets smarter every day through a closed learning loop: **observe → analyze → benchmark → coach → recommend → (admin approves) → deploy → measure**.

---

# PART A — PRODUCTION ARCHITECTURE

## A1. The Learning Loop

```
 COMPLETED CALLS (existing events: CallEventLog, AgentTaskLog, planningLog, scores)
      │
      ▼
 ┌──────────────────────────┐
 │  P1 PER-CALL LEARNING    │  minutes after call end
 │  • Enterprise Scoring    │  (Part 9)
 │  • Conversation Learning │  (Part 1)
 │  • Sales Intelligence    │  (Part 4)
 │  • Memory Intelligence   │  (Part 3)
 │  • Enterprise Safety     │  (Part 12 — P0 for CRITICAL)
 └───────────┬──────────────┘
             ▼
 ┌──────────────────────────┐
 │  P2 NIGHTLY DISCOVERY    │  02:00 UTC batch
 │  • Best Conversation     │  (Part 2)
 │  • Benchmarking          │  (Part 5)
 │  • AI Coaching           │  (Part 6)
 │  • Knowledge Improvement │  (Part 7)
 │  • Optimization Recs     │  (Part 10)
 └───────────┬──────────────┘
             ▼
 ┌──────────────────────────┐
 │  P3 MONTHLY EXECUTIVE    │  ROI, revenue pipeline, cost per conversation
 │  (Part 8)                │
 └───────────┬──────────────┘
             ▼
 ┌──────────────────────────┐
 │  ADMIN APPROVAL WORKFLOW │  Recommendations → approve/reject →
 │  (never auto-deploy)     │  versioned flags → A/B → measure (§K)
 └──────────────────────────┘
```

## A2. System Diagram

```
        EXISTING SYSTEMS (untouched)
  Conversation Engine · Multi-Agent · Intelligence Layer · CRM · RAG · Dashboard
                   │  emit events (already in place)
                   ▼
 ┌──────────────────────────────────────────────────────────────┐
 │              LEARNING PLATFORM (NEW — backend/src/learning/)   │
 │                                                              │
 │  Queue Producer (queue.js) → Redis priorities P0/P1/P2/P3    │
 │       │                                                      │
 │  Worker Pools (worker.js, N instances, idempotent)           │
 │       │                                                      │
 │  ┌────┴─────────────────────────────────────────────────┐    │
 │  │  P1 Pipeline           P2 Pipeline            P3     │    │
 │  │  enterpriseScoring     bestConversation       exec   │    │
 │  │  conversationLearning  benchmarking           Intel  │    │
 │  │  salesIntelligence     coachingEngine         (ROI)  │    │
 │  │  memoryIntelligence    knowledgeImprovement         │    │
 │  │  enterpriseSafety      optimizationRecs              │    │
 │  └─────────────────────────────────────────────────────┘    │
 └───────────┬──────────────────────────────────────┬──────────┘
             ▼                                      ▼
  ┌─────────────────────┐              ┌──────────────────────────┐
  │  ADDITIVE DB TABLES │              │  ADMIN/API/FRONTEND       │
  │  enterprise_scores, │              │  learning APIs, pages,    │
  │  behavioral_profiles│              │  coaching, simulation     │
  │  best_patterns, ... │              └──────────────────────────┘
  └─────────────────────┘
```

## A3. Observability of the Loop Itself

The learning platform logs its own health (queues, workers, job failures, drift) into `LearningPipelineRun` so the system learns about its own learning — and every deployed recommendation has a measurable before/after via benchmarking.

---

# PART B — PART 1: CONVERSATION LEARNING ENGINE

**File:** `backend/src/learning/conversationLearning.service.js`

## B1. Per-Call Analysis (extends Intelligence Layer Call Review — reads its outputs, adds learning-specific signals)

| Signal | Source |
|--------|--------|
| Greeting quality | scoring.greeting + verbatim checks |
| Conversation quality | scoring.naturalness/professionalism + repetition counters |
| Sales quality | scoring.salesQuality + buying-signal bridge success |
| Support quality | scoring.supportQuality + ticket outcome |
| Naturalness | filler overuse, sentence-length variance, contraction rate |
| Interruptions | CallEventLog INTERRUPTION count + re-entry success |
| Latency | p50/p95 response latency + longest gap |
| Customer satisfaction | emotion trajectory + denials + hangup timing |
| Lead quality | lead score delta + qualification completeness |
| Booking success | readback → confirmation → tool success chain |
| Confidence | AI confidence trend + low-confidence RAG hits |

## B2. Output — `LearningRecord`

```javascript
{
  callId, userId, scores: {...}, grade: 'A'...'F',
  improvements: [{
    category: 'GREETING'|'FLOW'|'BOOKING'|'SUPPORT'|'OBJECTION'|'CLOSING'|'LATENCY',
    severity: 'HIGH'|'MEDIUM'|'LOW',
    description: 'Greeting dropped the personalized touch for a returning caller',
    evidence: { turn: 1, snippet: '...' },
    suggestedChange: 'When CRM identifies returning customer, always reference last topic',
    promptSection: 'GREETING_HANDLER',
  }],
}
```

Improvements are **recommendations only** — they feed Part 10's approval workflow.

---

# PART C — PART 2: BEST CONVERSATION DISCOVERY

**File:** `backend/src/learning/bestConversationDiscovery.service.js`

## C1. Discovery Method (nightly, P2)

1. Score all calls from the last 7 days (reuse Enterprise Scoring §I).
2. Cluster conversations by pattern type: greeting style, objection response, demo-booking style, closing statement, support conversation.
3. Extract the **top decile** conversations per cluster (by overall + dimension-specific scores).
4. For each, extract the winning behaviors (phrases, structure, timing) via LLM analysis — sampled, never all calls.
5. Rank patterns; store as `BestConversationPattern`.

## C2. Output — `BestConversationPattern`

```javascript
{
  id, type: 'GREETING'|'OBJECTION'|'DEMO_BOOKING'|'CLOSING'|'SUPPORT',
  rank: 1,
  percentile: 99.2,                        // where winners sit in distribution
  pattern: 'Objection "too expensive": acknowledge → anchor value (ROI) → offer pricing tier option',
  winningPhrases: [ 'I completely understand budget concerns — here is how it pays for itself...' ],
  evidence: { sampleSize: 214, bestCallId, scores: { overall: 97, sales: 95 } },
  status: 'DISCOVERED' | 'RECOMMENDED' | 'ADOPTED',   // adopted only after admin approval
}
```

---

# PART D — PART 3: CONVERSATION MEMORY INTELLIGENCE

**File:** `backend/src/learning/memoryIntelligence.service.js`

## D1. Behavioral Profile (per customer — extends CRM memory, never overwrites it)

```javascript
{
  customerId, userId,
  communication: {
    style: 'DIRECT'|'FORMAL'|'CASUAL'|'DETAILED'|'BRIEF',     // inferred from utterance patterns
    preferredSpeed: 'SLOW'|'NORMAL'|'FAST',                    // from inter-turn pauses
    preferredTone: 'WARM'|'PROFESSIONAL'|'LIGHT'|'SERIOUS',
    technicalLevel: 'NOVICE'|'INTERMEDIATE'|'EXPERT',          // from vocabulary + question depth
  },
  profile: {
    isDecisionMaker: boolean|null,           // from BI decisionMaker signals
    budgetSensitivity: 'LOW'|'MEDIUM'|'HIGH',
    followUpPreference: 'EMAIL'|'SMS'|'PHONE'|'NONE',
    preferredMeetingTime: 'MORNING'|'AFTERNOON'|'EVENING'|null,
    preferredLanguage: 'en',
    preferredTimezone: 'UTC',
    preferredChannel: 'PHONE'|'EMAIL'|'CHAT',
  },
  confidence: { communication: 0.8, profile: 0.7 },   // low-confidence fields are not injected
  updatedAt,
}
```

## D2. How It Is Used (future calls)

Injected into the Receptionist's provider context **and** into the Supervisor's routing decisions:
- `preferredSpeed=FAST` → AdaptiveResponseEngine BUSY profile (existing engine, invoked with new input — no modification)
- `technicalLevel=EXPERT` → skip basic explanations, jump to detail
- `isDecisionMaker=true` → Sales Agent prioritizes booking path
- `budgetSensitivity=HIGH` → Sales Agent leads with ROI framing
- `followUpPreference=SMS` → Scheduling Agent confirms via SMS first

Profile updates are confidence-weighted; one call never flips a long-standing profile.

---

# PART E — PART 4: SALES INTELLIGENCE

**File:** `backend/src/learning/salesIntelligence.service.js`

## E1. Computed Metrics (per call with sales activity; stored in `SalesIntelligenceSnapshot`)

| Metric | Derivation |
|--------|-----------|
| Buying intent (0-100) | weighted: buying signals + engagement + explicit statements |
| Purchase probability (%) | logistic model over intent, lead score, urgency, decision stage, history |
| Lead score | existing CRM lead score (read) + delta this call |
| Decision stage | AWARENESS → EVALUATION → DECISION → PURCHASE (from BI + actions) |
| Urgency | existing urgency detection (HIGH/MEDIUM/LOW) + timeline statements |
| Competitor mentions | entity detection on competitor names → counted, categorized |
| Objection categories | classified: price, timeline, switching cost, features, trust, integration |
| Estimated deal value ($) | fleet size × vehicles × pricing tier × module take rate (config-driven table) |
| Expected closing probability (%) | purchase probability × historic close rate by stage (from CRM pipeline data) |

## E2. Feedback Into Pipeline

- Deal value + probability feed the Executive revenue pipeline (§H).
- Objection categories feed Part 2's objection-pattern discovery and Part 6's coaching.
- Never writes to the CRM directly without admin-approved automation (flag `SALES_AUTO_UPDATE_CRM` default false).

---

# PART F — PART 5: CONVERSATION BENCHMARKING

**File:** `backend/src/learning/benchmarking.service.js`

## F1. Percentile Comparison

Pre-computed distribution per dimension (from `EnterpriseScore` history, refreshed nightly):

```
Percentile bands: TOP_1% | TOP_5% | TOP_10% | AVERAGE | WORST_DECILE
```

Every new call gets:

```javascript
{
  callId, dimension: 'overall',
  percentile: 87,                       // this call ranks at 87th percentile
  band: 'TOP_10%',
  reference: { top1: 98, top5: 95, top10: 91, avg: 72, worst: 41 },
  deltaVsTop1: -11,
  improvementSuggestions: [
    { focus: 'Empathy dip in support segment',
      suggestion: 'Reference open ticket before proposing fix', impactEstimate: 'medium' },
  ],
}
```

## F2. Segment Benchmarks

Benchmarks are computed **per segment** (industry, fleet size band, intent, state) so a small-fleet support call isn't unfairly compared to an enterprise sales call.

---

# PART G — PART 6: AI COACHING ENGINE

**File:** `backend/src/learning/coachingEngine.service.js`

## G1. Coaching Report (per call, P2 batch)

```javascript
{
  callId, verdict: 'SUCCESS' | 'PARTIAL' | 'FAILED',
  whyItWorked: 'Caller was an expert; agent skipped basics and went straight to ROI — perfect alignment',
  whyItFailed: 'Objection (price) came at turn 8 but agent did not respond to it; pivoted to features instead',
  howToImprove: 'Detect objection category and map to anchored ROI response',
  whatShouldChange: 'OBJECTION_HANDLING prompt section: add price-anchoring instruction',
  whichPromptSectionCausedIt: 'SALES_HANDLER → pricing turn path',
  evidence: { turns: [8,9,10], snippets: [...] },
  suggestedPattern: '<link to BestConversationPattern if exists>',
}
```

## G2. Coach Knowledge Base

Coaching reports accumulate into a searchable corpus (the coach learns from its own coaching) — used by the Simulator to generate targeted "before vs. optimized" comparisons (§K).

---

# PART H — PART 7: KNOWLEDGE IMPROVEMENT

**File:** `backend/src/learning/knowledgeImprovement.service.js`

## H1. Discovery (nightly)

| Gap Type | Detection |
|----------|-----------|
| Missing FAQ | unanswered/low-confidence questions (Intelligence Layer KnowledgeGap) |
| Missing documentation | FAQ clusters with no linked RAG article |
| Frequently asked | KnowledgeGap occurrenceCount ranking |
| Confusing answers | caller confusion signals within 2 turns of an AI knowledge answer |
| Hallucination risks | safety issues (detector: hallucination) + low-similarity assertions |
| Outdated information | article age + increasing low-confidence hits on its topics |

## H2. Output — `KnowledgeDraft` (admin approval required)

```javascript
{
  id, type: 'FAQ'|'DOCUMENTATION'|'RAG_ARTICLE'|'CORRECTION',
  clusterKey, question, draftTitle, draftBody,      // generated by assistant provider
  sources: [callIds...], evidenceScore,
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'REJECTED',
}
```

Approval → existing knowledge-sync workflow ingests it. **No auto-publish.**

---

# PART I — PART 8: EXECUTIVE INTELLIGENCE

**File:** `backend/src/learning/executiveIntelligence.service.js`

## I1. Executive Rollups (extends Intelligence Layer snapshots — new model, additive)

| Dashboard | Metrics |
|-----------|---------|
| Call quality trends | overall score trend, dimension trends, percentile movement |
| Lead conversion | leads → qualified → demos → booked → closed |
| Sales conversion | deals by stage, win rate by segment |
| Revenue pipeline | estimated deal value pipeline (sum by stage), expected revenue |
| Customer satisfaction | sentiment trend, frustration resolution time, CSAT proxy |
| Support resolution | tickets created → resolved → escalations |
| Knowledge health | gap rate, hallucination risk, article freshness, knowledge hit rate |
| Prompt performance | per-prompt-section failure rate trend (from coaching evidence) |
| Agent performance | per-agent success/latency/cost (Multi-Agent `AgentTaskLog`) |
| Cost per conversation | LLM tokens + infra per call (by segment) |
| ROI | (revenue captured − cost) per period; automated ROI attribution |

## I2. ROI Attribution

Expected deal value (§E) × stage-weighted close probability is attributed to the call that originated the lead. Monthly P3 job recomputes cumulative ROI with a 90-day lookback.

---

# PART J — PART 9: ENTERPRISE AI SCORING

**File:** `backend/src/learning/enterpriseScoring.service.js`

## J1. The Scorecard (every completed call)

```
Overall AI Score        weighted composite (below)
Sales Score             sales success metrics (§E + scoring.salesQuality)
Support Score           support quality + resolution
Naturalness Score       repetition/filler/rhythm analysis
Empathy Score           emotion alignment + de-escalation success
Accuracy Score          fact-check vs RAG corpus + correction events
Professionalism Score   policy compliance + politeness + hedging
Business Impact Score   booking/ticket/lead/dollar outcome weight
Confidence Score        AI confidence trend + low-confidence frequency
Overall Grade           A+ | A | B | C | D | F  (thresholds configurable)
```

Stored in `EnterpriseScore` (one row per call, immutable). All Part 1/2/5/6/9/10 analyses consume it.

---

# PART K — PART 10 & 11: OPTIMIZATION RECOMMENDATIONS + SIMULATION

## K1. Optimization Recommendations

**File:** `backend/src/learning/optimizationRecommendations.service.js`

Unified recommendation pipeline merging sources:
- Conversation Learning Engine improvements (§B)
- Benchmarking deltas (§F)
- Coaching findings (§G)
- Knowledge drafts (§H)
- Intelligence Layer LearningRecommendations (read)

```javascript
{
  id, type: 'PROMPT'|'KNOWLEDGE'|'WORKFLOW'|'TOOL'|'SALES'|'SUPPORT',
  category, severity, title, description,
  proposedChange: { promptSection?, current, suggested, diffPreview },
  evidence, impactEstimate, expectedGainPercentile,
  status: 'RECOMMENDED' → 'AWAITING_APPROVAL' → 'A_B_TEST' → 'DEPLOYED' | 'REJECTED',
  version,
}
```

**Deployment rules (enforced in code):** an approved PROMPT recommendation is registered as a `PromptVariant` (existing model) and enabled via feature flag at max 5% traffic for A/B; never overwrites the production prompt in place. Rollback = disable flag.

## K2. Simulation / Replay Comparison

**File:** `backend/src/learning/replaySimulator.service.js`

Extends the Intelligence Layer Simulator with **comparison mode**:

```
Replay a real conversation twice:
  RUN 1: current production prompt + current knowledge
  RUN 2: candidate variant + approved knowledge draft
Output: ReplayComparison {
  runId, baseRunId,
  differences: [ { turn, baseBehavior, candidateBehavior } ],
  scoreDelta: { overall: +6, sales: +9, empathy: +2 },
  estimatedImprovement: 'confidence 0.84 → 0.91; booking step reached 2 turns earlier',
  verdict: 'ADOPT' | 'ADJUST' | 'REJECT',
}
```

Estimates are conservative (simulated, not live) and never count as production results.

---

# PART L — PART 12: ENTERPRISE SAFETY

**File:** `backend/src/learning/enterpriseSafety.service.js`

## L1. Detectors (P0 priority — run immediately at call end, before other learning)

| Detector | Signal | Alert |
|----------|--------|-------|
| Hallucination | assertion with no RAG support + accepted by caller | CRITICAL → notify |
| Wrong pricing | price quote ≠ knowledge pricing article | CRITICAL → notify |
| Wrong booking | spoken confirmation ≠ appointment record | CRITICAL → notify |
| Duplicate CRM updates | same customer+payload within window | MEDIUM |
| Duplicate appointments | same caller+slot second booking | CRITICAL → notify |
| Unsafe answers | policy words (safety, legal, data) mishandled | HIGH → notify |
| Policy violations | promise of discounts/refunds/features not in KB | HIGH → notify |

## L2. Notification Path

CRITICAL/HIGH → immediate admin notification via existing `receptionistNotification.service.js` (additive call — the service itself is unmodified) + `SafetyAlert` row + webhook to ops channels (configurable, default off). All alerts feed the Safety dashboard.

---

# PART M — DATABASE MODELS (all additive)

```prisma
model LearningRecord {                // Part 1
  id String @id @default(uuid())
  callId String @unique @map("call_id")
  userId String @map("user_id")
  scores Json @default("{}")
  grade String
  improvements Json @default("[]")
  createdAt DateTime @default(now()) @map("created_at")
  @@index([userId, createdAt(sort: Desc)])
  @@map("learning_records")
}

model BehavioralProfile {             // Part 3
  id String @id @default(uuid())
  customerId String @unique @map("customer_id")
  userId String @map("user_id")
  communication Json @default("{}")   // style/speed/tone/technicalLevel
  profile Json @default("{}")         // decisionMaker/budgetSensitivity/followUp/time/language/timezone/channel
  confidence Json @default("{}")
  version Int @default(1)
  updatedAt DateTime @updatedAt @map("updated_at")
  @@index([userId])
  @@map("behavioral_profiles")
}

model SalesIntelligenceSnapshot {     // Part 4
  id String @id @default(uuid())
  callId String @unique @map("call_id")
  customerId String? @map("customer_id")
  userId String @map("user_id")
  buyingIntent Int @map("buying_intent")
  purchaseProbability Float @map("purchase_probability")
  decisionStage String @map("decision_stage")
  urgency String
  competitorMentions Json @default("[]")
  objectionCategories Json @default("[]")
  estimatedDealValue Float @map("estimated_deal_value")
  expectedClosingProbability Float @map("expected_closing_probability")
  createdAt DateTime @default(now()) @map("created_at")
  @@index([userId, createdAt(sort: Desc)])
  @@map("sales_intelligence_snapshots")
}

model BenchmarkSnapshot {             // Part 5
  id String @id @default(uuid())
  callId String @unique @map("call_id")
  userId String @map("user_id")
  dimension String
  percentile Float
  band String                          // TOP_1% | TOP_5% | TOP_10% | AVERAGE | WORST_DECILE
  reference Json @default("{}")
  improvements Json @default("[]")
  segment Json @default("{}")          // industry, fleetSizeBand, intent, state
  createdAt DateTime @default(now()) @map("created_at")
  @@index([dimension, createdAt(sort: Desc)])
  @@map("benchmark_snapshots")
}

model CoachingReport {                // Part 6
  id String @id @default(uuid())
  callId String @unique @map("call_id")
  userId String @map("user_id")
  verdict String
  whyItWorked String?
  whyItFailed String?
  howToImprove String?
  whatShouldChange String?
  promptSection String?
  evidence Json @default("{}")
  createdAt DateTime @default(now()) @map("created_at")
  @@index([userId, createdAt(sort: Desc)])
  @@map("coaching_reports")
}

model KnowledgeDraft {                // Part 7
  id String @id @default(uuid())
  type String                          // FAQ | DOCUMENTATION | RAG_ARTICLE | CORRECTION
  clusterKey String @map("cluster_key")
  question String
  draftTitle String? @map("draft_title")
  draftBody String @map("draft_body")
  sources Json @default("[]")
  evidenceScore Float @map("evidence_score")
  status String @default("DRAFT")      // DRAFT | REVIEW | APPROVED | PUBLISHED | REJECTED
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  @@index([type, status])
  @@map("knowledge_drafts")
}

model EnterpriseScore {               // Part 9
  id String @id @default(uuid())
  callId String @unique @map("call_id")
  userId String @map("user_id")
  overall Int
  sales Int
  support Int
  naturalness Int
  empathy Int
  accuracy Int
  professionalism Int
  businessImpact Int @map("business_impact")
  confidence Int
  grade String
  weights Json @default("{}")
  createdAt DateTime @default(now()) @map("created_at")
  @@index([userId, createdAt(sort: Desc)])
  @@index([grade, createdAt])
  @@map("enterprise_scores")
}

model OptimizationRecommendation {    // Part 10
  id String @id @default(uuid())
  type String                          // PROMPT | KNOWLEDGE | WORKFLOW | TOOL | SALES | SUPPORT
  category String
  severity String @default("MEDIUM")
  title String
  description String?
  proposedChange Json @default("{}")
  evidence Json @default("[]")
  impactEstimate String?
  expectedGainPercentile Float? @map("expected_gain_percentile")
  status String @default("RECOMMENDED")
  version Int @default(1)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  @@index([type, status])
  @@map("optimization_recommendations")
}

model ReplayComparison {              // Part 11
  id String @id @default(uuid())
  baseRunId String @map("base_run_id")
  candidateRunId String @map("candidate_run_id")
  recommendationId String? @map("recommendation_id")
  differences Json @default("[]")
  scoreDelta Json @default("{}")
  estimatedImprovement String?
  verdict String                       // ADOPT | ADJUST | REJECT
  createdAt DateTime @default(now()) @map("created_at")
  @@index([createdAt])
  @@map("replay_comparisons")
}

model SafetyAlert {                   // Part 12
  id String @id @default(uuid())
  detector String
  severity String
  callId String? @map("call_id")
  snippet String?
  expected String?
  actual String?
  notifiedAt DateTime? @map("notified_at")
  status String @default("OPEN")       // OPEN | CONFIRMED | FALSE_POSITIVE | RESOLVED
  createdAt DateTime @default(now()) @map("created_at")
  @@index([severity, status])
  @@index([createdAt])
  @@map("safety_alerts")
}

model LearningPipelineRun {           // platform health
  id String @id @default(uuid())
  jobType String @map("job_type")      // P1_PER_CALL | P2_NIGHTLY | P3_MONTHLY
  windowStart DateTime? @map("window_start")
  windowEnd DateTime? @map("window_end")
  processed Int @default(0)
  failed Int @default(0)
  durationMs Int? @map("duration_ms")
  status String @default("RUNNING")
  error String?
  startedAt DateTime @default(now()) @map("started_at")
  finishedAt DateTime? @map("finished_at")
  @@index([jobType, startedAt(sort: Desc)])
  @@map("learning_pipeline_runs")
}
```

Migration: `npx prisma migrate dev --name self_improving_ai` — additive only.

---

# PART N — BACKEND SERVICES (new files, all under `backend/src/learning/`)

```
learning/
├── index.js                    # composition root + enabled flag
├── queue.js                    # producer: enqueue P0/P1/P2/P3 jobs
├── worker.js                   # consumer: per-priority worker pools
├── conversationLearning.service.js     # Part 1
├── bestConversationDiscovery.service.js# Part 2
├── memoryIntelligence.service.js       # Part 3
├── salesIntelligence.service.js        # Part 4
├── benchmarking.service.js             # Part 5
├── coachingEngine.service.js           # Part 6
├── knowledgeImprovement.service.js     # Part 7
├── executiveIntelligence.service.js    # Part 8
├── enterpriseScoring.service.js        # Part 9
├── optimizationRecommendations.service.js # Part 10
├── replaySimulator.service.js          # Part 11
├── enterpriseSafety.service.js         # Part 12
├── distributions.service.js            # percentile engine (pre-aggregated)
├── adminWorkflow.service.js            # approval gates + variant registration
└── metrics.js                          # platform metrics
```

All services read existing outputs (Intelligence Layer, Multi-Agent logs, CRM) — no existing service is imported-and-modified; they are consumed as dependencies.

---

# PART O — WORKER ARCHITECTURE & QUEUE DESIGN

## O1. Queues (Redis)

| Queue | Priority | Throughput | Consumer |
|-------|----------|-----------|----------|
| `learning:safety` | P0 | immediate (call end) | dedicated safety workers (min 2) |
| `learning:percall` | P1 | minutes | general learning workers |
| `learning:nightly` | P2 | 02:00 UTC | batch workers (pool of 4) |
| `learning:monthly` | P3 | 1st of month | batch workers |
| `learning:dead` | — | poisoned jobs | manual replay |

## O2. Worker Guarantees

- **Idempotency:** every job carries `callId + jobType + version`; processed marker in Redis (TTL 7d) prevents duplicates on retry and multi-instance races.
- **Retries:** P0 ×3 (immediate, 5s, 30s), P1 ×2 (1m, 5m), P2 ×1 (10m).
- **Backpressure:** per-queue rate limiters; P0 jobs preempt P1.
- **Batch safety:** nightly jobs process in pages of 500; partial failure continues (per-page checkpoint).
- **Graceful degrade:** if a worker crashes mid-job, the call's learning simply re-queues next cycle; the call path is never affected.

## O3. Horizontal Scaling

- Any number of worker instances consume the same queues; idempotency keys make races harmless.
- Heavy services (coaching, discovery) can be deployed as separate worker processes.
- Distributions (percentiles) are pre-aggregated hourly so benchmarking never scans raw tables.

---

# PART P — API ENDPOINTS

New route file **`backend/src/routes/receptionistLearning.routes.js`**:

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/receptionist/learning/records/:callId` | Learning record + enterprise score |
| GET | `/api/receptionist/learning/records?from&to&grade=` | Records list (filters) |
| GET | `/api/receptionist/learning/benchmarks/:callId` | Percentile comparison |
| GET | `/api/receptionist/learning/coaching/:callId` | Coaching report |
| GET | `/api/receptionist/learning/best-patterns?type=` | Ranked best patterns |
| GET | `/api/receptionist/learning/profiles?segment=` | Behavioral profiles (aggregate views, PII-masked) |
| GET | `/api/receptionist/learning/sales-intel/:callId` | Sales intelligence snapshot |
| GET | `/api/receptionist/learning/knowledge-drafts?status=` | Knowledge draft queue |
| POST | `/api/receptionist/learning/knowledge-drafts/:id/status` | Approve/reject draft (→ knowledge sync) |
| GET | `/api/receptionist/learning/recommendations` | Optimization recommendations |
| POST | `/api/receptionist/learning/recommendations/:id/status` | Approve → A/B → deploy (flag only) |
| POST | `/api/receptionist/learning/recommendations/:id/simulate` | Trigger replay comparison (§K2) |
| GET | `/api/receptionist/learning/simulations/:recommendationId` | ReplayComparison results |
| GET | `/api/receptionist/learning/safety?severity=&status=` | Safety alerts |
| POST | `/api/receptionist/learning/safety/:id/status` | Confirm / false-positive / resolve |
| GET | `/api/receptionist/learning/executive?from&to` | Executive intelligence rollups |
| GET | `/api/receptionist/learning/roi?window=` | ROI attribution report |
| GET | `/api/receptionist/learning/pipeline` | Learning platform health (queues/workers) |

Roles: `admin` for mutations; `learning_viewer` (new, additive role) for read-only; all mutations audited via existing `AiReceptionistAuditLog`.

---

# PART Q — FRONTEND PAGES & DASHBOARD

New pages under `frontend/src/pages/learning/` (existing pages untouched):

| Page | Content |
|------|---------|
| `Enterprise Scores` | Scorecards, grades, per-dimension trends |
| `Conversation Review` | Learning records + improvements with evidence links |
| `Best Patterns` | Ranked patterns per type, drill into winning calls |
| `Benchmarking` | Percentile bands, segment comparisons |
| `AI Coach` | Coaching reports, why/what/which-prompt-section views |
| `Knowledge Drafts` | Draft queue → approve → knowledge sync status |
| `Executive Intelligence` | All §I dashboards incl. revenue pipeline, ROI, cost/conversation |
| `Recommendations` | Approval workflow, A/B status, simulation results |
| `Safety Center` | Alerts, detectors, notification history |
| `Pipeline Health` | Queues, workers, job failures (ops view) |

---

# PART R — METRICS

`backend/src/learning/metrics.js`:
- Per queue: depth, processed, failed, retry rate, worker lag
- Per job type: duration p50/p95, LLM tokens, cost
- Per service: success rate, fallback rate
- Closed loop: recommendation → approval → A/B → deployed → measured uplift (delta of benchmark percentiles before/after)
- Learning ROI: score improvement per week vs. pipeline cost

---

# PART S — TESTING STRATEGY

| Layer | Coverage |
|-------|----------|
| Unit (`backend/tests/learning/`) | Each Part service: happy path, empty input, malformed events, idempotency, confidence gating, grade thresholds |
| Orchestration | Queue producer/consumer, priority preemption, retries, dead-letter |
| Integration | Real archived call → P1 pipeline → EnterpriseScore + LearningRecord + SafetyAlert; nightly P2 → patterns/benchmarks/coaching/drafts; simulation comparison produces verdict |
| Safety | All 7 detectors incl. CRITICAL notification path (mock notifier) |
| Regression | All existing suites pass with learning platform running in shadow |
| Chaos | Worker crash mid-batch → checkpoint resume; poisoned event → dead-letter, no worker stall; duplicate job delivery → single processing |

---

# PART T — MIGRATION & ROLLOUT

## T1. Migration
1. `prisma migrate dev --name self_improving_ai` (additive).
2. Backfill: EnterpriseScore + LearningRecord from existing `CallReviewReport`/`ConversationScore` (last 90 days); BehavioralProfile from `ReceptionistCustomer` metadata; Sales snapshots from existing BI data (where present).
3. Verify: no existing table touched; zero changes when flag off.

## T2. Rollout
| Stage | Behavior |
|-------|----------|
| 0. Build | Flag `AI_RECEPTIONIST_LEARNING_ENABLED=false`; unit suites green |
| 1. Shadow P1 | P1 pipeline runs on all calls, writes only; no admin pages |
| 2. Safety live | P0 safety alerts active (CRITICAL → notify) — first value delivered |
| 3. Shadow P2 | Nightly discovery/benchmarking/coaching writes; validate against manual review of 20 calls |
| 4. Review UI | Admin pages live; approvals begin (workflow enforced) |
| 5. First A/B | One approved PROMPT recommendation at 5% traffic; measure uplift via benchmarking; expand |
| 6. Steady state | All Parts live; monthly ROI report; loop continuously |

Rollback at any stage = flag off; jobs stop; tables remain inert.

---

# PART U — SECURITY

- **Least privilege:** learning services run under a DB role with INSERT-only on `learning_*` tables and SELECT on existing tables (no UPDATE/DELETE anywhere except their own draft/status rows via admin workflow).
- **PII handling:** behavioral profiles aggregate views are PII-masked in API responses (name/phone/email redacted unless authorized); raw transcripts never leave the server (replay stays server-side).
- **Admin approval gates:** enforced in service code (not just UI) — mutations to recommendations/drafts/prompts require authenticated `admin` session + audit row.
- **Prompt immutability:** production prompt strings are read-only to all learning code (verified by a unit test that attempts an update and asserts failure).
- **Notification safety:** admin notifications are opt-in, rate-limited, and content-scrubbed (no transcript snippets in CRITICAL alerts beyond safe context).

---

# PART V — PERFORMANCE OPTIMIZATION

1. **Sampling:** LLM-heavy jobs (coaching, discovery) sample the top/bottom deciles + a random 5% — never all calls.
2. **Pre-aggregation:** percentile distributions and rollups computed incrementally (hourly), benchmarking reads only aggregates.
3. **Caching:** Redis for dedup markers, distributions (5 min TTL), and executive rollups (5 min TTL).
4. **Batching:** nightly jobs process pages of 500 with per-page checkpoints; per-call jobs batched 10/worker-tick.
5. **Cost control:** rules-first scoring (90% of EnterpriseScore is deterministic), LLM used only for coaching narratives and discovery extraction.
6. **Call-path isolation:** learning enqueues are fire-and-forget; zero code on the caller's audio path beyond the existing event collector.

---

# PART W — SCALABILITY (thousands of simultaneous calls)

- Queue-based fan-out: N worker instances per priority; horizontal worker autoscaling by queue depth (K8s HPA on `learning:*` queue lag).
- Table growth controlled: retention jobs — `SafetyAlert` 180d, `CoachingReport`/`BenchmarkSnapshot` 90d, `LearningRecord`/`EnterpriseScore` 2y (aggregates preserved in Executive rollups).
- Partition-friendly indexes on every table (by `userId`, `createdAt`); per-tenant isolation via `userId` filters on all queries.
- Distributions stored per segment per tenant → benchmarks stay meaningful at fleet scale.
- Dead-letter queue prevents any single event from stalling the learning loop.

---

# SUMMARY — DELIVERED

| Requirement | Delivered |
|-------------|-----------|
| Part 1 Conversation Learning Engine | `conversationLearning.service.js` + `LearningRecord` (§B) |
| Part 2 Best Conversation Discovery | `bestConversationDiscovery.service.js` + `BestConversationPattern` (§C) |
| Part 3 Conversation Memory Intelligence | `memoryIntelligence.service.js` + `BehavioralProfile` (§D) |
| Part 4 Sales Intelligence | `salesIntelligence.service.js` + 9 metrics (§E) |
| Part 5 Benchmarking | `benchmarking.service.js` + percentile bands (§F) |
| Part 6 AI Coaching | `coachingEngine.service.js` + `CoachingReport` (§G) |
| Part 7 Knowledge Improvement | `knowledgeImprovement.service.js` + `KnowledgeDraft` (§H) |
| Part 8 Executive Intelligence | `executiveIntelligence.service.js` + 11 dashboards + ROI (§I) |
| Part 9 Enterprise AI Scoring | `enterpriseScoring.service.js` + 10 scores + grade (§J) |
| Part 10 Optimization Recs | `optimizationRecommendations.service.js` + admin-gated workflow (§K1) |
| Part 11 Simulation | `replaySimulator.service.js` + `ReplayComparison` (§K2) |
| Part 12 Enterprise Safety | `enterpriseSafety.service.js` + 7 detectors + CRITICAL alerts (§L) |
| Architecture / DB / Services / Frontend / API / Worker / Queue / Testing / Metrics / Migration / Rollout / Security / Scalability / Performance | Parts A, M, N, O, P, Q, R, S, T, U, V, W |

**Zero modifications** to existing production modules. The closed learning loop ensures every call makes the system measurably smarter, with every change gated by admin approval and verified by benchmarking.