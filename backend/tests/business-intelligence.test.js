import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

let qa;
let businessProfileService;
let businessKnowledgeService;
let agentConfigService;
let toolRegistry;
let voiceService;
let planner;
let orchestrator;

beforeAll(async () => {
  qa = await import('../src/services/receptionistQA.service.js');
  businessProfileService = await import('../src/services/businessProfile.service.js');
  businessKnowledgeService = await import('../src/services/businessKnowledge.service.js');
  agentConfigService = await import('../src/services/agentConfig.service.js');
  toolRegistry = await import('../src/services/toolRegistry.service.js');
  voiceService = await import('../src/services/receptionistVoice.service.js');
  planner = await import('../src/fleetBrain/receptionistPlanner.service.js');
  orchestrator = await import('../src/services/receptionistOrchestrator.service.js');
}, 30000);

const mockPrisma = {
  businessProfile: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn() },
  businessKnowledgeDocument: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  businessKnowledgeChunk: { createMany: vi.fn(), deleteMany: vi.fn() },
  agentConfig: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  aiInteractionLog: { create: vi.fn() },
  receptionistCustomer: { create: vi.fn() },
  followUpReminder: { create: vi.fn() },
  $transaction: vi.fn((callback) => callback(mockPrisma)),
};

vi.mock('../src/utils/prisma.js', () => ({ default: mockPrisma }));

vi.mock('../src/config/index.js', () => ({
  config: {
    env: 'test',
    businessName: 'FleetNimble',
    ai: { sessionTimeoutMinutes: 30 },
    realtime: { businessToolsEnabled: true, model: 'gpt-4o-realtime-preview', voice: 'alloy', maxCallSeconds: 600, silenceTimeoutSeconds: 30, mediaStreamEnabled: true, configured: true },
    openai: { apiKey: 'test-key', voice: 'alloy', model: 'gpt-4o-realtime-preview' },
    twilio: { accountSid: 'test', authToken: 'test', phoneNumber: '+1234567890', configured: true, phoneConfigured: true, validateSignature: false },
    publicUrl: 'http://localhost:5000',
    aiReceptionist: { enabled: true, voiceAgentMode: 'hybrid', mediaStreamEnabled: true },
    knowledge: { providerOrder: ['json'] },
    fleetBrain: { enabled: true },
    jwt: { secret: 'test', refreshSecret: 'test' },
    logLevel: 'error',
  },
}));

vi.mock('../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const TENANT_PROFILE = {
  id: 'profile-1',
  userId: 'tenant-1',
  companyId: 'company-1',
  businessName: 'Acme Logistics',
  description: 'Acme Logistics is a regional delivery company operating 40 vehicles.',
  products: ['GPS Tracking', 'Delivery Management'],
  services: ['Same-day delivery', 'Warehousing'],
  pricing: { Base: '$99/month' },
  businessHours: { Monday: '8:00 - 18:00' },
  locations: ['Austin, TX'],
  faqs: [],
  policies: {},
  bookingRules: {},
  leadQualificationRules: {},
  status: 'ACTIVE',
};

const TENANT_DOCS = [
  {
    id: 'doc-1',
    userId: 'tenant-1',
    companyId: 'company-1',
    title: 'Acme Delivery Tracking',
    category: 'Services',
    content: 'Acme Logistics offers same-day delivery across Austin. Customers can track their packages live with GPS.',
    keywords: ['tracking', 'delivery', 'gps'],
    summary: 'Acme Logistics offers same-day delivery across Austin.',
    status: 'APPROVED',
  },
];

const OTHER_TENANT_DOCS = [
  {
    id: 'doc-2',
    userId: 'tenant-2',
    companyId: 'company-2',
    title: 'Other Fleet Services',
    category: 'Services',
    content: 'Other Tenant operates heavy trucks in the mining sector.',
    keywords: ['mining', 'trucks'],
    summary: 'Other Tenant operates heavy trucks.',
    status: 'APPROVED',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.businessProfile.findFirst.mockResolvedValue(TENANT_PROFILE);
  mockPrisma.businessKnowledgeDocument.findMany.mockResolvedValue(TENANT_DOCS);
  mockPrisma.businessKnowledgeDocument.findFirst.mockResolvedValue(null);
  mockPrisma.businessKnowledgeDocument.count.mockResolvedValue(0);
  mockPrisma.agentConfig.findFirst.mockResolvedValue(null);
  mockPrisma.receptionistCustomer.create.mockResolvedValue({ id: 'lead-1', name: 'Jane Doe' });
  mockPrisma.followUpReminder.create.mockResolvedValue({ id: 'followup-1' });
});

afterEach(() => {
  businessProfileService.clearProfileCache?.();
  agentConfigService.clearAgentConfigCache?.();
});

// ── Phase 16 #1: Tenant business knowledge answering ──
describe('Tenant business knowledge answering', () => {
  it('answers from the tenant business profile', async () => {
    const result = await qa.answerKnowledgeQuestion({
      userId: 'tenant-1',
      companyId: 'company-1',
      message: 'Tell me about Acme Logistics',
    });
    expect(result.found).toBe(true);
    expect(result.answer).toContain('Acme Logistics');
    expect(result.isKnowledgeBase).toBe(true);
  });

  it('answers from approved tenant documents', async () => {
    const result = await qa.answerKnowledgeQuestion({
      userId: 'tenant-1',
      companyId: 'company-1',
      message: 'How can I track my delivery?',
    });
    expect(result.found).toBe(true);
    expect(result.usedSources).toContain('Acme Delivery Tracking');
  });

  it('does not leak other tenants knowledge', async () => {
    mockPrisma.businessKnowledgeDocument.findMany.mockResolvedValue(OTHER_TENANT_DOCS);
    const result = await qa.answerKnowledgeQuestion({
      userId: 'tenant-1',
      companyId: 'company-1',
      message: 'Do you operate mining trucks?',
    });
    expect(result.answer).not.toContain('mining');
  });

  it('falls back to the global FleetNimble engine for product questions', async () => {
    mockPrisma.businessProfile.findFirst.mockResolvedValue(null);
    mockPrisma.businessKnowledgeDocument.findMany.mockResolvedValue([]);
    const result = await qa.answerKnowledgeQuestion({
      userId: 'tenant-1',
      companyId: 'company-1',
      message: 'How do I view RPM and speed?',
    });
    expect(result.found).toBe(true);
    expect(result.answer).toBeTruthy();
    expect(result.isKnowledgeBase).toBe(true);
  });

  it('does not hallucinate when no knowledge exists', async () => {
    mockPrisma.businessProfile.findFirst.mockResolvedValue(null);
    mockPrisma.businessKnowledgeDocument.findMany.mockResolvedValue([]);
    const result = await qa.answerKnowledgeQuestion({
      userId: 'tenant-1',
      companyId: 'company-1',
      message: 'quantum toaster warranty period',
    });
    expect(result.found).toBe(false);
    expect(result.isKnowledgeBase).toBe(false);
    expect(result.answer).toContain("I'm sorry");
  });

  it('answers from the business profile without a company (user-scoped)', async () => {
    const result = await qa.answerKnowledgeQuestion({
      userId: 'tenant-1',
      companyId: null,
      message: 'What does Acme Logistics do?',
    });
    expect(result.found).toBe(true);
    expect(result.answer).toContain('Acme Logistics');
  });
});

// ── Phase 16 #2: Natural QA with context and follow-ups ──
describe('Natural QA — follow-ups and overviews', () => {
  it('expands follow-up pronouns with the last topic', () => {
    expect(qa.resolveContextualQuery('What about it?', 'GPS Tracking')).toBe('What about it? GPS Tracking');
    expect(qa.resolveContextualQuery('how much is that?', 'Pricing')).toBe('how much is that? Pricing');
    expect(qa.resolveContextualQuery('A fresh question', 'GPS Tracking')).toBe('A fresh question');
  });

  it('offers a category overview for "What is FleetNimble?"', async () => {
    mockPrisma.businessProfile.findFirst.mockResolvedValue(null);
    mockPrisma.businessKnowledgeDocument.findMany.mockResolvedValue([]);
    const result = await qa.answerKnowledgeQuestion({
      userId: 'tenant-1',
      companyId: 'company-1',
      message: 'What is FleetNimble?',
    });
    expect(result.found).toBe(true);
    expect(result.overviewSuggestion).toContain('fleet management features');
  });

  it('answers a follow-up question using prior topic context', async () => {
    mockPrisma.businessProfile.findFirst.mockResolvedValue(null);
    mockPrisma.businessKnowledgeDocument.findMany.mockResolvedValue([]);
    const result = await qa.answerKnowledgeQuestion({
      userId: 'tenant-1',
      companyId: 'company-1',
      message: 'What about it?',
      sessionContext: { lastTopic: 'GPS Tracking' },
    });
    expect(result.found).toBe(true);
    expect(result.answer).toBeTruthy();
  });

  it('uses contexted fallback when no answer and prior topics exist', async () => {
    mockPrisma.businessProfile.findFirst.mockResolvedValue(null);
    mockPrisma.businessKnowledgeDocument.findMany.mockResolvedValue([]);
    const result = await qa.answerKnowledgeQuestion({
      userId: 'tenant-1',
      companyId: 'company-1',
      message: 'unusual obscure topic xyz',
      sessionContext: { hasPriorTopics: true },
    });
    expect(result.found).toBe(false);
    expect(result.answer).toContain('knowledge base');
  });
});

// ── Phase 16 #3: Business profile CRUD ──
describe('Business profile service', () => {
  it('creates a profile for a tenant', async () => {
    mockPrisma.businessProfile.findFirst.mockResolvedValue(null);
    mockPrisma.businessProfile.create.mockResolvedValue({ id: 'p1', businessName: 'New Co', userId: 'u1' });
    const result = await businessProfileService.createBusinessProfile({
      userId: 'u1',
      companyId: 'c1',
      data: { businessName: 'New Co', industry: 'Logistics' },
    });
    expect(result.error).toBeUndefined();
    expect(result.created).toBe(true);
  });

  it('rejects a profile without a business name', async () => {
    const result = await businessProfileService.createBusinessProfile({ userId: 'u1', companyId: 'c1', data: {} });
    expect(result.error).toBe('missing_business_name');
  });

  it('updates an existing profile and bumps version', async () => {
    mockPrisma.businessProfile.findFirst.mockResolvedValue({ id: 'p1' });
    mockPrisma.businessProfile.update.mockResolvedValue({ id: 'p1', businessName: 'Updated Co' });
    const result = await businessProfileService.updateBusinessProfile({ userId: 'u1', companyId: 'c1', data: { businessName: 'Updated Co' } });
    expect(result.error).toBeUndefined();
    expect(mockPrisma.businessProfile.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ version: { increment: 1 } }) }));
  });

  it('returns not_found when updating a missing profile', async () => {
    mockPrisma.businessProfile.findFirst.mockResolvedValue(null);
    const result = await businessProfileService.updateBusinessProfile({ userId: 'u1', companyId: 'c1', data: { businessName: 'X' } });
    expect(result.error).toBe('not_found');
  });
});

// ── Phase 16 #4: Knowledge documents + approval workflow ──
describe('Business knowledge documents', () => {
  it('creates a document with chunks', async () => {
    mockPrisma.businessKnowledgeDocument.findFirst.mockResolvedValue(null);
    mockPrisma.businessKnowledgeDocument.create.mockResolvedValue({ id: 'd1', title: 'Doc', content: 'content' });
    mockPrisma.businessKnowledgeChunk.createMany.mockResolvedValue({ count: 1 });
    const result = await businessKnowledgeService.createDocument({
      userId: 'u1',
      companyId: 'c1',
      data: { title: 'Doc', content: 'This is the document content for testing chunking.' },
    });
    expect(result.error).toBeUndefined();
    expect(mockPrisma.businessKnowledgeChunk.createMany).toHaveBeenCalled();
  });

  it('rejects a document without content', async () => {
    const result = await businessKnowledgeService.createDocument({ userId: 'u1', companyId: 'c1', data: { title: 'Doc' } });
    expect(result.error).toBe('missing_title_or_content');
  });

  it('lists only documents for the requesting tenant', async () => {
    mockPrisma.businessKnowledgeDocument.findMany.mockResolvedValue(TENANT_DOCS);
    mockPrisma.businessKnowledgeDocument.count.mockResolvedValue(1);
    const result = await businessKnowledgeService.getDocuments({ userId: 'tenant-1', companyId: 'company-1' });
    expect(result.items).toHaveLength(1);
    expect(mockPrisma.businessKnowledgeDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-1' }) })
    );
  });

  it('approves a document', async () => {
    mockPrisma.businessKnowledgeDocument.findFirst.mockResolvedValue({ id: 'd1' });
    mockPrisma.businessKnowledgeDocument.update.mockResolvedValue({ id: 'd1', status: 'APPROVED' });
    const result = await businessKnowledgeService.approveDocument({ userId: 'u1', companyId: 'c1', documentId: 'd1' });
    expect(result.error).toBeUndefined();
    expect(mockPrisma.businessKnowledgeDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) })
    );
  });

  it('only searches APPROVED documents', async () => {
    await businessKnowledgeService.searchTenantKnowledge({ userId: 'u1', companyId: 'c1', query: 'delivery' });
    expect(mockPrisma.businessKnowledgeDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'APPROVED' }) })
    );
  });
});

// ── Phase 16 #5: Greeting protection ──
describe('Agent config — greeting protection', () => {
  it('defaults to the standard FleetNimble greeting', async () => {
    mockPrisma.agentConfig.findFirst.mockResolvedValue(null);
    const agentConfig = await agentConfigService.getAgentConfig({ userId: 'u1', companyId: 'c1' });
    expect(agentConfig.isDefault).toBe(true);
    expect(agentConfig.greetingMessage).toContain('Thank you for calling FleetNimble');
  });

  it('rejects an empty greeting on a protected config', async () => {
    mockPrisma.agentConfig.findFirst.mockResolvedValue({
      id: 'ac1', userId: 'u1', companyId: 'c1', greetingMessage: 'Custom greeting', greetingProtected: true,
    });
    const result = await agentConfigService.setGreeting({ userId: 'u1', companyId: 'c1', greetingMessage: '' });
    expect(result.error).toBe('greeting_protected');
    expect(mockPrisma.agentConfig.update).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only greeting', async () => {
    const result = await agentConfigService.setGreeting({ userId: 'u1', companyId: 'c1', greetingMessage: '   ' });
    expect(result.error).toBe('greeting_protected');
  });

  it('allows an explicit greeting replacement', async () => {
    mockPrisma.agentConfig.findFirst.mockResolvedValue({
      id: 'ac1', userId: 'u1', companyId: 'c1', greetingMessage: 'Old', greetingProtected: true,
    });
    mockPrisma.agentConfig.update.mockResolvedValue({ id: 'ac1', greetingMessage: 'New greeting' });
    const result = await agentConfigService.setGreeting({ userId: 'u1', companyId: 'c1', greetingMessage: 'New greeting' });
    expect(result.error).toBeUndefined();
    expect(result.agentConfig.greetingMessage).toBe('New greeting');
  });

  it('creates a config with default greeting when none provided', async () => {
    mockPrisma.agentConfig.findFirst.mockResolvedValue(null);
    mockPrisma.agentConfig.create.mockResolvedValue({ id: 'ac2', greetingMessage: 'default' });
    const result = await agentConfigService.upsertAgentConfig({ userId: 'u1', companyId: 'c1', data: { agentName: 'Receptionist' } });
    expect(result.error).toBeUndefined();
    expect(mockPrisma.agentConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ greetingMessage: expect.stringContaining('FleetNimble') }) })
    );
  });
});

// ── Phase 16 #6: Controlled tools ──
describe('Controlled tool registry', () => {
  it('registers the new controlled tools', () => {
    const names = toolRegistry.getNewToolNames();
    expect(names).toContain('search_knowledge');
    expect(names).toContain('create_lead');
    expect(names).toContain('transfer_call');
    expect(names).toContain('create_follow_up');
  });

  it('creates a lead with tenant scoping after validation', async () => {
    const result = await toolRegistry.executeNewTool('create_lead', { name: 'Jane Doe', phone: '+919876543210', company: 'ACME' }, { userId: 'u1', companyId: 'c1', callSid: 'CA1' });
    expect(result.success).toBe(true);
    expect(result.lead.id).toBe('lead-1');
    expect(mockPrisma.receptionistCustomer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', companyId: 'c1' }) })
    );
  });

  it('rejects a lead missing required fields', async () => {
    const result = await toolRegistry.executeNewTool('create_lead', { name: 'Jane Doe' }, { userId: 'u1', companyId: 'c1' });
    expect(result.success).toBe(false);
    expect(result.missing_fields).toContain('phone');
  });

  it('validates transfer department', async () => {
    const result = await toolRegistry.executeNewTool('transfer_call', { department: 'marketing', reason: 'x' }, { userId: 'u1', companyId: 'c1' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_department');
  });

  it('schedules a follow-up reminder', async () => {
    const result = await toolRegistry.executeNewTool('create_follow_up', { customerId: 'cust-1', date: '2026-09-01', note: 'Call back' }, { userId: 'u1', companyId: 'c1', callId: 'call-1' });
    expect(result.success).toBe(true);
    expect(result.followUp.id).toBe('followup-1');
  });

  it('rejects an unknown tool', async () => {
    const result = await toolRegistry.executeNewTool('not_a_tool', {}, { userId: 'u1' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('unknown_tool');
  });

  it('returns structured results from search_knowledge', async () => {
    const result = await toolRegistry.executeNewTool('search_knowledge', { query: 'delivery' }, { userId: 'u1', companyId: 'c1' });
    expect(result.found).toBe(true);
    expect(result.answer).toContain('Acme');
  });
});

// ── Phase 16 #7: Fleet Brain planner ──
describe('Fleet Brain receptionist planner', () => {
  it('plans an emergency with immediate handoff', async () => {
    const plan = await planner.buildReceptionistPlan({ userId: 'u1', companyId: 'c1', message: 'We have an emergency breakdown on the highway' });
    expect(plan.handoffRecommended).toBe(true);
    expect(plan.handoffDepartment).toBe('emergency');
    expect(plan.actions).toContain('transfer_call');
  });

  it('plans a demo booking with confirmation', async () => {
    const plan = await planner.buildReceptionistPlan({ userId: 'u1', companyId: 'c1', message: 'I want to book a demo' });
    expect(plan.intent).toBe('schedule_meeting');
    expect(plan.actions).toContain('create_appointment');
    expect(plan.requiresConfirmation).toBe(true);
  });

  it('plans a knowledge answer for product questions', async () => {
    mockPrisma.businessProfile.findFirst.mockResolvedValue(null);
    mockPrisma.businessKnowledgeDocument.findMany.mockResolvedValue([]);
    const plan = await planner.buildReceptionistPlan({ userId: 'u1', companyId: 'c1', message: 'How does GPS tracking work?' });
    expect(plan.answer).toBeTruthy();
    expect(plan.answerSource).toBe('knowledge');
  });

  it('recommends handoff when the caller asks for a human', async () => {
    mockPrisma.businessProfile.findFirst.mockResolvedValue(null);
    mockPrisma.businessKnowledgeDocument.findMany.mockResolvedValue([]);
    const plan = await planner.buildReceptionistPlan({ userId: 'u1', companyId: 'c1', message: 'I want to talk to a human representative' });
    expect(plan.handoffRecommended).toBe(true);
    expect(plan.handoffDepartment).toBe('support');
  });

  it('greets on a new session', async () => {
    const plan = await planner.buildReceptionistPlan({ userId: 'u1', companyId: 'c1', message: 'Hello there', session: {} });
    expect(plan.answer).toContain('Thank you for calling FleetNimble');
  });

  it('plans without generating unrestricted responses', async () => {
    const plan = await planner.buildReceptionistPlan({ userId: 'u1', companyId: 'c1', message: 'hi' });
    expect(plan).not.toHaveProperty('unrestrictedReply');
    expect(plan.answerSource).toBeDefined();
  });
});

// ── Phase 16 #8: Voice prompt / tools regression ──
describe('Voice service — business context and tool count', () => {
  it('keeps exactly 20 tool definitions', () => {
    const tools = voiceService.buildToolDefinitions(true);
    expect(tools.length).toBe(20);
  });

  it('injects business context into the system prompt when provided', async () => {
    const prompt = voiceService.buildSystemPrompt({ businessName: 'FleetNimble' }, '', 'Business name: Acme Logistics\nAbout: regional delivery');
    expect(prompt).toContain('Acme Logistics');
    expect(prompt).toContain('Business context for this call');
  });

  it('keeps the classic prompt unchanged without business context', () => {
    const prompt = voiceService.buildSystemPrompt({ businessName: 'FleetNimble' });
    expect(prompt).not.toContain('Business context for this call');
    expect(prompt).toContain('Every new call MUST begin with a warm FleetNimble greeting');
  });

  it('builds a compact business context string', () => {
    const context = voiceService.buildBusinessContext(TENANT_PROFILE, { agentName: 'AI Receptionist', personality: 'Warm' });
    expect(context).toContain('Business name: Acme Logistics');
    expect(context).toContain('Products: GPS Tracking, Delivery Management');
    expect(context).toContain('Agent name: AI Receptionist');
  });
});

// ── Phase 16 #9: Orchestrator knowledge-aware turns ──
describe('Orchestrator — knowledge-aware turns', () => {
  it('returns knowledge base answers with sources for product questions', async () => {
    mockPrisma.businessProfile.findFirst.mockResolvedValue(null);
    mockPrisma.businessKnowledgeDocument.findMany.mockResolvedValue([]);
    const result = await orchestrator.processReceptionistTurn({
      session: { callSid: 'CA123', userId: 'user-1', currentStage: 'greeting', collectedData: {} },
      userText: 'How do I view RPM and speed?',
      channel: 'twilio',
    });
    expect(result.isKnowledgeBase).toBe(true);
    expect(result.reply).toBeTruthy();
  });

  it('answers with tenant knowledge when available', async () => {
    const result = await orchestrator.processReceptionistTurn({
      session: { callSid: 'CA123', userId: 'tenant-1', companyId: 'company-1', currentStage: 'greeting', collectedData: {} },
      userText: 'Tell me about Acme Logistics',
      channel: 'twilio',
    });
    expect(result.reply).toContain('Acme Logistics');
    expect(result.isKnowledgeBase).toBe(true);
  });

  it('keeps a graceful reply for unrecognized questions (no hallucination)', async () => {
    mockPrisma.businessProfile.findFirst.mockResolvedValue(null);
    mockPrisma.businessKnowledgeDocument.findMany.mockResolvedValue([]);
    const result = await orchestrator.processReceptionistTurn({
      session: { callSid: 'CA123', userId: 'user-1', currentStage: 'greeting', collectedData: {} },
      userText: 'quantum toaster warranty period',
      channel: 'twilio',
    });
    expect(result.reply).toBeTruthy();
    expect(result.reply).not.toContain('quantum toaster');
  });

  it('still handles emergency detection first', async () => {
    const result = await orchestrator.processReceptionistTurn({
      session: { callSid: 'CA123', userId: 'user-1', currentStage: 'greeting', collectedData: {} },
      userText: 'This is an emergency, my driver is stranded',
      channel: 'twilio',
    });
    expect(result.escalate).toBe(true);
    expect(result.department).toBe('emergency');
  });
});

// ── Phase 16 #10: Interaction logging ──
describe('AI interaction logging', () => {
  it('records interactions without raising', async () => {
    mockPrisma.aiInteractionLog.create.mockResolvedValue({ id: 'log-1' });
    await expect(
      qa.logAiInteraction({ callSid: 'CA1', userId: 'u1', companyId: 'c1', intent: 'product_question', question: 'Q', answer: 'A', knowledgeSourcesUsed: ['src'] })
    ).resolves.not.toThrow();
    expect(mockPrisma.aiInteractionLog.create).toHaveBeenCalled();
  });

  it('does not raise when prisma logging is unavailable', async () => {
    mockPrisma.aiInteractionLog.create.mockRejectedValue(new Error('db down'));
    await expect(qa.logAiInteraction({ callSid: 'CA1', question: 'Q' })).resolves.not.toThrow();
  });
});
