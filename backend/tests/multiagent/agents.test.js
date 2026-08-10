import { describe, it, expect, vi } from 'vitest';
import { CrmAgent } from '../../src/multiagent/agents/crm.agent.js';
import { KnowledgeAgent } from '../../src/multiagent/agents/knowledge.agent.js';
import { SchedulingAgent } from '../../src/multiagent/agents/scheduling.agent.js';
import { SupportAgent } from '../../src/multiagent/agents/support.agent.js';
import { SalesAgent } from '../../src/multiagent/agents/sales.agent.js';
import { FleetExpertAgent } from '../../src/multiagent/agents/fleetExpert.agent.js';
import { ReceptionistAgent } from '../../src/multiagent/agents/receptionist.agent.js';
import { buildTask, TASK_STATUS, INTENTS } from '../../src/multiagent/protocol.js';
import { AgentMemory } from '../../src/multiagent/shared/agentMemory.js';
import { AgentHealthMonitor } from '../../src/multiagent/health.js';
import { parseDateTime, resolveSchedulingText, assembleSchedulingPayload, formatSchedulingSummary } from '../../src/services/receptionistScheduling.service.js';
import { classifyIntent } from '../../src/multiagent/intents.js';

const makeTask = (agentId, type, payload = {}, context = {}) => buildTask({
  runId: 'R-1',
  agentId,
  taskType: type,
  payload,
  context: { userId: 'u1', ...context },
  callSid: 'CA1',
});

function makeEnv(health = null) {
  return { memory: new AgentMemory({ callSid: 'CA1', userId: 'u1' }), health: health || new AgentHealthMonitor() };
}

describe('intents classifier', () => {
  it('classifies scheduling requests', () => {
    expect(classifyIntent("I'd like to book a demo tomorrow").intent).toBe(INTENTS.SCHEDULE_MEETING);
  });

  it('classifies pricing questions', () => {
    expect(classifyIntent('how much does fleet tracking cost?').intent).toBe(INTENTS.PRICING_QUESTION);
  });

  it('classifies support requests', () => {
    expect(classifyIntent('I have a problem with my account').intent).toBe(INTENTS.SUPPORT_REQUEST);
  });

  it('classifies technical issues', () => {
    expect(classifyIntent('my OBD device will not connect').intent).toBe(INTENTS.TECHNICAL_ISSUE);
  });

  it('classifies emergencies with top priority', () => {
    expect(classifyIntent('this is an emergency, my vehicle broke down').intent).toBe(INTENTS.EMERGENCY);
  });

  it('classifies greetings', () => {
    expect(classifyIntent('hello').intent).toBe(INTENTS.GREETING);
  });

  it('falls back to UNKNOWN for empty or noise', () => {
    expect(classifyIntent('').intent).toBe(INTENTS.UNKNOWN);
    expect(classifyIntent('asdfqwer').intent).toBe(INTENTS.UNKNOWN);
  });
});

describe('crm agent', () => {
  it('looks up a customer by phone and hydrates memory', async () => {
    const env = makeEnv();
    const customer = { id: 'c1', name: 'Alice', companyName: 'ACME', fleetSize: 12, leadScore: 60, salesStage: 'DEMO' };
    const agent = new CrmAgent({ ...env, deps: {
      getCustomers: vi.fn().mockResolvedValue({ customers: [customer] }),
      getCustomerById: vi.fn(),
      updateCustomerStatus: vi.fn(),
      addCustomerNote: vi.fn(),
      recalculateLeadScore: vi.fn(),
    } });
    const outcome = await agent.execute(makeTask('crm', 'lookup', { phone: '+15551234567' }), env);
    expect(outcome.status).toBe(TASK_STATUS.SUCCESS);
    expect(outcome.result.found).toBe(true);
    expect(env.memory.get('crm', 'customerId')).toBe('c1');
    expect(env.memory.get('crm', 'isReturning')).toBe(true);
    expect(env.memory.get('identity', 'company')).toBe('ACME');
  });

  it('returns partial when no identity is provided', async () => {
    const agent = new CrmAgent(makeEnv());
    const outcome = await agent.execute(makeTask('crm', 'lookup', {}), makeEnv());
    expect(outcome.status).toBe(TASK_STATUS.PARTIAL);
  });

  it('adds a note for an existing customer', async () => {
    const agent = new CrmAgent({ deps: {
      getCustomers: vi.fn(), getCustomerById: vi.fn(),
      updateCustomerStatus: vi.fn(),
      addCustomerNote: vi.fn().mockResolvedValue({ id: 'n1' }),
      recalculateLeadScore: vi.fn(),
    } });
    const outcome = await agent.execute(makeTask('crm', 'addNote', { customerId: 'c1', content: 'interests in demo' }), makeEnv());
    expect(outcome.status).toBe(TASK_STATUS.SUCCESS);
    expect(outcome.result.noteId).toBe('n1');
  });

  it('rejects unsupported task types', async () => {
    const agent = new CrmAgent(makeEnv());
    const outcome = await agent.execute(makeTask('crm', 'hack'), makeEnv());
    expect(outcome.status).toBe(TASK_STATUS.FAILED);
  });

  it('propagates execution errors as FAILED responses', async () => {
    const agent = new CrmAgent({ deps: {
      getCustomers: vi.fn().mockRejectedValue(new Error('db down')),
      getCustomerById: vi.fn(), updateCustomerStatus: vi.fn(), addCustomerNote: vi.fn(), recalculateLeadScore: vi.fn(),
    } });
    const outcome = await agent.execute(makeTask('crm', 'lookup', { phone: 'x' }), makeEnv());
    expect(outcome.status).toBe(TASK_STATUS.FAILED);
    expect(outcome.error.message).toBe('db down');
  });
});

describe('knowledge agent', () => {
  it('answers from the knowledge base', async () => {
    const env = makeEnv();
    const agent = new KnowledgeAgent({ ...env, deps: {
      queryKnowledgeBase: vi.fn().mockResolvedValue('Tracking starts at $X'),
      getKnowledgeTopics: vi.fn(),
      retrieve: vi.fn(),
    } });
    const outcome = await agent.execute(makeTask('knowledge', 'retrieve', { query: 'tracking pricing' }), env);
    expect(outcome.status).toBe(TASK_STATUS.SUCCESS);
    expect(outcome.result.answer).toContain('$X');
    expect(outcome.result.source).toBe('knowledge_base');
    expect(env.memory.get('knowledge', 'answeredTopics')).toHaveLength(1);
  });

  it('caches answers in shared memory on repeat queries', async () => {
    const env = makeEnv();
    const kb = vi.fn().mockResolvedValue('KB answer');
    const agent = new KnowledgeAgent({ ...env, deps: { queryKnowledgeBase: kb, getKnowledgeTopics: vi.fn(), retrieve: vi.fn() } });
    const first = await agent.execute(makeTask('knowledge', 'retrieve', { query: 'same question' }), env);
    const second = await agent.execute(makeTask('knowledge', 'retrieve', { query: 'same question' }), env);
    expect(kb).toHaveBeenCalledTimes(1);
    expect(second.result.answer).toBe(first.result.answer);
    expect(second.cost.cacheHits).toBe(1);
  });

  it('falls back to RAG when the KB has no answer', async () => {
    const env = makeEnv();
    const agent = new KnowledgeAgent({ ...env, deps: {
      queryKnowledgeBase: vi.fn().mockResolvedValue(null),
      getKnowledgeTopics: vi.fn(),
      retrieve: vi.fn().mockResolvedValue({
        hasAnswer: true, confidence: 0.8,
        passages: [{ articleId: 'a1', chunkText: 'RAG passage', score: 0.9 }],
      }),
    } });
    const outcome = await agent.execute(makeTask('knowledge', 'retrieve', { query: 'fleet reports' }), env);
    expect(outcome.result.source).toBe('rag');
    expect(outcome.result.answer).toContain('RAG passage');
    expect(outcome.artifacts.sources).toContain('a1');
  });

  it('returns partial for empty queries', async () => {
    const agent = new KnowledgeAgent(makeEnv());
    const outcome = await agent.execute(makeTask('knowledge', 'retrieve', { query: '   ' }), makeEnv());
    expect(outcome.status).toBe(TASK_STATUS.PARTIAL);
  });

  it('survives a failing RAG engine', async () => {
    const env = makeEnv();
    const agent = new KnowledgeAgent({ ...env, deps: {
      queryKnowledgeBase: vi.fn().mockResolvedValue(null),
      getKnowledgeTopics: vi.fn(),
      retrieve: vi.fn().mockRejectedValue(new Error('embedding down')),
    } });
    const outcome = await agent.execute(makeTask('knowledge', 'retrieve', { query: 'whatever' }), env);
    expect(outcome.status).toBe(TASK_STATUS.SUCCESS);
    expect(outcome.result.answer).toBeNull();
  });
});

describe('scheduling agent', () => {
  const schedulingDeps = {
    parseDateTime,
    resolveSchedulingText,
    assembleSchedulingPayload,
    formatSchedulingSummary,
    createAppointment: vi.fn().mockResolvedValue({ id: 'appt-1', scheduledDate: new Date().toISOString() }),
  };

  it('parses natural language dates with confidence', async () => {
    const agent = new SchedulingAgent({ deps: schedulingDeps });
    const outcome = await agent.execute(makeTask('scheduling', 'parse', { text: 'tomorrow at 10am' }), makeEnv());
    expect(outcome.status).toBe(TASK_STATUS.SUCCESS);
    expect(outcome.result.preferredTime).toBe('10:00');
    expect(outcome.result.preferredDate).toBeDefined();
    expect(outcome.result.confidence).toBeGreaterThan(0.8);
  });

  it('requires confirmation before booking', async () => {
    const agent = new SchedulingAgent({ deps: schedulingDeps });
    const outcome = await agent.execute(makeTask('scheduling', 'book', {
      text: 'tomorrow at 10am', callerName: 'Bob',
    }), makeEnv());
    expect(outcome.status).toBe(TASK_STATUS.PARTIAL);
    expect(outcome.result.reason).toBe('confirmation_required');
    expect(schedulingDeps.createAppointment).not.toHaveBeenCalled();
  });

  it('books an appointment when confirmed', async () => {
    const agent = new SchedulingAgent({ deps: schedulingDeps });
    const env = makeEnv();
    env.memory.set('scheduling', 'identity', 'name', 'Bob');
    const outcome = await agent.execute(makeTask('scheduling', 'book', {
      text: 'tomorrow at 10am', confirmed: true,
    }), env);
    expect(outcome.status).toBe(TASK_STATUS.SUCCESS);
    expect(outcome.result.booked).toBe(true);
    expect(schedulingDeps.createAppointment).toHaveBeenCalledTimes(1);
  });

  it('fails cleanly when persistence errors', async () => {
    const agent = new SchedulingAgent({ deps: {
      ...schedulingDeps,
      createAppointment: vi.fn().mockRejectedValue(new Error('db locked')),
    } });
    const outcome = await agent.execute(makeTask('scheduling', 'book', { text: 'tomorrow at 10am', confirmed: true }), makeEnv());
    expect(outcome.status).toBe(TASK_STATUS.FAILED);
  });
});

describe('support agent', () => {
  it('triages urgency by keywords', async () => {
    const agent = new SupportAgent(makeEnv());
    const outcome = await agent.execute(makeTask('support', 'triage', { text: 'EMERGENCY our tracking is down today' }), makeEnv());
    expect(outcome.result.urgency).toBe('CRITICAL');
    const mild = await agent.execute(makeTask('support', 'triage', { text: 'just a quick question about reports' }), makeEnv());
    expect(mild.result.urgency).toBe('LOW');
  });

  it('requires confirmation before creating a ticket', async () => {
    const createSupportTicket = vi.fn();
    const agent = new SupportAgent({ deps: { createSupportTicket } });
    const outcome = await agent.execute(makeTask('support', 'createTicket', { text: 'app crashes' }), makeEnv());
    expect(outcome.status).toBe(TASK_STATUS.PARTIAL);
    expect(createSupportTicket).not.toHaveBeenCalled();
  });

  it('creates a ticket when confirmed', async () => {
    const createSupportTicket = vi.fn().mockResolvedValue({ id: 't-1', urgency: 'HIGH' });
    const agent = new SupportAgent({ deps: { createSupportTicket } });
    const outcome = await agent.execute(makeTask('support', 'createTicket', {
      text: 'dashboard not loading', confirmed: true, callerName: 'Alice',
    }), makeEnv());
    expect(outcome.status).toBe(TASK_STATUS.SUCCESS);
    expect(outcome.result.ticket.id).toBe('t-1');
  });

  it('fails for empty descriptions', async () => {
    const agent = new SupportAgent({ deps: { createSupportTicket: vi.fn() } });
    const outcome = await agent.execute(makeTask('support', 'createTicket', { confirmed: true, text: '' }), makeEnv());
    expect(outcome.status).toBe(TASK_STATUS.FAILED);
  });
});

describe('sales agent', () => {
  it('qualifies leads from buying signals', async () => {
    const env = makeEnv();
    const agent = new SalesAgent(env);
    const outcome = await agent.execute(makeTask('sales', 'qualify', {
      text: "I'm interested in a demo and would like pricing for our 30 vehicles",
    }), env);
    expect(outcome.result.qualified).toBe(true);
    expect(outcome.result.signals).toContain('demo_request');
    expect(env.memory.get('lead', 'qualified')).toBe(true);
  });

  it('does not qualify weak signals', async () => {
    const agent = new SalesAgent(makeEnv());
    const outcome = await agent.execute(makeTask('sales', 'qualify', { text: 'who are you?' }), makeEnv());
    expect(outcome.result.qualified).toBe(false);
    expect(outcome.result.stage).toBe('LEAD');
  });

  it('composes pricing by fleet tier', async () => {
    const agent = new SalesAgent(makeEnv());
    const small = await agent.execute(makeTask('sales', 'composePricing', { fleetSize: 5 }), makeEnv());
    expect(small.result.tier).toBe('small');
    const enterprise = await agent.execute(makeTask('sales', 'composePricing', { fleetSize: 120 }), makeEnv());
    expect(enterprise.result.tier).toBe('enterprise');
    expect(enterprise.result.reply).toContain('enterprise');
  });

  it('proposes demo slots from candidates', async () => {
    const agent = new SalesAgent(makeEnv());
    const outcome = await agent.execute(makeTask('sales', 'proposeDemoSlots', {
      candidates: [{ time: '10:00' }, { time: '14:00' }, { time: '16:00' }],
    }), makeEnv());
    expect(outcome.result.slots.length).toBe(2);
    expect(outcome.result.reply).toMatch(/does 10 AM or 2 PM work better/);
  });

  it('returns empty slots without candidates', async () => {
    const agent = new SalesAgent(makeEnv());
    const outcome = await agent.execute(makeTask('sales', 'proposeDemoSlots', { candidates: [] }), makeEnv());
    expect(outcome.result.slots).toEqual([]);
  });
});

describe('fleet expert agent', () => {
  it('answers fleet topics from rules', async () => {
    const agent = new FleetExpertAgent(makeEnv());
    const outcome = await agent.execute(makeTask('fleetExpert', 'answerFleetQuestion', { query: 'how does GPS tracking work?' }), makeEnv());
    expect(outcome.status).toBe(TASK_STATUS.SUCCESS);
    expect(outcome.result.topic).toBe('tracking');
    expect(outcome.result.answer).toContain('GPS Tracking');
  });

  it('prefers knowledge answers for product questions', async () => {
    const agent = new FleetExpertAgent(makeEnv());
    const outcome = await agent.execute(makeTask('fleetExpert', 'answerFleetQuestion', {
      query: 'what is FleetNimble?',
      knowledgeAnswer: 'FleetNimble is a fleet telematics platform.',
      knowledgeConfidence: 0.9,
    }), makeEnv());
    expect(outcome.result.source).toBe('knowledge');
    expect(outcome.result.answer).toContain('telematics platform');
  });

  it('returns partial when nothing matches', async () => {
    const agent = new FleetExpertAgent(makeEnv());
    const outcome = await agent.execute(makeTask('fleetExpert', 'answerFleetQuestion', { query: 'zzzqqq' }), makeEnv());
    expect([TASK_STATUS.PARTIAL, TASK_STATUS.SUCCESS]).toContain(outcome.status);
  });
});

describe('receptionist agent', () => {
  it('classifies caller text', async () => {
    const agent = new ReceptionistAgent(makeEnv());
    const outcome = await agent.execute(makeTask('receptionist', 'classify', { text: 'book a demo' }), makeEnv());
    expect(outcome.result.intent).toBe(INTENTS.SCHEDULE_MEETING);
  });

  it('greets with after-hours awareness', async () => {
    const agent = new ReceptionistAgent(makeEnv());
    const outcome = await agent.execute(makeTask('receptionist', 'greeting', {
      greetingMessage: 'Hello! How can I help?',
      workingHours: { monday: { start: '09:00', end: '17:00' } },
    }), makeEnv());
    expect(outcome.result.reply).toBeDefined();
    expect(outcome.status).toBe(TASK_STATUS.SUCCESS);
  });

  it('composes a pricing reply from merged sales output', async () => {
    const agent = new ReceptionistAgent(makeEnv());
    const outcome = await agent.execute(makeTask('receptionist', 'composeReply', {
      intent: INTENTS.PRICING_QUESTION,
      merged: {
        agents: {},
        confidence: 0.5,
        sales: { result: { reply: 'Our plans start at $29 per vehicle.' }, confidence: 0.9 },
      },
    }), makeEnv());
    expect(outcome.result.reply).toContain('$29');
  });

  it('composes an emergency reply with escalation number', async () => {
    const agent = new ReceptionistAgent(makeEnv());
    const outcome = await agent.execute(makeTask('receptionist', 'composeReply', {
      intent: INTENTS.EMERGENCY,
      supportPhone: '+18005551234',
      merged: { agents: {}, confidence: 0.9 },
    }), makeEnv());
    expect(outcome.result.reply).toContain('+18005551234');
  });

  it('asks for clarification on ambiguous scheduling', async () => {
    const agent = new ReceptionistAgent(makeEnv());
    const outcome = await agent.execute(makeTask('receptionist', 'composeReply', {
      intent: INTENTS.SCHEDULE_MEETING,
      merged: {
        agents: {},
        confidence: 0.5,
        scheduling: { parsed: { requiresClarification: true, preferredDate: null, preferredTime: '10:00' } },
      },
    }), makeEnv());
    expect(outcome.result.reply).toContain('what date');
  });

  it('falls back gracefully for unknown intents', async () => {
    const agent = new ReceptionistAgent(makeEnv());
    const outcome = await agent.execute(makeTask('receptionist', 'composeReply', {
      intent: INTENTS.UNKNOWN,
      merged: { agents: {}, confidence: 0.1 },
    }), makeEnv());
    expect(outcome.result.reply).toContain('didn\'t catch that');
  });
});
