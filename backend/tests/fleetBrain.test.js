import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const prisma = {
  vehicle: { count: vi.fn(), findMany: vi.fn() },
  alert: { count: vi.fn(), findMany: vi.fn() },
  tripLog: { count: vi.fn(), findMany: vi.fn() },
  fuelLog: { count: vi.fn(), findMany: vi.fn() },
  maintenanceRecord: { count: vi.fn(), findMany: vi.fn() },
  aiReceptionistCall: { count: vi.fn(), findMany: vi.fn() },
  aiReceptionistAppointment: { count: vi.fn() },
  aiReceptionistSupportTicket: { count: vi.fn() },
  receptionistCustomer: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  fleetBrainInsight: { create: vi.fn(), findMany: vi.fn() },
  fleetBrainLearning: { create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  fleetBrainWorkflowRun: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  fleetBrainMemoryItem: { upsert: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
};

vi.mock('../src/utils/prisma.js', () => ({ default: prisma }));
vi.mock('../src/services/receptionistTenantResolver.service.js', () => ({
  isPersistenceAvailable: () => true,
}));
vi.mock('../src/services/aiAnalytics.js', () => ({
  getOverallAIUsageStats: vi.fn().mockResolvedValue({ totalRequests: 42, requests: 42 }),
  getAIPerformanceMetrics: vi.fn().mockResolvedValue({ averageResponseTime: 900, successRate: 0.98 }),
  trackAIUsage: vi.fn().mockResolvedValue(),
  trackAIResponseTime: vi.fn().mockResolvedValue(),
  trackAIError: vi.fn().mockResolvedValue(),
  getAIErrorStats: vi.fn().mockResolvedValue(),
  getAIAnalyticsDashboard: vi.fn().mockResolvedValue({}),
  cleanupOldAnalytics: vi.fn().mockResolvedValue(),
}));
vi.mock('../src/services/receptionistOrchestrator.service.js', () => ({
  executeAppointmentCreation: vi.fn().mockResolvedValue({ success: true, actionResult: { type: 'appointment', id: 'appt-1' }, reply: 'mock' }),
  executeSupportTicketCreation: vi.fn().mockResolvedValue({ success: true, actionResult: { type: 'support_ticket', id: 'ticket-1' }, reply: 'mock' }),
  lookupCustomerByPhone: vi.fn().mockResolvedValue(null),
  lookupCustomerByEmail: vi.fn().mockResolvedValue(null),
  lookupCustomerById: vi.fn().mockResolvedValue(null),
  createCallRecord: vi.fn().mockResolvedValue({ id: 'call-1' }),
  updateCallRecordAtEnd: vi.fn().mockResolvedValue(),
  updateCRMAfterCall: vi.fn().mockResolvedValue(),
  generateAISummary: vi.fn().mockResolvedValue('mock summary'),
  processReceptionistTurn: vi.fn().mockResolvedValue({ reply: 'mock' }),
  handleAppointmentIntent: vi.fn().mockResolvedValue(),
  handleSupportIntent: vi.fn().mockResolvedValue(),
  handleConfirmation: vi.fn().mockResolvedValue(),
  cleanupOrchestrator: vi.fn(),
}));

const { buildPlan, getRecentPlans } = await import('../src/fleetBrain/planner.service.js');
const { listSkills, skillForIntent, getSkillCount, registerSkill, getSkill } = await import('../src/fleetBrain/aiSkills.service.js');
const {
  buildConversationContext,
  buildCrmContext,
  buildFleetContext,
  buildSalesContext,
  buildSupportContext,
  summarizeContext,
} = await import('../src/fleetBrain/contextEngine.service.js');
const {
  remember,
  recall,
  recallAll,
  forget,
  getMemoryStats,
  memoryKey,
  MEMORY_SCOPES,
} = await import('../src/fleetBrain/memoryEngine.service.js');
const { classifyFleetQuery, answerFleetQuery, getFleetKpis } = await import('../src/fleetBrain/fleetIntelligence.service.js');
const { decide, executeTool, getRecentDecisions, getToolCapabilities } = await import('../src/fleetBrain/decisionEngine.service.js');
const { runWorkflow, getWorkflowRuns, WORKFLOW_STATUS } = await import('../src/fleetBrain/workflowEngine.service.js');
const { generateBusinessInsights, INSIGHT_TYPES } = await import('../src/fleetBrain/businessIntelligence.service.js');
const {
  learnFromCall,
  getRecommendations,
  applyRecommendation,
  LEARNING_TYPES,
} = await import('../src/fleetBrain/selfOptimization.service.js');
const { getFleetBrain } = await import('../src/fleetBrain/fleetBrain.service.js');

const USER_ID = 'fb-test-user';

function resetPrismaMocks() {
  for (const model of Object.values(prisma)) {
    for (const fn of Object.values(model)) {
      if (vi.isMockFunction(fn)) fn.mockReset();
    }
  }
  prisma.vehicle.count.mockResolvedValue(5);
  prisma.vehicle.findMany.mockResolvedValue([
    { id: 'v1', name: 'Truck A', plateNumber: 'ABC-123', status: 'ACTIVE' },
    { id: 'v2', name: 'Truck B', plateNumber: 'DEF-456', status: 'MAINTENANCE' },
  ]);
  prisma.alert.count.mockResolvedValue(3);
  prisma.alert.findMany.mockResolvedValue([
    { id: 'a1', alertType: 'SPEEDING', message: 'Speed exceeded', severity: 'HIGH', createdAt: new Date(), vehicle: { id: 'v1', name: 'Truck A', plateNumber: 'ABC-123' } },
  ]);
  prisma.tripLog.count.mockResolvedValue(7);
  prisma.fuelLog.findMany.mockResolvedValue([
    { liters: 100, cost: 150 },
    { liters: 50, cost: 80 },
  ]);
  prisma.maintenanceRecord.count.mockResolvedValue(2);
  prisma.maintenanceRecord.findMany.mockResolvedValue([
    { vehicleId: 'v2', type: 'OIL', status: 'PENDING', scheduledDate: new Date(), odometer: 1000 },
  ]);
  prisma.aiReceptionistCall.findMany.mockResolvedValue([
    { id: 'c1', callStatus: 'COMPLETED', sentiment: 'positive', callStartedAt: new Date() },
    { id: 'c2', callStatus: 'COMPLETED', sentiment: 'negative', callStartedAt: new Date() },
    { id: 'c3', callStatus: 'FAILED', sentiment: null, callStartedAt: new Date() },
  ]);
  prisma.aiReceptionistAppointment.count.mockResolvedValue(1);
  prisma.aiReceptionistSupportTicket.count.mockResolvedValue(2);
  prisma.receptionistCustomer.count.mockResolvedValue(1);
  prisma.receptionistCustomer.findFirst.mockResolvedValue(null);
  prisma.fleetBrainInsight.create.mockResolvedValue({ id: 'i1' });
  prisma.fleetBrainInsight.findMany.mockResolvedValue([]);
  prisma.fleetBrainLearning.create.mockResolvedValue({ id: 'l1' });
  prisma.fleetBrainLearning.findMany.mockResolvedValue([]);
  prisma.fleetBrainLearning.update.mockResolvedValue({ id: 'l1', applied: true });
  prisma.fleetBrainWorkflowRun.create.mockResolvedValue({ id: 'wf1' });
  prisma.fleetBrainWorkflowRun.findMany.mockResolvedValue([]);
  prisma.fleetBrainWorkflowRun.findFirst.mockResolvedValue(null);
  prisma.fleetBrainMemoryItem.findUnique.mockResolvedValue(null);
  prisma.fleetBrainMemoryItem.findMany.mockResolvedValue([]);
  prisma.fleetBrainMemoryItem.upsert.mockResolvedValue({ id: 'm1' });
}

beforeEach(() => {
  resetPrismaMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Fleet Brain — AI Skills registry', () => {
  it('registers 8 production skills with intents, tools and planner hints', () => {
    const skills = listSkills();
    expect(skills.length).toBe(8);
    const ids = skills.map(s => s.id);
    expect(ids).toEqual(expect.arrayContaining([
      'fleet-assistant', 'receptionist', 'sales', 'support',
      'dispatcher', 'executive-assistant', 'marketing', 'crm',
    ]));
    for (const skill of skills) {
      expect(Array.isArray(skill.intents)).toBe(true);
      expect(Array.isArray(skill.tools)).toBe(true);
      expect(skill.plannerHints).toBeDefined();
    }
  });

  it('resolves the receptionist skill for receptionist intents', () => {
    const skill = skillForIntent('SCHEDULE_MEETING');
    expect(skill).toBeDefined();
    expect(skill.id).toBe('receptionist');
  });

  it('resolves the sales skill for objection handling', () => {
    const skill = skillForIntent('OBJECTION_HANDLING');
    expect(skill?.id).toBe('sales');
  });

  it('resolves the receptionist skill for call flow intents', () => {
    expect(skillForIntent('SALES_INTEREST')?.id).toBe('receptionist');
    expect(skillForIntent('SCHEDULE_MEETING')?.id).toBe('receptionist');
    expect(skillForIntent('GREETING')?.id).toBe('receptionist');
  });

  it('counts and looks up skills', () => {
    expect(getSkillCount()).toBe(8);
    expect(getSkill('support')?.id).toBe('support');
    expect(getSkill('does-not-exist')).toBeNull();
  });

  it('rejects registering an invalid skill and accepts a valid one', () => {
    expect(registerSkill({})).toBe(false);
    registerSkill({ id: 'custom', name: 'Custom', intents: ['X'], tools: [], plannerHints: {} });
    expect(getSkill('custom')).toBeDefined();
    expect(getSkillCount()).toBe(9);
  });
});

describe('Fleet Brain — Planner', () => {
  it('builds a schedule-meeting plan with booking tools and next action', () => {
    const plan = buildPlan({
      intent: 'SCHEDULE_MEETING',
      message: 'I want to book a demo',
      customer: { name: 'Ann', email: 'ann@acme.com' },
    });
    expect(plan.intent).toBe('SCHEDULE_MEETING');
    expect(plan.skill).toBe('receptionist');
    expect(plan.requiredTools).toEqual(expect.arrayContaining(['create_appointment', 'lookup_crm']));
    expect(plan.requiredTools).not.toEqual(expect.arrayContaining(['create_ticket', 'transfer_to_human']));
    expect(plan.risk).toBe('MEDIUM');
    expect(plan.nextAction).toContain('Propose a meeting slot');
  });

  it('flags missing information for lead qualification', () => {
    const plan = buildPlan({ intent: 'LEAD_QUALIFICATION', message: '', customer: {} });
    expect(plan.missingInformation).toEqual(expect.arrayContaining(['fleet size', 'industry']));
    expect(plan.nextAction).toContain('Ask the caller for');
  });

  it('resolves required knowledge for pricing questions', () => {
    const plan = buildPlan({ intent: 'PRICING_QUESTION', message: 'How much does it cost?' });
    expect(plan.requiredKnowledge).toEqual(expect.arrayContaining(['pricing']));
  });

  it('routes fleet queries through the fleet skill', () => {
    const plan = buildPlan({ intent: 'FLEET_QUERY', message: 'Show my active vehicles' });
    expect(plan.requiredTools).toContain('query_fleet');
  });

  it('tracks recent plans with intent filtering', () => {
    buildPlan({ intent: 'GREETING' });
    buildPlan({ intent: 'FLEET_QUERY' });
    const fleetPlans = getRecentPlans({ intent: 'FLEET_QUERY', limit: 10 });
    expect(fleetPlans.length).toBeGreaterThanOrEqual(1);
    expect(fleetPlans.every(p => p.intent === 'FLEET_QUERY')).toBe(true);
  });
});

describe('Fleet Brain — Context engine', () => {
  it('builds conversation context from transcript turns', () => {
    const ctx = buildConversationContext({
      transcriptEntries: [
        { role: 'caller', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
        { role: 'caller', content: 'I need support' },
      ],
    });
    expect(ctx.turnCount).toBe(3);
    expect(ctx.lastMessage).toContain('support');
  });
  it('builds CRM context from customer data', () => {
    const ctx = buildCrmContext({ customer: { name: 'Ann', companyName: 'Acme', fleetSize: 12 } });
    expect(ctx.name).toBe('Ann');
    expect(ctx.companyName).toBe('Acme');
    expect(ctx.fleetSize).toBe(12);
  });

  it('builds fleet context with alerts and maintenance', () => {
    const ctx = buildFleetContext({ fleet: { vehicleCount: 5 }, alerts: [1, 2], maintenance: [1] });
    expect(ctx.vehicleCount).toBe(5);
    expect(ctx.openAlerts).toBe(2);
    expect(ctx.alerts.length).toBe(2);
    expect(ctx.maintenanceDue).toBe(1);
  });

  it('builds sales context with qualification state', () => {
    const ctx = buildSalesContext({ leadScore: 70, qualified: true, stage: 'QUALIFIED' });
    expect(ctx.qualified).toBe(true);
    expect(ctx.stage).toBe('QUALIFIED');
  });

  it('summarizes a unified context into a compact object', () => {
    const summary = summarizeContext({
      conversation: { intent: 'SCHEDULE_MEETING', turnCount: 4 },
      crm: { name: 'Ann' },
      fleet: { vehicleCount: 5, openAlerts: 2 },
      sales: { leadScore: 70 },
    });
    expect(summary).toEqual(expect.objectContaining({
      intent: 'SCHEDULE_MEETING',
      turnCount: 4,
      customer: 'Ann',
      leadScore: 70,
      vehicleCount: 5,
      alertCount: 2,
    }));
  });
});

describe('Fleet Brain — Memory engine', () => {
  it('stores and recalls short-term memories', async () => {
    await remember({ userId: USER_ID, scope: MEMORY_SCOPES.SHORT_TERM, key: 'purpose', value: 'Demo booking' });
    const found = await recall({ userId: USER_ID, key: 'purpose' });
    expect(found.source).toBe('short_term');
    expect(found.value).toBe('Demo booking');
  });

  it('cascades recall across scopes', async () => {
    await remember({ userId: USER_ID, scope: MEMORY_SCOPES.CONVERSATION, key: 'summary', value: { text: 'x' } });
    const found = await recall({ userId: USER_ID, key: 'summary' });
    expect(found).not.toBeNull();
    expect(found.scope).toBe('CONVERSATION');
  });

  it('lists all memories per user and forgets them', async () => {
    await remember({ userId: USER_ID, scope: MEMORY_SCOPES.SHORT_TERM, key: 'k1', value: 1 });
    await remember({ userId: 'other-user', scope: MEMORY_SCOPES.SHORT_TERM, key: 'k1', value: 2 });
    const all = await recallAll({ userId: USER_ID });
    expect(all.some(m => m.key === 'k1' && m.userId === USER_ID)).toBe(true);
    expect(all.some(m => m.userId === 'other-user')).toBe(false);
    const removed = forget({ userId: USER_ID, scope: MEMORY_SCOPES.SHORT_TERM, key: 'k1' });
    expect(removed).toBeGreaterThanOrEqual(1);
  });

  it('persists long-term memories through prisma', async () => {
    await remember({ userId: USER_ID, scope: MEMORY_SCOPES.BUSINESS, key: 'goal', value: 'Q3 growth' });
    expect(prisma.fleetBrainMemoryItem.upsert).toHaveBeenCalled();
  });

  it('reports memory stats', async () => {
    await remember({ userId: USER_ID, scope: MEMORY_SCOPES.SHORT_TERM, key: 'stats-1', value: 1 });
    const stats = getMemoryStats();
    expect(typeof stats.shortTermEntries).toBe('number');
    expect(typeof stats.expiredEntries).toBe('number');
  });

  it('builds stable memory keys per user and scope', () => {
    expect(memoryKey('u1', 'CUSTOMER', 'name')).toBe('u1:CUSTOMER:name');
  });
});

describe('Fleet Brain — Fleet intelligence', () => {
  it('classifies fleet queries by type', () => {
    expect(classifyFleetQuery('Which trucks require maintenance?')).toBe('MAINTENANCE_DUE');
    expect(classifyFleetQuery('Which drivers were speeding today?')).toBe('SPEEDING_DRIVERS');
    expect(classifyFleetQuery('Show me active vehicles now')).toBe('ACTIVE_VEHICLES');
    expect(classifyFleetQuery('Any open alerts?')).toBe('ALERTS');
    expect(classifyFleetQuery('How much fuel was used?')).toBe('FUEL_USAGE');
    expect(classifyFleetQuery('what is the weather like')).toBe('UNKNOWN');
  });

  it('answers maintenance-due queries from fleet data', async () => {
    const answer = await answerFleetQuery({ userId: USER_ID, query: 'Which vehicles need maintenance?' });
    expect(answer.answerable).toBe(true);
    expect(answer.queryType).toBe('MAINTENANCE_DUE');
    expect(answer.result.vehicles[0].name).toBe('Truck B');
  });

  it('answers speeding-driver queries', async () => {
    const answer = await answerFleetQuery({ userId: USER_ID, query: 'Who was speeding?' });
    expect(answer.answerable).toBe(true);
    expect(answer.result.count).toBe(1);
  });

  it('rejects unrecognized fleet queries', async () => {
    const answer = await answerFleetQuery({ userId: USER_ID, query: 'tell me a joke' });
    expect(answer.answerable).toBe(false);
    expect(answer.queryType).toBe('UNKNOWN');
  });

  it('aggregates fleet KPIs over 30 days', async () => {
    const kpis = await getFleetKpis(USER_ID, { days: 30 });
    expect(kpis.vehicleCount).toBe(5);
    expect(kpis.openAlerts).toBe(3);
    expect(kpis.totalFuelLiters).toBe(150);
    expect(kpis.totalFuelCost).toBe(230);
    expect(kpis.maintenanceDue).toBe(2);
  });
});

describe('Fleet Brain — Decision engine', () => {
  it('records decisions with tools from the plan', () => {
    const record = decide({
      userId: USER_ID,
      plan: { intent: 'SCHEDULE_MEETING', requiredTools: ['create_appointment', 'lookup_crm'] },
      message: 'book it',
    });
    expect(record.intent).toBe('SCHEDULE_MEETING');
    expect(record.decisions.map(d => d.tool)).toEqual(['create_appointment', 'lookup_crm']);
  });

  it('returns recent decisions filtered by user', () => {
    decide({ userId: USER_ID, plan: { intent: 'FLEET_QUERY', requiredTools: ['query_fleet'] } });
    const recent = getRecentDecisions(USER_ID, { limit: 5 });
    expect(recent.length).toBeGreaterThanOrEqual(1);
    expect(recent[0].userId).toBe(USER_ID);
  });

  it('exposes tool capabilities', () => {
    const caps = getToolCapabilities();
    expect(caps.create_appointment).toBeDefined();
    expect(caps.transfer_to_human).toBeDefined();
    expect(caps.query_fleet).toBeDefined();
  });

  it('rejects unknown tools gracefully', async () => {
    const result = await executeTool({ userId: USER_ID, tool: 'hack_the_planet', args: {} });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unknown_tool');
  });

  it('executes knowledge search via the tool executor', async () => {
    const result = await executeTool({ userId: USER_ID, tool: 'search_knowledge', args: { query: 'pricing' } });
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.result.results)).toBe(true);
  });
});

describe('Fleet Brain — Workflow engine', () => {
  it('runs the full pipeline with all 9 stages in order', async () => {
    const record = await runWorkflow({
      userId: USER_ID,
      companyId: 'company-1',
      callId: 'call-1',
      trigger: 'turn',
      message: 'Which vehicles are active right now?',
      context: { conversation: { intent: 'FLEET_QUERY', lastMessage: 'Which vehicles are active right now?' } },
    });
    expect(record.status).toBe(WORKFLOW_STATUS.COMPLETED);
    expect(record.workflowType).toBe('FLEET_QUERY');
    const stepNames = record.steps.map(s => s.step);
    expect(stepNames[0]).toBe('trigger');
    expect(stepNames[1]).toBe('planner');
    expect(stepNames[stepNames.length - 1]).toBe('complete');
    expect(stepNames.filter(s => s === 'tools').length).toBe(2);
    const pipeline = ['trigger', 'planner', 'tools', 'validation', 'database', 'crm', 'analytics', 'notification', 'complete'];
    for (const stage of pipeline) {
      expect(stepNames).toContain(stage);
    }
    expect(stepNames.indexOf('validation')).toBeGreaterThan(stepNames.indexOf('tools'));
    expect(stepNames.indexOf('complete')).toBeGreaterThan(stepNames.indexOf('notification'));
    expect(prisma.fleetBrainWorkflowRun.create).toHaveBeenCalled();
  });

  it('persists workflow runs for listing', async () => {
    await runWorkflow({ userId: USER_ID, message: 'hello', context: { conversation: { intent: 'GREETING' } } });
    const runs = await getWorkflowRuns(USER_ID, { limit: 10 });
    expect(Array.isArray(runs)).toBe(true);
  });
});

describe('Fleet Brain — Business intelligence', () => {
  it('generates all 7 insight types from business data', async () => {
    const result = await generateBusinessInsights(USER_ID, { days: 30 });
    expect(result.insights.length).toBe(7);
    const types = result.insights.map(i => i.type);
    expect(types).toEqual(expect.arrayContaining([
      INSIGHT_TYPES.EXECUTIVE,
      INSIGHT_TYPES.FLEET,
      INSIGHT_TYPES.SALES,
      INSIGHT_TYPES.SUPPORT,
      INSIGHT_TYPES.AI_PERFORMANCE,
      INSIGHT_TYPES.REVENUE_FORECAST,
      INSIGHT_TYPES.LEAD_FORECAST,
    ]));
    expect(prisma.fleetBrainInsight.create).toHaveBeenCalledTimes(7);
  });

  it('persists each generated insight', async () => {
    const result = await generateBusinessInsights(USER_ID, { days: 30 });
    const executive = result.insights.find(i => i.type === INSIGHT_TYPES.EXECUTIVE);
    expect(executive.data.calls).toBe(3);
    expect(executive.data.appointments).toBe(1);
  });
});

describe('Fleet Brain — Self-optimization', () => {
  it('learns sales objections, fleet issues and knowledge gaps from transcripts', async () => {
    const result = await learnFromCall({
      userId: USER_ID,
      callId: 'call-1',
      transcriptEntries: [
        { role: 'caller', content: 'It is too expensive, we are over budget' },
        { role: 'assistant', content: 'I can check' },
        { role: 'caller', content: 'Also our trucks keep breaking down' },
      ],
      collectedData: { intent: 'PRICING_QUESTION', sentiment: 'negative' },
    });
    const types = result.learnings.map(l => l.type);
    expect(types).toContain(LEARNING_TYPES.SALES_OBJECTION);
    expect(types).toContain(LEARNING_TYPES.FLEET_ISSUE);
    expect(types).toContain(LEARNING_TYPES.KNOWLEDGE_GAP);
    expect(types).toContain(LEARNING_TYPES.CONVERSATION);
  });

  it('produces recommendations for detected objections', async () => {
    const result = await learnFromCall({
      userId: USER_ID,
      transcriptEntries: [{ role: 'caller', content: 'This is too expensive and I have no time' }],
      collectedData: {},
    });
    expect(result.recommendations.some(r => r.action === 'train_sales')).toBe(true);
  });

  it('recommends latency tuning when response latency is high', async () => {
    const result = await learnFromCall({
      userId: USER_ID,
      transcriptEntries: [],
      collectedData: {},
      analytics: { conversationScore: 8, salesScore: 5, supportScore: 3, avgResponseLatencyMs: 7200, interruptions: 1 },
    });
    expect(result.recommendations.some(r => r.action === 'optimize_latency')).toBe(true);
    expect(result.learnings.some(l => l.type === LEARNING_TYPES.KPI)).toBe(true);
  });

  it('never auto-applies recommendations without a human action', async () => {
    const result = await learnFromCall({
      userId: USER_ID,
      transcriptEntries: [{ role: 'caller', content: 'we are fine, not interested' }],
      collectedData: {},
    });
    for (const l of result.learnings) {
      expect(l.applied).toBeUndefined();
    }
  });

  it('persists learnings and applies a recommendation explicitly', async () => {
    const result = await learnFromCall({
      userId: USER_ID,
      transcriptEntries: [{ role: 'caller', content: 'too expensive' }],
      collectedData: {},
    });
    expect(prisma.fleetBrainLearning.create).toHaveBeenCalled();
    const recommendations = await getRecommendations(USER_ID, { limit: 5 });
    expect(Array.isArray(recommendations)).toBe(true);
    const applied = await applyRecommendation(USER_ID, 'l1');
    expect(applied.applied).toBe(true);
    expect(prisma.fleetBrainLearning.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'l1' }, data: { applied: true } }),
    );
  });
});

describe('Fleet Brain — Service facade', () => {
  it('exposes a singleton with all modules loaded', async () => {
    const brain = getFleetBrain();
    expect(getFleetBrain()).toBe(brain);
    await brain.loadModules();
    expect(Object.keys(brain.modules).sort()).toEqual([
      'businessIntelligence', 'contextEngine', 'decisionEngine', 'fleetIntelligence',
      'memoryEngine', 'planner', 'selfOptimization', 'skills', 'workflowEngine',
    ]);
  });

  it('returns a dashboard snapshot across all modules', async () => {
    const brain = getFleetBrain();
    await brain.loadModules();
    await brain.buildPlan({ userId: USER_ID, message: 'book a demo', context: { conversation: { intent: 'SCHEDULE_MEETING' } } });
    const dashboard = await brain.getDashboard(USER_ID, { limit: 5 });
    expect(dashboard.enabled).toBe(true);
    expect(dashboard.skills.length).toBeGreaterThanOrEqual(8);
    expect(typeof dashboard.stats.plansBuilt).toBe('number');
    expect(dashboard.stats.plansBuilt).toBeGreaterThanOrEqual(1);
    expect(dashboard.memory.inMemory).toBeGreaterThanOrEqual(0);
    expect(dashboard.health).toBeDefined();
  });

  it('records lifecycle counters across operations', async () => {
    const brain = getFleetBrain();
    await brain.loadModules();
    await brain.remember(USER_ID, { scope: MEMORY_SCOPES.SHORT_TERM, key: 'facade-1', value: 1 });
    await brain.buildPlan({ userId: USER_ID, message: 'hello', context: null });
    await brain.answerFleetQuery(USER_ID, 'show active vehicles');
    expect(brain.stats.memoriesSaved).toBeGreaterThanOrEqual(1);
    expect(brain.stats.plansBuilt).toBeGreaterThanOrEqual(1);
  });
});
