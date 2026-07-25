import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

let orchestrator;
let voiceService;

beforeAll(async () => {
  orchestrator = await import('../src/services/receptionistOrchestrator.service.js');
  voiceService = await import('../src/services/receptionistVoice.service.js');
}, 15000);

const mockPrisma = {
  receptionistCustomer: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  },
  receptionistCustomerNote: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  aiReceptionistCall: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  },
  aiReceptionistAppointment: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  aiReceptionistSupportTicket: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  aiReceptionistConfig: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  aiReceptionistAuditLog: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
};

vi.mock('../src/utils/prisma.js', () => ({ default: mockPrisma }));

vi.mock('../src/config/index.js', () => ({
  config: {
    env: 'test',
    ai: { sessionTimeoutMinutes: 30 },
    realtime: { businessToolsEnabled: true, model: 'gpt-4o-realtime-preview', voice: 'alloy', maxCallSeconds: 600, silenceTimeoutSeconds: 30, mediaStreamEnabled: true, configured: true },
    openai: { apiKey: 'test-key', voice: 'alloy', model: 'gpt-4o-realtime-preview' },
    twilio: { accountSid: 'test', authToken: 'test', phoneNumber: '+1234567890', configured: true, phoneConfigured: true, validateSignature: false },
    publicUrl: 'http://localhost:5000',
    aiReceptionist: { enabled: true, voiceAgentMode: 'hybrid', mediaStreamEnabled: true },
    knowledge: { providerOrder: ['json'] },
    jwt: { secret: 'test', refreshSecret: 'test' },
    logLevel: 'error',
  },
}));

vi.mock('../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('uuid', () => ({
  v4: () => 'mock-uuid-123',
  default: { v4: () => 'mock-uuid-123' },
}));

describe('Receptionist Orchestrator - Customer Lookup', () => {
  it('should find customer by phone number', { timeout: 10000 }, async () => {
    const mockCustomer = { id: 'cust-1', userId: 'user-1', name: 'Nithish', phone: '+919876543210', companyName: 'ABC Logistics', totalCalls: 3 };
    mockPrisma.receptionistCustomer.findFirst.mockResolvedValue(mockCustomer);

    const result = await orchestrator.lookupCustomerByPhone('user-1', '+919876543210');
    expect(result).toBeDefined();
    expect(mockPrisma.receptionistCustomer.findFirst).toHaveBeenCalled();
  });

  it('should return null when customer not found', async () => {
    mockPrisma.receptionistCustomer.findFirst.mockResolvedValue(null);
    mockPrisma.receptionistCustomer.findUnique.mockResolvedValue(null);
    const result = await orchestrator.lookupCustomerByPhone('user-1', '+911234567890');
    expect(result).toBeNull();
  });

  it('should return null when phone is empty', async () => {
    const result = await orchestrator.lookupCustomerByPhone('user-1', null);
    expect(result).toBeNull();
  });
});

describe('Receptionist Orchestrator - Call Record Creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create new call record', async () => {
    mockPrisma.aiReceptionistCall.findFirst.mockResolvedValue(null);
    mockPrisma.aiReceptionistCall.create.mockResolvedValue({ id: 'call-1', twilioCallSid: 'CA123' });

    const result = await orchestrator.createCallRecord({
      userId: 'user-1',
      callSid: 'CA123',
      from: '+919876543210',
      to: '+16693306377',
    });

    expect(result).toBeDefined();
    expect(result.id).toBe('call-1');
  });

  it('should not duplicate call records with same twilioCallSid', async () => {
    mockPrisma.aiReceptionistCall.findFirst.mockResolvedValue({ id: 'call-1', twilioCallSid: 'CA123' });

    const result = await orchestrator.createCallRecord({
      userId: 'user-1',
      callSid: 'CA123',
      from: '+919876543210',
      to: '+16693306377',
    });

    expect(result.id).toBe('call-1');
    expect(mockPrisma.aiReceptionistCall.create).not.toHaveBeenCalled();
  });

  it('should handle database error gracefully', async () => {
    mockPrisma.aiReceptionistCall.findFirst.mockRejectedValue(new Error('DB Error'));

    const result = await orchestrator.createCallRecord({
      userId: 'user-1',
      callSid: 'CA123',
      from: '+919876543210',
      to: '+16693306377',
    });

    expect(result).toBeNull();
  });
});

describe('Receptionist Orchestrator - Appointment Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should ask for name when missing', async () => {
    const result = await orchestrator.handleAppointmentIntent(
      { userId: 'user-1', collectedData: {} },
      'I want to book a demo'
    );
    expect(result.reply).toContain('name');
    expect(result.missingFields).toContain('callerName');
  });

  it('should ask for company after name', async () => {
    const result = await orchestrator.handleAppointmentIntent(
      { userId: 'user-1', collectedData: { callerName: 'Nithish' } },
      'Nithish'
    );
    expect(result.reply).toContain('company');
    expect(result.missingFields).toContain('company');
  });

  it('should ask for contact after company', async () => {
    const result = await orchestrator.handleAppointmentIntent(
      { userId: 'user-1', collectedData: { callerName: 'Nithish', company: 'ABC Logistics' } },
      'ABC Logistics'
    );
    expect(result.conversationStage).toBe('collecting_contact');
  });

  it('should ask for fleet size after contact', async () => {
    const result = await orchestrator.handleAppointmentIntent(
      { userId: 'user-1', collectedData: { callerName: 'Nithish', company: 'ABC Logistics', phone: '+919876543210' } },
      '+919876543210'
    );
    expect(result.conversationStage).toBe('collecting_fleet_size');
  });

  it('should summarize and require confirmation when all fields collected', async () => {
    const result = await orchestrator.handleAppointmentIntent(
      {
        userId: 'user-1',
        collectedData: {
          callerName: 'Nithish',
          company: 'ABC Logistics',
          phone: '+919876543210',
          fleetSize: 35,
          meetingPurpose: 'Product demo',
          preferredDate: '2026-07-15',
          preferredTime: '11:00',
        },
      },
      '11 AM'
    );
    expect(result.requiresConfirmation).toBe(true);
    expect(result.pendingAction).toBe('create_appointment');
    expect(result.reply).toContain('Nithish');
    expect(result.reply).toContain('ABC Logistics');
  });

  it('should execute appointment creation on confirmation', async () => {
    mockPrisma.aiReceptionistAppointment.create.mockResolvedValue({ id: 'appt-1' });
    mockPrisma.aiReceptionistCall.findFirst.mockResolvedValue(null);
    mockPrisma.aiReceptionistCall.update.mockResolvedValue({});

    const result = await orchestrator.handleConfirmation(
      {
        userId: 'user-1',
        callId: 'call-1',
        collectedData: {
          callerName: 'Nithish',
          company: 'ABC Logistics',
          phone: '+919876543210',
          fleetSize: 35,
          meetingPurpose: 'Product demo',
          preferredDate: '2026-07-15',
          preferredTime: '11:00',
        },
        pendingAction: 'create_appointment',
      },
      'yes, please schedule it'
    );
    expect(result.intent).toBe('appointment_created');
    expect(result.actionResult).toBeDefined();
    expect(result.actionResult.type).toBe('appointment');
  });
});

describe('Receptionist Orchestrator - Support Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should ask for name when missing', async () => {
    const result = await orchestrator.handleSupportIntent(
      { userId: 'user-1', collectedData: {} },
      'My GPS is not updating'
    );
    expect(result.reply).toContain('name');
  });

  it('should ask for issue description after name', async () => {
    const result = await orchestrator.handleSupportIntent(
      { userId: 'user-1', collectedData: { callerName: 'Raj' } },
      'Raj'
    );
    expect(result.conversationStage).toBe('collecting_issue');
  });

  it('should ask for contact after issue', async () => {
    const result = await orchestrator.handleSupportIntent(
      { userId: 'user-1', collectedData: { callerName: 'Raj', issue: 'GPS not updating since yesterday' } },
      'GPS not updating since yesterday'
    );
    expect(result.conversationStage).toBe('collecting_contact');
  });

  it('should summarize and require confirmation with all fields', async () => {
    const result = await orchestrator.handleSupportIntent(
      {
        userId: 'user-1',
        collectedData: { callerName: 'Raj', issue: 'GPS not updating', phone: '+919876543210' },
      },
      '+919876543210'
    );
    expect(result.requiresConfirmation).toBe(true);
    expect(result.pendingAction).toBe('create_support_ticket');
  });

  it('should execute support ticket creation on confirmation', async () => {
    mockPrisma.aiReceptionistSupportTicket.create.mockResolvedValue({ id: 'ticket-1' });
    mockPrisma.aiReceptionistCall.findFirst.mockResolvedValue(null);
    mockPrisma.aiReceptionistCall.update.mockResolvedValue({});

    const result = await orchestrator.handleConfirmation(
      {
        userId: 'user-1',
        callId: 'call-1',
        collectedData: {
          callerName: 'Raj',
          issue: 'GPS not updating',
          phone: '+919876543210',
          urgency: 'HIGH',
        },
        pendingAction: 'create_support_ticket',
      },
      'yes, create the ticket'
    );
    expect(result.intent).toBe('support_ticket_created');
    expect(result.actionResult).toBeDefined();
    expect(result.actionResult.type).toBe('support_ticket');
  });
});

describe('Receptionist Orchestrator - Duplicate Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not create duplicate appointments', { timeout: 10000 }, async () => {
    mockPrisma.aiReceptionistAppointment.create.mockResolvedValue({ id: 'appt-1' });
    mockPrisma.aiReceptionistCall.findFirst.mockResolvedValue(null);
    mockPrisma.aiReceptionistCall.update.mockResolvedValue({});

    const session = {
      userId: 'user-1',
      callId: 'call-dupe-appt',
      collectedData: {
        callerName: 'Nithish',
        company: 'ABC',
        phone: '+919876543210',
        fleetSize: 10,
        meetingPurpose: 'Demo',
        preferredDate: '2026-07-15',
        preferredTime: '11:00',
      },
      pendingAction: 'create_appointment',
    };

    const first = await orchestrator.handleConfirmation(session, 'yes');
    expect(first.intent).toBe('appointment_created');
    expect(first.actionResult).toBeDefined();

    const second = await orchestrator.handleConfirmation(session, 'yes');
    expect(second.reply).toContain('already');
  });

  it('should not create duplicate support tickets', { timeout: 10000 }, async () => {
    mockPrisma.aiReceptionistSupportTicket.create.mockResolvedValue({ id: 'ticket-1' });
    mockPrisma.aiReceptionistCall.findFirst.mockResolvedValue(null);
    mockPrisma.aiReceptionistCall.update.mockResolvedValue({});

    const session = {
      userId: 'user-1',
      callId: 'call-dupe-ticket',
      collectedData: { callerName: 'Raj', issue: 'GPS not working', phone: '+919876543210' },
      pendingAction: 'create_support_ticket',
    };

    const first = await orchestrator.handleConfirmation(session, 'yes');
    expect(first.intent).toBe('support_ticket_created');
    expect(first.actionResult).toBeDefined();

    const second = await orchestrator.handleConfirmation(session, 'yes');
    expect(second.reply).toContain('already');
  });
});

describe('Receptionist Orchestrator - CRM Update', () => {
  it('should update customer profile after call', async () => {
    mockPrisma.receptionistCustomer.findUnique.mockResolvedValue({ phone: null, email: null });
    mockPrisma.receptionistCustomer.update.mockResolvedValue({});

    await orchestrator.updateCRMAfterCall({
      userId: 'user-1',
      customerId: 'cust-1',
      collectedData: { company: 'ABC Logistics', fleetSize: 35, callerName: 'Nithish', phone: '+919876543210' },
      intent: 'schedule_meeting',
      summary: 'Demo scheduled',
      sentiment: 'positive',
    });

    expect(mockPrisma.receptionistCustomer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cust-1' },
      })
    );
  });
});

describe('Receptionist Orchestrator - Call End Update', () => {
  it('should update call record at end of call', async () => {
    mockPrisma.aiReceptionistCall.findFirst.mockResolvedValue({
      id: 'call-1',
      callStartedAt: new Date(Date.now() - 120000),
    });
    mockPrisma.aiReceptionistCall.update.mockResolvedValue({});

    await orchestrator.updateCallRecordAtEnd({
      callSid: 'CA123',
      userId: 'user-1',
      intent: 'schedule_meeting',
      summary: 'Demo scheduled',
      sentiment: 'positive',
      customerId: 'cust-1',
    });

    expect(mockPrisma.aiReceptionistCall.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ callStatus: 'COMPLETED', customerId: 'cust-1' }),
      })
    );
  });

  it('should mark call as escalated when handoffReason is provided', async () => {
    mockPrisma.aiReceptionistCall.findFirst.mockResolvedValue({
      id: 'call-1',
      callStartedAt: new Date(Date.now() - 60000),
    });
    mockPrisma.aiReceptionistCall.update.mockResolvedValue({});

    await orchestrator.updateCallRecordAtEnd({
      callSid: 'CA123',
      userId: 'user-1',
      handoffReason: 'Caller requested human',
    });

    expect(mockPrisma.aiReceptionistCall.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ callStatus: 'ESCALATED' }),
      })
    );
  });
});

describe('Receptionist Orchestrator - Knowledge Base Integration', () => {
  it('should return knowledge base answer for product questions', async () => {
    const result = await orchestrator.processReceptionistTurn({
      session: { callSid: 'CA123', userId: 'user-1', currentStage: 'greeting', collectedData: {} },
      userText: 'How do I view RPM and speed?',
      channel: 'twilio',
    });
    expect(result.isKnowledgeBase).toBe(true);
    expect(result.reply).toBeTruthy();
  });

  it('should handle general FleetNimble questions', async () => {
    const result = await orchestrator.processReceptionistTurn({
      session: { callSid: 'CA123', userId: 'user-1', currentStage: 'greeting', collectedData: {} },
      userText: 'What is FleetNimble?',
      channel: 'twilio',
    });
    expect(result.reply).toBeTruthy();
  });
});

describe('Receptionist Orchestrator - Confirmation Handling', () => {
  it('should handle "yes" confirmation', async () => {
    const result = await orchestrator.handleConfirmation(
      { userId: 'user-1', callId: 'call-1', pendingAction: 'create_appointment', collectedData: { callerName: 'Test', meetingPurpose: 'Demo', preferredDate: '2026-07-15', preferredTime: '11:00', phone: '+919876543210', company: 'ABC', fleetSize: 10 } },
      'yes'
    );
    expect(result).toBeDefined();
  });

  it('should handle "confirm" confirmation', async () => {
    const result = await orchestrator.handleConfirmation(
      { userId: 'user-1', callId: 'call-2', pendingAction: 'create_support_ticket', collectedData: { callerName: 'Test', issue: 'Test issue', phone: '+919876543210' } },
      'confirm'
    );
    expect(result).toBeDefined();
  });
});

describe('Receptionist Voice Service - Tool Definitions', () => {
  it('should return all tool definitions when enabled', () => {
    const tools = voiceService.buildToolDefinitions(true);
    expect(tools.length).toBe(20);
    const toolNames = tools.map(t => t.name);
    expect(toolNames).toContain('lookup_customer');
    expect(toolNames).toContain('retrieve_knowledge');
    expect(toolNames).toContain('create_appointment');
    expect(toolNames).toContain('create_support_ticket');
    expect(toolNames).toContain('save_customer_note');
    expect(toolNames).toContain('request_human_handoff');
    expect(toolNames).toContain('end_call');
  });

  it('should return empty array when tools disabled', () => {
    const tools = voiceService.buildToolDefinitions(false);
    expect(tools.length).toBe(0);
  });

  it('should include business context in system prompt', async () => {
    const prompt = await voiceService.buildSystemPrompt({ businessName: 'FleetNimble' });
    expect(prompt).toContain('FleetNimble');
  });
});

describe('Receptionist Orchestrator - Transcript and Summary', () => {
  it('should generate call summary', async () => {
    const session = {
      collectedData: { callerName: 'Nithish', company: 'ABC Logistics', intent: 'schedule_meeting', appointmentCreated: true },
      transcript: [
        { role: 'caller', content: 'I want to book a demo' },
        { role: 'assistant', content: 'Sure, what is your name?' },
      ],
    };
    const summary = await orchestrator.generateCallSummary(session);
    expect(summary.callerName).toBe('Nithish');
    expect(summary.appointmentCreated).toBe(true);
  });
});
