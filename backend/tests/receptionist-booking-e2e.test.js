import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

let orchestrator;
let voiceService;
let schedulingUtils;
let emitToUser;
let logger;

beforeAll(async () => {
  orchestrator = await import('../src/services/receptionistOrchestrator.service.js');
  voiceService = await import('../src/services/receptionistVoice.service.js');
  schedulingUtils = await import('../src/utils/scheduling.js');
  emitToUser = (await import('../src/utils/socketHub.js')).emitToUser;
  logger = (await import('../src/utils/logger.js')).default;
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
  aiReceptionistCall: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
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
  $transaction: vi.fn((callback) => callback(mockPrisma)),
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

vi.mock('../src/utils/socketHub.js', () => ({
  setIo: vi.fn(),
  getIo: vi.fn(() => null),
  emitToUser: vi.fn(),
  emitToRoom: vi.fn(),
  emitGlobal: vi.fn(),
  emitToAdminRoom: vi.fn(),
  ADMIN_ROOM: 'receptionist:admin',
}));

vi.mock('uuid', () => ({
  v4: () => 'mock-uuid-123',
  default: { v4: () => 'mock-uuid-123' },
}));

function resetMocks() {
  vi.clearAllMocks();
  mockPrisma.aiReceptionistAppointment.findFirst.mockResolvedValue(null);
  mockPrisma.aiReceptionistCall.findUnique.mockResolvedValue({ id: 'call-1' });
}

const fullSession = {
  userId: 'user-1',
  companyId: 'company-1',
  callId: 'call-e2e-1',
  collectedData: {
    callerName: 'Nithish',
    company: 'ABC Logistics',
    fleetSize: 35,
    industry: 'Logistics',
    email: 'nithish@abc-logistics.com',
    phone: '+919876543210',
    meetingPurpose: 'Product demo',
    preferredDate: '2026-07-15',
    preferredTime: '11:00',
    timezone: 'UTC',
  },
  pendingAction: 'create_appointment',
};

describe('Booking E2E - Appointment Creation', () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create customer, appointment, audit log and emit socket events', { timeout: 15000 }, async () => {
    mockPrisma.receptionistCustomer.findFirst.mockResolvedValue(null);
    mockPrisma.receptionistCustomer.create.mockResolvedValue({
      id: 'cust-1', name: 'Nithish', companyName: 'ABC Logistics', industry: 'Logistics', leadScore: 80, status: 'LEAD', totalAppointments: 0,
    });
    mockPrisma.receptionistCustomer.update.mockResolvedValue({});
    mockPrisma.aiReceptionistAppointment.create.mockResolvedValue({
      id: 'appt-1', scheduledDate: new Date('2026-07-15T11:00:00.000Z'), status: 'SCHEDULED', callerName: 'Nithish', companyName: 'ABC Logistics', meetingPurpose: 'Product demo', industry: 'Logistics',
    });
    mockPrisma.aiReceptionistAuditLog.create.mockResolvedValue({ id: 'audit-1' });

    const result = await orchestrator.handleConfirmation(fullSession, 'yes, please schedule it');

    expect(result.intent).toBe('appointment_created');
    expect(result.success).toBe(true);
    expect(result.actionResult).toEqual(expect.objectContaining({ type: 'appointment', id: 'appt-1' }));

    expect(mockPrisma.receptionistCustomer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Nithish',
        companyName: 'ABC Logistics',
        industry: 'Logistics',
        fleetSize: 35,
        phone: '+919876543210',
        email: 'nithish@abc-logistics.com',
      }),
    });

    expect(mockPrisma.aiReceptionistAppointment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        callerName: 'Nithish',
        industry: 'Logistics',
        scheduledDate: new Date('2026-07-15T11:00:00.000Z'),
        timezone: 'UTC',
        status: 'SCHEDULED',
      }),
    });

    expect(mockPrisma.aiReceptionistAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: 'appointment_created' }),
    });

    expect(emitToUser).toHaveBeenCalledWith('user-1', 'appointment.created', expect.objectContaining({ appointmentId: 'appt-1' }));
    expect(emitToUser).toHaveBeenCalledWith('user-1', 'crm.customer.created', expect.objectContaining({ customerId: 'cust-1', industry: 'Logistics' }));

    const bookingConfirmed = logger.info.mock.calls.find(([marker]) => marker === 'BOOKING_CONFIRMED');
    expect(bookingConfirmed).toBeDefined();
    expect(bookingConfirmed[1]).toEqual(expect.objectContaining({ appointmentId: 'appt-1', customerCreated: true, industry: 'Logistics' }));
  });

  it('should emit crm.customer.updated for existing customers', { timeout: 15000 }, async () => {
    mockPrisma.receptionistCustomer.findFirst.mockResolvedValue({
      id: 'cust-1', name: 'Nithish', companyName: null, industry: null, phone: '+919876543210', email: null,
    });
    mockPrisma.receptionistCustomer.update.mockResolvedValue({ id: 'cust-1', name: 'Nithish', companyName: 'ABC Logistics' });
    mockPrisma.aiReceptionistAppointment.create.mockResolvedValue({
      id: 'appt-1', scheduledDate: new Date('2026-07-15T11:00:00.000Z'), status: 'SCHEDULED', callerName: 'Nithish', companyName: 'ABC Logistics', meetingPurpose: 'Product demo',
    });
    mockPrisma.aiReceptionistAuditLog.create.mockResolvedValue({ id: 'audit-1' });

    const result = await orchestrator.handleConfirmation({ ...fullSession, callId: 'call-e2e-2' }, 'yes');

    expect(result.intent).toBe('appointment_created');
    expect(mockPrisma.receptionistCustomer.create).not.toHaveBeenCalled();
    expect(mockPrisma.receptionistCustomer.update).toHaveBeenCalledWith({
      where: { id: 'cust-1' },
      data: expect.objectContaining({ companyName: 'ABC Logistics', industry: 'Logistics' }),
    });
    expect(emitToUser).toHaveBeenCalledWith('user-1', 'crm.customer.updated', expect.objectContaining({ customerId: 'cust-1' }));
  });

  it('should fail gracefully when slot is already booked', { timeout: 15000 }, async () => {
    mockPrisma.aiReceptionistAppointment.findFirst.mockResolvedValue({
      id: 'appt-conflict', scheduledDate: new Date('2026-07-15T11:00:00.000Z'), callerName: 'Someone Else',
    });

    const result = await orchestrator.executeAppointmentCreation({
      ...fullSession,
      callId: 'call-e2e-3',
      collectedData: { ...fullSession.collectedData, timezone: undefined },
    });

    expect(result.success).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.reply).toContain('already an appointment');
    expect(mockPrisma.aiReceptionistAppointment.create).not.toHaveBeenCalled();
  });

  it('should return missing_owner when tenant is not resolvable', { timeout: 15000 }, async () => {
    const result = await orchestrator.executeAppointmentCreation({ ...fullSession, userId: null, companyId: null });

    expect(result.success).toBe(false);
    expect(result.error).toBe('missing_owner');
    expect(mockPrisma.aiReceptionistAppointment.create).not.toHaveBeenCalled();
    const failedLog = logger.warn.mock.calls.find(([marker]) => marker === 'BOOKING_FAILED');
    expect(failedLog).toBeDefined();
    expect(failedLog[1]).toEqual(expect.objectContaining({ reason: 'missing_owner' }));
  });

  it('should not double-book on repeated confirmation', { timeout: 15000 }, async () => {
    mockPrisma.receptionistCustomer.findFirst.mockResolvedValue(null);
    mockPrisma.receptionistCustomer.create.mockResolvedValue({ id: 'cust-1' });
    mockPrisma.receptionistCustomer.update.mockResolvedValue({});
    mockPrisma.aiReceptionistAppointment.create.mockResolvedValue({ id: 'appt-1' });
    mockPrisma.aiReceptionistAuditLog.create.mockResolvedValue({ id: 'audit-1' });

    const first = await orchestrator.handleConfirmation({ ...fullSession, callId: 'call-e2e-4' }, 'yes');
    expect(first.intent).toBe('appointment_created');

    const second = await orchestrator.handleConfirmation({ ...fullSession, callId: 'call-e2e-4' }, 'yes');
    expect(second.reply).toContain('already been processed');
    expect(mockPrisma.aiReceptionistAppointment.create).toHaveBeenCalledTimes(1);
  });
});

describe('Booking E2E - Timezone Handling', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('should keep wall-clock time for UTC bookings (backwards compatible)', { timeout: 15000 }, async () => {
    mockPrisma.receptionistCustomer.findFirst.mockResolvedValue(null);
    mockPrisma.receptionistCustomer.create.mockResolvedValue({ id: 'cust-1' });
    mockPrisma.aiReceptionistAppointment.create.mockResolvedValue({ id: 'appt-1' });
    mockPrisma.aiReceptionistAuditLog.create.mockResolvedValue({});

    await orchestrator.executeAppointmentCreation({
      userId: 'user-1',
      companyId: 'company-1',
      callId: 'call-tz-utc',
      collectedData: {
        callerName: 'Nithish',
        meetingPurpose: 'Demo',
        preferredDate: '2026-07-15',
        preferredTime: '11:00',
        timezone: 'UTC',
      },
    });

    expect(mockPrisma.aiReceptionistAppointment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ scheduledDate: new Date('2026-07-15T11:00:00.000Z') }),
    });
  });

  it('should convert wall-clock time to UTC for DST-aware timezones', { timeout: 15000 }, async () => {
    mockPrisma.receptionistCustomer.findFirst.mockResolvedValue(null);
    mockPrisma.receptionistCustomer.create.mockResolvedValue({ id: 'cust-1' });
    mockPrisma.aiReceptionistAppointment.create.mockResolvedValue({ id: 'appt-1' });
    mockPrisma.aiReceptionistAuditLog.create.mockResolvedValue({});

    await orchestrator.executeAppointmentCreation({
      userId: 'user-1',
      companyId: 'company-1',
      callId: 'call-tz-la',
      collectedData: {
        callerName: 'Nithish',
        meetingPurpose: 'Demo',
        preferredDate: '2026-08-11',
        preferredTime: '14:00',
        timezone: 'America/Los_Angeles',
      },
    });

    expect(mockPrisma.aiReceptionistAppointment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scheduledDate: new Date('2026-08-11T21:00:00.000Z'),
        timezone: 'America/Los_Angeles',
      }),
    });
  });

  it('should honor an explicit scheduledDateTime when provided', { timeout: 15000 }, async () => {
    mockPrisma.receptionistCustomer.findFirst.mockResolvedValue(null);
    mockPrisma.receptionistCustomer.create.mockResolvedValue({ id: 'cust-1' });
    mockPrisma.aiReceptionistAppointment.create.mockResolvedValue({ id: 'appt-1' });
    mockPrisma.aiReceptionistAuditLog.create.mockResolvedValue({});

    await orchestrator.executeAppointmentCreation({
      userId: 'user-1',
      companyId: 'company-1',
      callId: 'call-tz-iso',
      collectedData: {
        callerName: 'Nithish',
        meetingPurpose: 'Demo',
        scheduledDateTime: '2026-08-11T14:00:00-07:00',
        timezone: 'America/Los_Angeles',
      },
    });

    expect(mockPrisma.aiReceptionistAppointment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ scheduledDate: new Date('2026-08-11T21:00:00.000Z') }),
    });
  });
});

describe('Booking E2E - Validation and Safety', () => {
  it('should detect missing required booking fields', () => {
    const missing = schedulingUtils.missingBookingFields({ callerName: 'Nithish', meetingPurpose: 'Demo' });
    expect(missing).toContain('scheduledDateTime');

    const complete = schedulingUtils.missingBookingFields({
      callerName: 'Nithish',
      meetingPurpose: 'Demo',
      preferredDate: '2026-07-15',
      preferredTime: '11:00',
    });
    expect(complete).toEqual([]);
  });

  it('should normalize phone and email in scheduling args', () => {
    const normalized = schedulingUtils.normalizeSchedulingArgs({
      phone: '+1 (999) 555-0123',
      email: '  Test@Example.COM ',
      fleetSize: '12',
    });
    expect(normalized.phone).toBe('+19995550123');
    expect(normalized.email).toBe('test@example.com');
    expect(normalized.fleetSize).toBe(12);
  });

  it('should mask PII in structured booking logs', () => {
    const safe = schedulingUtils.toSafeBookingLog({
      callerName: 'Nithish',
      phone: '+919876543210',
      email: 'nithish@abc-logistics.com',
      industry: 'Logistics',
      meetingPurpose: 'Demo',
    });
    expect(safe.phone).not.toContain('9876543210');
    expect(safe.email).not.toContain('nithish@');
    expect(safe.email).toContain('abc-logistics.com');
    expect(safe.industry).toBe('Logistics');
  });

  it('should not execute booking when no date/time is provided', { timeout: 15000 }, async () => {
    resetMocks();
    mockPrisma.receptionistCustomer.findFirst.mockResolvedValue(null);

    const result = await orchestrator.executeAppointmentCreation({
      userId: 'user-1',
      companyId: 'company-1',
      callId: 'call-missing',
      collectedData: { callerName: 'Nithish', meetingPurpose: 'Demo' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('missing_required_fields');
    expect(result.missing_fields).toContain('scheduledDateTime');
    expect(result.retryable).toBe(false);
    expect(mockPrisma.aiReceptionistAppointment.create).not.toHaveBeenCalled();
    expect(mockPrisma.receptionistCustomer.create).not.toHaveBeenCalled();
  });
});

describe('Booking E2E - Voice Service Contract', () => {
  it('should include industry in the create_appointment tool schema', () => {
    const tools = voiceService.buildToolDefinitions(true);
    const createAppointment = tools.find((t) => t.name === 'create_appointment');
    expect(createAppointment).toBeDefined();
    expect(createAppointment.parameters.properties.industry).toBeDefined();
    expect(createAppointment.parameters.required).toContain('callerName');
    expect(createAppointment.parameters.required).toContain('meetingPurpose');
    expect(createAppointment.parameters.required).toContain('scheduledDateTime');
  });

  it('should instruct the agent to confirm details before booking', async () => {
    const prompt = await voiceService.buildSystemPrompt({ businessName: 'FleetNimble' });
    expect(prompt).toContain('explicit confirmation');
    expect(prompt).toContain('create_appointment');
  });
});
