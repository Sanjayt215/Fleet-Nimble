# FleetNimble AI Receptionist — Multi-Agent Architecture

**Scope:** Add a Multi-Agent AI layer on top of the existing Conversation Engine and Intelligence Layer.
**Constraint:** Zero modification to existing production modules. The customer always hears **one** receptionist; specialist agents work invisibly behind the scenes.

---

# PART A — ARCHITECTURE

## A1. Design Principles

1. **One voice, many minds** — only the Receptionist Agent produces caller-facing speech. All other agents return internal structured results.
2. **Supervisor-first routing** — every caller utterance is handled by the Supervisor Agent, which selects/coordinates specialists deterministically (cheap rules first, LLM only when necessary).
3. **Dependency-aware execution** — agents form a DAG per task; independent agents run in parallel, dependent ones sequence.
4. **Failure isolation** — an agent failure degrades to the Supervisor's fallback plan, never to a dead conversation.
5. **Shared, persistent context** — one `SharedMemory` per call, hydrated from CRM/RAG, persisted on every change.
6. **Horizontal scalability** — in-process message bus for single instance; Redis-backed task queue for multi-instance deployments.

## A2. System Diagram

```
                          CALLER (hears ONE voice: Ava)
                                     │
                        ┌────────────▼────────────┐
                        │   EXISTING PIPELINE     │
                        │  Twilio ←→ Gemini Live  │
                        └────────────────────────┘
                                     │ events
                                     ▼
                  ┌───────────────────────────────────┐
                  │      SUPERVISOR AGENT (NEW)        │
                  │  multiagent/orchestrator.js        │
                  │  • task routing (rules-first)      │
                  │  • parallel execution (DAG)        │
                  │  • merge outputs / resolve conflicts│
                  │  • dedupe + retry + fallback       │
                  └──────┬──────┬──────┬──────┬───────┘
                         │      │      │      │
         ┌───────────────┘      │      │      └───────────────┐
         ▼                      ▼      ▼                      ▼
┌───────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ RECEPTIONIST  │    │    SALES     │    │    SUPPORT   │    │ FLEET EXPERT │
│ agent         │    │    agent     │    │    agent     │    │    agent     │
│ (the ONLY     │    │  lead qual,  │    │  triage,     │    │  tracking,   │
│  speaker)     │    │  pricing,    │    │  troubleshooting│ │  diagnostics │
└──────┬────────┘    │  ROI, demo   │    └──────┬───────┘    └──────┬───────┘
       │             └──────┬───────┘           │                   │
       │                    │                   │                   │
┌──────▼─────────┐  ┌───────▼─────────┐ ┌──────▼───────┐  ┌────────▼───────┐
│  CRM AGENT     │  │  KNOWLEDGE      │ │ SCHEDULING   │  │  ANALYTICS     │
│  lookup/update │  │  AGENT (RAG)    │ │ agent        │  │  agent         │
│  timeline      │  └────────────────┘ │ calendar,    │  │  scoring,      │
└────────────────┘                     │ confirmations│  │  insights      │
                                       └──────────────┘  └────────────────┘
                          │
                          ▼
                ┌─────────────────────┐
                │  SHARED MEMORY      │
                │  multiagent/shared/ │
                │  agentMemory.js     │
                └─────────────────────┘
```

## A3. Agent Registry (capabilities + costs)

```javascript
// multiagent/registry.js — loaded once at startup, agents self-register
export const AGENT_REGISTRY = {
  receptionist: { skills: ['greeting','identity','intent','routing','smallTalk','closing'],
                  kind: 'SPEAKER',     cost: 'llm',        parallelSafe: false },
  sales:        { skills: ['leadQual','buyingSignals','recommendation','pricing','roi',
                           'demoBooking','objections','competitors','proposals'],
                  kind: 'ANALYST',     cost: 'llm',        parallelSafe: true },
  fleetExpert:  { skills: ['tracking','gps','health','maintenance','fuel','drivers',
                           'compliance','reports','diagnostics'],
                  kind: 'ANALYST',     cost: 'llm',        parallelSafe: true },
  support:      { skills: ['techIssues','bugs','troubleshooting','escalation','tickets'],
                  kind: 'ACTOR',       cost: 'llm',        parallelSafe: true },
  crm:          { skills: ['lookup','leadUpdate','contactCreate','companyCreate',
                           'activityTimeline','callHistory','relationships'],
                  kind: 'DATA',        cost: 'rules+db',   parallelSafe: true },
  scheduling:   { skills: ['calendar','availability','timezone','meetingCreate',
                           'demoConfirm','emailConfirm','smsConfirm','reminders'],
                  kind: 'DATA',        cost: 'rules+db',   parallelSafe: false },
  analytics:    { skills: ['quality','leadScore','sentiment','summary','insights',
                           'aiPerformance','kpis'],
                  kind: 'OBSERVER',    cost: 'cheap+llm',  parallelSafe: true },
  knowledge:    { skills: ['rag','retrieval','webSearch','docs','pricing','policies',
                           'faq','confidence'],
                  kind: 'DATA',        cost: 'rules+rag',  parallelSafe: true },
};
```

---

# PART B — AGENT COMMUNICATION PROTOCOL

## B1. Task Message (Supervisor → Agent)

```javascript
{
  protocolVersion: 1,
  taskId: 'T-9f2a...',                 // uuid
  runId: 'R-...',                      // one per caller utterance
  agent: 'knowledge',
  task: {
    type: 'retrieve',                  // agent-specific action
    payload: { query: 'Fleet Tracking pricing', intent: 'PRICING' },
  },
  context: { memoryRef: 'M-...', fsmState: 'FAQ', turn: 7 },
  constraints: { timeoutMs: 4000, maxResults: 3, parallelGroup: 'A' },
  idempotencyKey: 'hash(context+task)',
}
```

## B2. Agent Response Message (Agent → Supervisor)

```javascript
{
  protocolVersion: 1,
  taskId: 'T-9f2a...',
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED',
  result: { ... },                     // agent-specific structured result
  confidence: 0.92,                    // used by Supervisor for merging
  artifacts: { sources: ['article-42'], citations: [...] },
  cost: { llmTokens: 0, dbQueries: 1, cacheHits: 2, ms: 38 },
  error: null | { code, message },
}
```

## B3. Supervisor Merge Rules

| Situation | Rule |
|-----------|------|
| Conflicting knowledge answers | Higher `confidence` wins; tie → Receptionist says "I'll confirm that with our team" |
| Sales ROI + Fleet Expert numbers disagree | Fleet Expert is authoritative for product facts; Sales for commercial framing |
| CRM says X, caller says Y | Caller wins for identity fields; CRM wins for history; both recorded |
| Duplicate tasks (same idempotencyKey) | Second task skipped, first result reused |
| Scheduling conflict | Scheduling Agent returns alternatives; Sales Agent picks best per lead preference |

## B4. Task Dedup

`idempotencyKey = sha256(agent + task.type + canonical(payload) + callSid)` — cached in Redis (TTL 1h). Prevents CRM double-updates and double bookings across parallel runs and retries.

---

# PART C — SHARED MEMORY

## C1. `AgentMemory` (one per call)

**File:** `backend/src/multiagent/shared/agentMemory.js`

```javascript
{
  memoryId: 'M-...',
  callSid, userId, companyId,
  identity:  { name, company, phone, email, fleetSize, preferredLanguage, timezone },
  crm:       { customerId, isReturning, history: { calls, appointments, tickets } },
  conversation: { state, previousState, intent, intentQueue, taskStack, planningLog },
  businessIntelligence: { industry, vehicleTypes, painPoints, urgency, budgetSignals, buyingStage, decisionMaker },
  lead:      { score, qualified, stage },
  knowledge: { retrievedArticles: [], answeredTopics: [], confidenceByTopic: {} },
  currentTask: { taskId, agent, type, at },
  pendingTasks: [ { taskId, agent, type, priority, status } ],
  emotions:  { current, trajectory: [] },
  facts:     { custom: {} },          // anything learned this call
}
```

## C2. Access Control

- Agents **read** all shared memory; **write** only their owned sections (enforced by `OWNED_KEYS` map) — prevents agents clobbering each other.
- Supervisor writes `conversation` + `currentTask`/`pendingTasks`.
- Persisted via existing `AiReceptionistCall` JSON columns (`collectedData`, `intentQueue`, `taskStack`) + new `AgentRun` rows (§E).

## C3. Hydration Sequence

```
Call start → Receptionist agent greets
           → CRM agent hydrates identity+history (rules+db, <10ms)
           → Knowledge agent preloads relevant articles if returning/intent known
           → Supervisor marks memory ready → normal flow
```

---

# PART D — TASK EXECUTION (worked example)

**Caller:** *"I'd like to know about Fleet Tracking pricing and schedule a demo."*

## D1. Supervisor Decision Graph

```
Utterance → Receptionist (parses, identifies TWO intents: PRICING + DEMO)
  → Supervisor splits into a DAG:

  Stage 1 (parallel group A):
    ├── Knowledge agent  → retrieve Fleet Tracking + pricing articles
    ├── CRM agent        → ensure customer record, pull fleet context
    └── Sales agent      → preliminary buying-signal scan (rule-based first)

  Stage 2 (depends on A):
    ├── Sales agent      → compose pricing answer using knowledge artifacts
    │                     + fleet-size context (rule-based templating; LLM only if caller
    │                     asks an unpredicted pricing nuance)
    └── Scheduling agent → availability lookup + timezone (rules+db)

  Stage 3:
    ├── Sales agent      → propose demo slots (candidate list from scheduling)
    └── CRM agent        → stage lead: EVALUATION→DECISION, store intent

  Stage 4:
    Receptionist agent   → merges into ONE natural reply:
      "Fleet Tracking starts at $X per vehicle per month depending on your fleet size.
       I can schedule a demo — does Thursday at 10 AM or 2 PM work better for you?"
```

## D2. Efficiency in This Example

| Optimization | Applied |
|--------------|---------|
| Rules-first | CRM lookup + scheduling = rules/DB only (0 LLM tokens) |
| Knowledge reuse | pricing article cached in memory; second pricing question = cache hit |
| Parallel group A | 3 agents concurrent (single-instance: Promise.all; multi-instance: Redis queue) |
| LLM avoided | stage-2 pricing answer templated from structured knowledge result |
| Dedup | `idempotencyKey` per agent+task prevents rework if caller repeats request |

---

# PART E — DATABASE ADDITIONS (additive)

```prisma
model AgentRun {
  id          String   @id @default(uuid())
  callId      String   @map("call_id")
  callSid     String?
  runId       String   @unique @map("run_id")
  utterance   String?                       // caller turn that triggered the run
  fsmState    String?  @map("fsm_state")
  startedAt   DateTime @default(now()) @map("started_at")
  finishedAt  DateTime? @map("finished_at")
  status      String   @default("RUNNING") // RUNNING | SUCCESS | PARTIAL | FAILED
  outcome     Json?                          // merged result handed to Receptionist
  @@index([callId, startedAt])
  @@index([status, startedAt])
  @@map("agent_runs")
}

model AgentTaskLog {
  id          String   @id @default(uuid())
  runId       String   @map("run_id")
  callId      String   @map("call_id")
  agent       String
  taskType    String   @map("task_type")
  status      String                         // SUCCESS | PARTIAL | FAILED | SKIPPED | RETRIED
  confidence  Float?
  costMs      Int?     @map("cost_ms")
  llmTokens   Int?     @map("llm_tokens")
  dbQueries   Int?     @map("db_queries")
  cacheHits   Int?     @map("cache_hits")
  retries     Int      @default(0)
  error       String?
  at          DateTime @default(now())
  @@index([callId])
  @@index([agent, at])
  @@index([runId])
  @@map("agent_task_logs")
}
```

Migration: `npx prisma migrate dev --name multi_agent` — additive only. Supervisor trace/replay (used by Supervisor Mode from the Intelligence Layer) reads these tables.

---

# PART F — SERVICE ARCHITECTURE

## F1. New Files (`backend/src/multiagent/`)

```
multiagent/
├── index.js                    # composition root, enabled flag
├── orchestrator.js             # SUPERVISOR: routing, DAG, merge, retry, fallback
├── registry.js                 # agent registry (§A3)
├── protocol.js                 # task/response message builders + validators
├── dag.js                      # dependency graph builder + parallel scheduler
├── failurePolicy.js            # retry/fallback/degrade rules per agent kind
├── shared/
│   ├── agentMemory.js          # §C1
│   └── memoryStore.js          # Redis-backed store for multi-instance mode
├── agents/
│   ├── receptionist.agent.js
│   ├── sales.agent.js
│   ├── fleetExpert.agent.js
│   ├── support.agent.js
│   ├── crm.agent.js
│   ├── scheduling.agent.js
│   ├── analytics.agent.js
│   └── knowledge.agent.js
└── integrations/
    ├── conversationBridge.js   # thin adapter: engine events ↔ supervisor tasks
    └── intelligenceBridge.js   # hands results to Intelligence Layer (reviews, gaps)
```

## F2. What Each Agent Wraps (existing modules, unmodified)

| Agent | Uses (read-only or via existing service APIs) |
|-------|-----------------------------------------------|
| Receptionist | Conversation Engine state handlers (GREETING/INTENT/CLOSING) — the speaker |
| Sales | `receptionistCRM.service.js`, `receptionistScheduling.service.js`, knowledge pricing articles |
| Fleet Expert | RAG retrieval filtered to fleet topics; vehicle data via existing fleet services |
| Support | `receptionistSupport.service.js` (ticket creation), RAG troubleshooting articles |
| CRM | `receptionistCRM.service.js`, `receptionistMemory.service.js` |
| Scheduling | `receptionistCalendar.service.js`, `receptionistNotification.service.js` (email/SMS), timezone utils |
| Analytics | Intelligence Layer scoring/review services (post-call) |
| Knowledge | RAG engine (`knowledge/rag/*`), `receptionistKnowledgeBase.service.js` |

## F3. Execution Modes

| Mode | When |
|------|------|
| `rules` | CRM lookups, calendar availability, timezone conversion, RAG retrieval, templated pricing |
| `llm` | Sales objections, ROI narrative, ambiguity, unpredicted phrasing |
| `parallel` | Independent analysts (sales/fleetExpert/knowledge/crm) per DAG group |
| `deferred` | Analytics + post-call Intelligence Layer work — queued, never blocks the call |

---

# PART G — API CHANGES

New route file **`backend/src/routes/receptionistMultiAgent.routes.js`** (mounted in `app.js`; existing `aiReceptionist.routes.js` untouched):

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/receptionist/multiagent/status` | Agent registry + health + enabled state |
| GET | `/api/receptionist/multiagent/runs/:callId` | Orchestration runs for a call (DAG view) |
| GET | `/api/receptionist/multiagent/runs/:runId/tasks` | Task-level trace (agent, latency, cost, retries) |
| GET | `/api/receptionist/multiagent/performance?from&to` | Per-agent success/latency/cost aggregates |
| POST | `/api/receptionist/multiagent/debug/:callId/replay` | Re-run routing decisions offline (shadow) |

Auth: same `authenticate` middleware + rate limiter; `admin`/`supervisor` roles for traces.

---

# PART H — DASHBOARD UPDATES (additive pages/components)

| Panel | Content |
|-------|---------|
| Agent Activity (live) | Active runs, current agent per call, parallel groups |
| Agent Performance | Success rate, avg latency, LLM token cost, fallback rate per agent (from `AgentTaskLog`) |
| DAG Explorer | Visual per-run dependency graph (supervisor view) |
| Cost Monitor | LLM vs. rules split, cache hit ratio, tokens/call trend |
| Failure Board | Agent failures, retries, degrade events (links to Intelligence Layer safety) |

Frontend: new page + components under `frontend/src/pages/multiagent/` and `frontend/src/services/receptionistMultiAgent.js`; existing pages untouched.

---

# PART I — METRICS

`backend/src/multiagent/metrics.js` (new counters, existing `receptionistMetrics.service.js` untouched):

- Runs: total, success, partial, failed; avg DAG width (parallelism)
- Tasks: per agent — count, success, latency p50/p95, retries, LLM tokens, cache hits, db queries
- Dedup: tasks skipped via idempotencyKey
- Fallbacks: degrade events, which fallback plan used
- Cost: LLM tokens per call (by agent), rules/LLM ratio
- Correlation: agent latency → caller emotion change (via Intelligence Layer emotion data)

---

# PART J — TESTING STRATEGY

## J1. Unit Tests (`backend/tests/multiagent/`)

| File | Covers |
|------|--------|
| `registry.test.js` | Registration, capability queries, cost metadata |
| `protocol.test.js` | Message validation, malformed rejection |
| `dag.test.js` | Dependency ordering, parallel groups, cycle rejection |
| `orchestrator.test.js` | Routing decision table; merge rules; conflict resolution (confidence wins) |
| `failurePolicy.test.js` | Retry with backoff, degrade to fallback, no context loss on failure |
| `agents/*.test.js` | Each agent: happy path, partial result, error, idempotency key stability |
| `memory.test.js` | Owned-section enforcement, hydration, persistence round-trip |

## J2. Integration Tests

1. The §D worked example end-to-end: one utterance → DAG → merged single reply (asserts caller sees exactly one response; asserts no duplicate CRM/scheduling writes).
2. Agent failure injection (Knowledge agent down): Supervisor falls back to Knowledge→Receptionist direct answer path; call completes.
3. Parallel safety: CRM + Scheduling run concurrently; dedup prevents double booking.
4. Reconnect mid-run: `AgentRun` re-hydrates from DB; pending tasks resume from memory; no repeated tool calls.
5. Regression: existing suites (receptionist, ai-receptionist, realtime-pipeline, knowledge) pass unchanged with the layer enabled in shadow.

## J3. Simulator Integration

Reuse the Intelligence Layer's Conversation Simulator with scenarios targeting multi-agent behavior: multi-intent utterances, agent failure, parallel contention, slow knowledge agent.

---

# PART K — MIGRATION PLAN

1. `prisma migrate dev --name multi_agent` (additive tables).
2. Deploy `multiagent/` code behind flag `AI_RECEPTIONIST_MULTIAGENT_ENABLED=false` (default) — no behavior change.
3. Seed backfill: create `AgentRun`/`AgentTaskLog` from existing `planningLog` + `CallEventLog` (90 days) for historical traces (optional, admin).
4. Verify: zero schema impact on existing tables; old paths byte-identical when flag off.

---

# PART L — ROLLOUT PLAN

| Stage | Duration | Behavior |
|-------|----------|----------|
| 0. Build | — | Flag off; agents unit-tested; registry health endpoint live |
| 1. Shadow routing | 1 week | Supervisor runs routing in shadow for all calls; results logged to `AgentRun`; Receptionist continues using existing engine responses (no caller impact) |
| 2. Shadow execution | 1 week | Agents execute for real but outputs are discarded after logging; measure latency/cost/fallback vs. baseline |
| 3. Canary | 2 weeks | 10% of calls use multi-agent flow; monitor metrics (§I) + Intelligence Layer scores; rollback = flag off per-tenant |
| 4. Gradual | 25% → 50% → 100% | Only after canary passes success criteria |
| 5. Steady state | — | Agents continuously evaluated by Analytics Agent + Intelligence Layer; Supervisor tuning via admin-approved recommendations only |

**Success criteria:** single-response guarantee 100% · zero duplicate bookings/CRM updates · p95 added latency < 150ms (rules tasks) / < 400ms (LLM tasks) · fallback rate < 2% · cost per call ≤ baseline + 5% (LLM-minimization holds) · all regression suites green.

---

# PART M — FAILURE HANDLING SUMMARY

| Failure | Policy |
|---------|--------|
| Agent returns FAILED | Supervisor consults `failurePolicy`: retry once (rules agents) / twice (LLM agents, backoff 300/900ms); then degrade to cheapest capable agent |
| Knowledge agent down | Receptionist answers from cached memory topics or politely defers to human ("Let me have a specialist call you") |
| Scheduling agent down | Booking deferred: collect details, queue `create_appointment` for retry; caller told demo will be confirmed by email |
| CRM agent down | Identity kept in shared memory; CRM writes queued and replayed by worker after recovery (idempotent) |
| Supervisor itself fails | Conversation Engine's deterministic state handlers remain the fallback — the call continues as pre-multi-agent |
| Context at risk | Shared memory persisted per change; every retry/reconnect re-hydrates from DB — nothing is held only in RAM |

---

# PART N — ENTERPRISE SCALE NOTES

- **Single instance:** in-process EventEmitter bus — zero overhead.
- **Multi instance:** task messages via Redis (`agent-task-*` queues per agent), shared memory via Redis with TTL = call duration; idempotency keys dedupe across retries and instances.
- **Worker isolation:** heavy agents (sales/fleetExpert) can be deployed as separate worker processes reading the same queues.
- **Bounded parallelism:** per-call DAG width ≤ 4; global per-tenant concurrency cap.
- **Cost control:** rules-first ordering, RAG/CRM caching, LLM agents invoked only when confidence in templated path < threshold.

---

# SUMMARY — DELIVERED

| Requirement | Delivered |
|-------------|-----------|
| 8 specialist agents + Supervisor | Part A3, F1 (9 agent files + orchestrator) |
| Agent communication protocol | Part B (task/response messages, merge rules, dedup) |
| Shared memory | Part C (`AgentMemory`, owned sections, hydration) |
| Task execution example | Part D (full DAG walkthrough of pricing + demo) |
| Performance (rules-first, cache, parallel) | Parts D2, F3, N |
| Failure handling | Part M (per-agent policies, zero context loss) |
| Architecture | Part A |
| Database additions | Part E (`AgentRun`, `AgentTaskLog`) |
| Service architecture | Part F |
| API changes | Part G (5 endpoints) |
| Dashboard updates | Part H (5 panels) |
| Metrics | Part I |
| Testing strategy | Part J (unit + integration + simulator) |
| Migration plan | Part K (additive, flag-guarded) |
| Rollout plan | Part L (shadow → canary → gradual) |

Zero modifications to Twilio, Gemini Live, Media Streams, CRM, Dashboard, RAG, Business Tools, Conversation Engine, or Intelligence Layer.