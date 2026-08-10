import { describe, it, expect, vi } from 'vitest';
import { createRegistry } from '../../src/multiagent/registry.js';
import { MultiAgentOrchestrator } from '../../src/multiagent/orchestrator.js';
import { AgentMemory } from '../../src/multiagent/shared/agentMemory.js';
import { MetricsRegistry } from '../../src/multiagent/metrics.js';
import { AgentHealthMonitor } from '../../src/multiagent/health.js';
import { buildTask, successResponse, failedResponse, TASK_STATUS, RUN_STATUS, INTENTS } from '../../src/multiagent/protocol.js';
import { ReceptionistAgent } from '../../src/multiagent/agents/receptionist.agent.js';
import { SalesAgent } from '../../src/multiagent/agents/sales.agent.js';
import { FleetExpertAgent } from '../../src/multiagent/agents/fleetExpert.agent.js';
import { CrmAgent } from '../../src/multiagent/agents/crm.agent.js';
import { KnowledgeAgent } from '../../src/multiagent/agents/knowledge.agent.js';
import { SchedulingAgent } from '../../src/multiagent/agents/scheduling.agent.js';
import { SupportAgent } from '../../src/multiagent/agents/support.agent.js';
import { parseDateTime, resolveSchedulingText, assembleSchedulingPayload, formatSchedulingSummary } from '../../src/services/receptionistScheduling.service.js';

class FakeMemoryStore {
  constructor() {
    this.claimed = new Set();
    this.results = new Map();
  }
  async claimIdempotency(key) {
    if (this.claimed.has(key)) {
      return { alreadyProcessed: true, result: this.results.get(key) || null };
    }
    return { alreadyProcessed: false, result: null };
  }
  async recordIdempotency(key, value) {
    this.claimed.add(key);
    this.results.set(key, value);
  }
  async saveMemory(memory) { this.saved = memory.toPersistence(); return this.saved; }
  async loadMemory() { return null; }
  async deleteMemory() {}
  getStats() { return { inMemory: true }; }
}

function buildOrchestrator({ memoryStore = null, health = null, overrides = {} } = {}) {
  const registry = createRegistry();
  const metrics = new MetricsRegistry();

  registry.register(new ReceptionistAgent());
  registry.register(new SalesAgent());
  registry.register(new FleetExpertAgent());
  registry.register(new CrmAgent({ deps: {
    getCustomers: vi.fn().mockResolvedValue({ customers: [{ id: 'c1', name: 'Alice', companyName: 'ACME', fleetSize: 25, leadScore: 55, salesStage: 'DEMO' }] }),
    getCustomerById: vi.fn().mockResolvedValue(null),
    updateCustomerStatus: vi.fn().mockResolvedValue({ id: 'c1' }),
    addCustomerNote: vi.fn().mockResolvedValue({ id: 'n1' }),
    recalculateLeadScore: vi.fn().mockResolvedValue({ id: 'c1', leadScore: 70 }),
  } }));
  registry.register(new KnowledgeAgent({ deps: {
    queryKnowledgeBase: vi.fn().mockResolvedValue('Fleet Tracking starts at $29 per vehicle per month.'),
    getKnowledgeTopics: vi.fn().mockResolvedValue(['tracking']),
    retrieve: vi.fn().mockResolvedValue({ hasAnswer: true, confidence: 0.8, passages: [{ articleId: 'a1', chunkText: 'x', score: 0.8 }] }),
  } }));
  registry.register(new SchedulingAgent({ deps: {
    parseDateTime, resolveSchedulingText, assembleSchedulingPayload, formatSchedulingSummary,
    createAppointment: vi.fn().mockResolvedValue({ id: 'appt-1' }),
  } }));
  registry.register(new SupportAgent({ deps: { createSupportTicket: vi.fn().mockResolvedValue({ id: 't-1' }) } }));

  const orchestrator = new MultiAgentOrchestrator({
    registry,
    memoryStore: memoryStore || new FakeMemoryStore(),
    metrics,
    health: health || new AgentHealthMonitor(),
    persistenceModule: { persistRun: vi.fn().mockResolvedValue(null) },
  });
  Object.assign(orchestrator, overrides);
  return orchestrator;
}

const baseContext = {
  userId: 'u1',
  callId: 'call-1',
  callSid: 'CA1',
  context: { callerPhone: '+15551234567', callerName: 'Alice' },
};

describe('orchestrator: routing', () => {
  it('routes pricing questions through knowledge + sales + crm', async () => {
    const orchestrator = buildOrchestrator();
    const tasks = orchestrator.buildTaskGraph({
      runId: 'R-1', message: 'how much does tracking cost?',
      intent: INTENTS.PRICING_QUESTION, ...baseContext, memory: new AgentMemory({ callSid: 'CA1' }),
    });
    const agents = tasks.map(t => t.agent);
    expect(agents).toContain('knowledge');
    expect(agents).toContain('sales');
    expect(agents).toContain('crm');
    expect(agents).not.toContain('receptionist');
  });

  it('routes scheduling requests to scheduling agent', async () => {
    const orchestrator = buildOrchestrator();
    const tasks = orchestrator.buildTaskGraph({
      runId: 'R-1', message: 'book a demo tomorrow',
      intent: INTENTS.SCHEDULE_MEETING, ...baseContext, memory: new AgentMemory({ callSid: 'CA1' }),
    });
    expect(tasks.map(t => t.agent)).toContain('scheduling');
  });

  it('omits crm lookup when no identity is available', async () => {
    const orchestrator = buildOrchestrator();
    const tasks = orchestrator.buildTaskGraph({
      runId: 'R-1', message: 'book a demo',
      intent: INTENTS.SCHEDULE_MEETING, userId: 'u1', callId: 'call-1', callSid: 'CA1',
      context: {}, memory: new AgentMemory({ callSid: 'CA1' }),
    });
    expect(tasks.map(t => t.agent)).not.toContain('crm');
  });

  it('makes pricing composition depend on knowledge retrieval', async () => {
    const orchestrator = buildOrchestrator();
    const tasks = orchestrator.buildTaskGraph({
      runId: 'R-1', message: 'how much?',
      intent: INTENTS.PRICING_QUESTION, ...baseContext, memory: new AgentMemory({ callSid: 'CA1' }),
    });
    const compose = tasks.find(t => t.agent === 'sales' && t.task.type === 'composePricing');
    const knowledge = tasks.find(t => t.agent === 'knowledge');
    expect(compose.constraints.dependsOn).toContain(knowledge.taskId);
  });

  it('routes support intents through triage before ticket creation', async () => {
    const orchestrator = buildOrchestrator();
    const tasks = orchestrator.buildTaskGraph({
      runId: 'R-1', message: 'I have a bug',
      intent: INTENTS.SUPPORT_REQUEST, ...baseContext, memory: new AgentMemory({ callSid: 'CA1' }),
    });
    const triage = tasks.find(t => t.agent === 'support' && t.task.type === 'triage');
    const ticket = tasks.find(t => t.agent === 'support' && t.task.type === 'createTicket');
    expect(ticket.constraints.dependsOn).toContain(triage.taskId);
  });
});

describe('orchestrator: end-to-end runs', () => {
  it('produces a single merged reply for a pricing question', async () => {
    const orchestrator = buildOrchestrator();
    const run = await orchestrator.orchestrate({ ...baseContext, message: 'how much does tracking cost?' });
    expect(run.runId).toMatch(/^R-/);
    expect(run.status).toBe(RUN_STATUS.SUCCESS);
    expect(run.reply).toBeTruthy();
    expect(run.agents.knowledge.status).toBe(TASK_STATUS.SUCCESS);
    expect(run.agents.crm).toBeDefined();
    expect(run.intent).toBe(INTENTS.PRICING_QUESTION);
  });

  it('keeps one voice: only receptionist composes the reply', async () => {
    const orchestrator = buildOrchestrator();
    const run = await orchestrator.orchestrate({ ...baseContext, message: 'how much does tracking cost?' });
    expect(run.agents.receptionist.taskType).toBe('composeReply');
    expect(typeof run.reply).toBe('string');
  });

  it('produces a booking confirmation flow for scheduling intents', async () => {
    const orchestrator = buildOrchestrator();
    const run = await orchestrator.orchestrate({
      ...baseContext,
      message: 'I want to book a demo tomorrow at 2pm',
    });
    expect(run.agents.scheduling).toBeDefined();
    expect(run.reply).toBeTruthy();
  });

  it('handles greetings without specialist agents', async () => {
    const orchestrator = buildOrchestrator();
    const run = await orchestrator.orchestrate({ ...baseContext, message: 'hello' });
    expect(run.intent).toBe(INTENTS.GREETING);
    expect(run.status).toBe(RUN_STATUS.SUCCESS);
    expect(run.reply).toBeTruthy();
  });

  it('persists runs through the persistence module', async () => {
    const persistRun = vi.fn().mockResolvedValue(null);
    const orchestrator = buildOrchestrator({ overrides: {} });
    orchestrator.persistence = { persistRun };
    await orchestrator.orchestrate({ ...baseContext, message: 'hello' });
    expect(persistRun).toHaveBeenCalledTimes(1);
    const record = persistRun.mock.calls[0][0];
    expect(record.runId).toMatch(/^R-/);
    expect(record.taskLogs).toBeInstanceOf(Array);
  });

  it('does not persist runs when persistRuns is disabled', async () => {
    const persistRun = vi.fn();
    const orchestrator = buildOrchestrator();
    orchestrator.persistence = { persistRun };
    const original = orchestrator._persistRun;
    orchestrator._persistRun = () => {};
    await orchestrator.orchestrate({ ...baseContext, message: 'hello' });
    orchestrator._persistRun = original;
    expect(persistRun).not.toHaveBeenCalled();
  });
});

describe('orchestrator: merge rules', () => {
  it('merges knowledge and sales results with confidence', async () => {
    const orchestrator = buildOrchestrator();
    const merged = { agents: {} };
    const knowledgeTask = buildTask({ runId: 'R-1', agentId: 'knowledge', taskType: 'retrieve', payload: {} });
    const salesTask = buildTask({ runId: 'R-1', agentId: 'sales', taskType: 'composePricing', payload: {} });
    merged.agents.knowledge = successResponse(knowledgeTask, { answer: 'KB', confidence: 0.7 }, { confidence: 0.7 });
    merged.agents.sales = successResponse(salesTask, { reply: 'quote line' }, { confidence: 0.9 });
    orchestrator.applyMergeRules(merged);
    expect(merged.confidence).toBe(0.9);
    expect(merged.agents.sales.result.reply).toBe('quote line');
  });

  it('marks runs PARTIAL when a specialist degrades', async () => {
    const health = new AgentHealthMonitor({ failureThreshold: 5 });
    const orchestrator = buildOrchestrator({ health });
    const knowledgeAgent = orchestrator.registry.get('knowledge');
    const failing = {
      ...knowledgeAgent,
      execute: async (task) => failedResponse(task, new Error('kb outage')),
    };
    orchestrator.registry.register(failing, orchestrator.registry.getMetadata('knowledge'));
    const run = await orchestrator.orchestrate({ ...baseContext, message: 'how much does tracking cost?' });
    expect(run.status).toBe(RUN_STATUS.PARTIAL);
    expect(run.agents.knowledge.artifacts.degradedFallback).toBe(true);
    expect(run.reply).toBeTruthy();
  });

  it('degraded knowledge falls back through the receptionist', async () => {
    const health = new AgentHealthMonitor({ failureThreshold: 5 });
    const orchestrator = buildOrchestrator({ health });
    const knowledgeAgent = orchestrator.registry.get('knowledge');
    orchestrator.registry.register({
      ...knowledgeAgent,
      execute: async (task) => failedResponse(task, new Error('kb outage')),
    }, orchestrator.registry.getMetadata('knowledge'));
    const run = await orchestrator.orchestrate({ ...baseContext, message: 'how much does tracking cost?' });
    expect(run.agents.knowledge.artifacts.degradedFallback).toBe(true);
    expect(run.reply).toBeTruthy();
    expect(run.agents.receptionist.taskType).toBe('composeReply');
  });
});

describe('orchestrator: dedup and health', () => {
  it('skips duplicate tasks via idempotency keys', async () => {
    const memoryStore = new FakeMemoryStore();
    const orchestrator = buildOrchestrator({ memoryStore });
    await orchestrator.orchestrate({ ...baseContext, message: 'how much does tracking cost?' });
    const second = await orchestrator.orchestrate({ ...baseContext, message: 'how much does tracking cost?' });
    expect(second.agents.knowledge.artifacts.deduped).toBe(true);
    expect(memoryStore.claimed.size).toBeGreaterThan(0);
  });

  it('opens the circuit after repeated agent failures and skips the agent', async () => {
    const health = new AgentHealthMonitor({ failureThreshold: 3 });
    const orchestrator = buildOrchestrator({ health });
    const supportAgent = orchestrator.registry.get('support');
    orchestrator.registry.register({
      ...supportAgent,
      execute: async (task) => failedResponse(task, new Error('support down')),
    }, orchestrator.registry.getMetadata('support'));

    for (let i = 0; i < 3; i++) {
      await orchestrator.orchestrate({ ...baseContext, message: `I have a problem with billing ${i}` });
    }
    expect(health.getStatus('support').state).toBe('OPEN');

    const run = await orchestrator.orchestrate({ ...baseContext, message: 'I have a problem with billing final' });
    expect(run.agents.support.status).toBe(TASK_STATUS.SKIPPED);
    expect(run.reply).toBeTruthy();
  });

  it('records run metrics', async () => {
    const metrics = new MetricsRegistry();
    const orchestrator = buildOrchestrator({ overrides: {} });
    orchestrator.metrics = metrics;
    await orchestrator.orchestrate({ ...baseContext, message: 'hello' });
    const snapshot = metrics.snapshot();
    expect(snapshot.runs.total).toBeGreaterThan(0);
    expect(snapshot.agents.receptionist.tasks).toBeGreaterThan(0);
  });
});

describe('orchestrator: status', () => {
  it('exposes enabled state, agents, health and metrics', async () => {
    const orchestrator = buildOrchestrator();
    const status = orchestrator.getStatus();
    expect(status.agents).toBeInstanceOf(Array);
    expect(status.agents.length).toBeGreaterThanOrEqual(7);
    expect(status.agents.find(a => a.id === 'knowledge').health).toBeDefined();
    expect(status.metrics).toBeDefined();
    expect(status.memory.inMemory).toBe(true);
  });
});
