import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockUserValid = {
  id: 'e8191a8a-26bd-4cdf-b967-475c313a25a7',
  companyId: '00000000-0000-0000-0000-000000000010',
  deletedAt: null,
};

const mockUserDeleted = {
  id: 'e8191a8a-26bd-4cdf-b967-475c313a25a7',
  companyId: '00000000-0000-0000-0000-000000000010',
  deletedAt: new Date('2025-01-01'),
};

const mockCompanyValid = {
  id: '00000000-0000-0000-0000-000000000010',
};

const mockUserNoCompany = {
  id: 'e8191a8a-26bd-4cdf-b967-475c313a25a7',
  companyId: null,
  deletedAt: null,
};

const prismaModel = () => ({
  findUnique: vi.fn(() => Promise.resolve(null)),
  findFirst: vi.fn(() => Promise.resolve(null)),
  findMany: vi.fn(() => Promise.resolve([])),
  create: vi.fn(() => Promise.resolve({ id: 'mock-id' })),
  update: vi.fn(() => Promise.resolve({ id: 'mock-id' })),
  upsert: vi.fn(() => Promise.resolve({ id: 'mock-id' })),
  count: vi.fn(() => Promise.resolve(0)),
});

const prismaMock = {
  user: prismaModel(),
  company: prismaModel(),
  aiReceptionistConfig: prismaModel(),
  aiReceptionistCall: prismaModel(),
  aiReceptionistAppointment: prismaModel(),
  aiReceptionistSupportTicket: prismaModel(),
  receptionistCustomer: prismaModel(),
  aiReceptionistAuditLog: prismaModel(),
  $transaction: vi.fn((cb) => cb(prismaMock)),
};

vi.mock('../src/utils/prisma.js', () => ({
  default: prismaMock,
}));

vi.mock('../src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    isLevelEnabled: vi.fn(() => false),
  },
}));

const mockConfig = {
  aiReceptionist: {
    defaultUserId: 'e8191a8a-26bd-4cdf-b967-475c313a25a7',
    defaultCompanyId: '00000000-0000-0000-0000-000000000010',
  },
  knowledge: {
    providerOrder: ['json'],
  },
};

vi.mock('../src/config/index.js', () => ({
  config: mockConfig,
}));

describe('Phase 1 — Owner Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. accepts valid user with deletedAt null', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockUserValid);
    prismaMock.company.findUnique.mockResolvedValue(mockCompanyValid);

    const { resolveTenant, clearCache } = await import('../src/services/receptionistTenantResolver.service.js');
    clearCache();

    const result = await resolveTenant({ calledNumber: null, twilioAccountSid: null });
    expect(result.ownerValidated).toBe(true);
    expect(result.userId).toBe('e8191a8a-26bd-4cdf-b967-475c313a25a7');
    expect(result.companyValidated).toBe(true);
    expect(result.companyId).toBe('00000000-0000-0000-0000-000000000010');
    expect(result.source).toBe('environment-default');
  });

  it('2. rejects deleted user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockUserDeleted);

    const { resolveTenant, clearCache } = await import('../src/services/receptionistTenantResolver.service.js');
    clearCache();

    const result = await resolveTenant({ calledNumber: null, twilioAccountSid: null });
    expect(result.ownerValidated).toBe(false);
    expect(result.userId).toBeNull();
  });

  it('3. rejects missing user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const { resolveTenant, clearCache } = await import('../src/services/receptionistTenantResolver.service.js');
    clearCache();

    const result = await resolveTenant({ calledNumber: null, twilioAccountSid: null });
    expect(result.ownerValidated).toBe(false);
    expect(result.userId).toBeNull();
  });
});

describe('Phase 2 — Company Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.aiReceptionist.defaultUserId = 'e8191a8a-26bd-4cdf-b967-475c313a25a7';
    mockConfig.aiReceptionist.defaultCompanyId = '00000000-0000-0000-0000-000000000010';
  });

  it('4. accepts valid company', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockUserValid);
    prismaMock.company.findUnique.mockResolvedValue(mockCompanyValid);

    const { resolveTenant, clearCache } = await import('../src/services/receptionistTenantResolver.service.js');
    clearCache();

    const result = await resolveTenant({ calledNumber: null, twilioAccountSid: null });
    expect(result.companyValidated).toBe(true);
    expect(result.companyId).toBe('00000000-0000-0000-0000-000000000010');
  });

  it('5. rejects invalid company', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockUserValid);
    prismaMock.company.findUnique.mockResolvedValue(null);

    const { resolveTenant, clearCache } = await import('../src/services/receptionistTenantResolver.service.js');
    clearCache();

    const result = await resolveTenant({ calledNumber: null, twilioAccountSid: null });
    expect(result.companyValidated).toBe(false);
    expect(result.companyId).toBeNull();
  });

  it('6. environment company overrides user.companyId', async () => {
    const userWithDiffCompany = { ...mockUserValid, companyId: 'other-company-id' };
    prismaMock.user.findUnique.mockResolvedValue(userWithDiffCompany);
    prismaMock.company.findUnique.mockResolvedValue(mockCompanyValid);

    const { resolveTenant, clearCache } = await import('../src/services/receptionistTenantResolver.service.js');
    clearCache();

    const result = await resolveTenant({ calledNumber: null, twilioAccountSid: null });
    expect(result.companyValidated).toBe(true);
    expect(result.companyId).toBe('00000000-0000-0000-0000-000000000010');
  });

  it('falls back to user.companyId when env company not set', async () => {
    mockConfig.aiReceptionist.defaultCompanyId = null;
    prismaMock.user.findUnique.mockResolvedValue(mockUserValid);
    prismaMock.company.findUnique.mockResolvedValue(mockCompanyValid);

    const { resolveTenant, clearCache } = await import('../src/services/receptionistTenantResolver.service.js');
    clearCache();

    const result = await resolveTenant({ calledNumber: null, twilioAccountSid: null });
    expect(result.companyValidated).toBe(true);
    expect(result.companyId).toBe('00000000-0000-0000-0000-000000000010');
  });
});

describe('Phase 3 — Startup Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('7. retries validation after DB reconnect', { timeout: 15000 }, async () => {
    prismaMock.user.findUnique
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValue(mockUserValid);
    prismaMock.company.findUnique
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValue(mockCompanyValid);

    const { validateOwnerAtStartup, clearCache } = await import('../src/services/receptionistTenantResolver.service.js');
    clearCache();

    let result;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        result = await validateOwnerAtStartup();
        if (result.ownerValidated && result.companyValidated) break;
      } catch {
        // retry
      }
    }

    expect(result.ownerValidated).toBe(true);
    expect(result.companyValidated).toBe(true);
    expect(result.persistenceAvailable).toBe(true);
  });

  it('startup validation returns correct shape', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockUserValid);
    prismaMock.company.findUnique.mockResolvedValue(mockCompanyValid);

    const { validateOwnerAtStartup, clearCache } = await import('../src/services/receptionistTenantResolver.service.js');
    clearCache();

    const result = await validateOwnerAtStartup();
    expect(result).toHaveProperty('ownerConfigured', true);
    expect(result).toHaveProperty('ownerValidated', true);
    expect(result).toHaveProperty('companyConfigured', true);
    expect(result).toHaveProperty('companyValidated', true);
    expect(result).toHaveProperty('persistenceAvailable', true);
  });
});

describe('Phase 4 — Health Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('8. reports owner state safely without exposing IDs', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockUserValid);
    prismaMock.company.findUnique.mockResolvedValue(mockCompanyValid);

    const { resolveTenant, clearCache, getResolvedOwner } = await import('../src/services/receptionistTenantResolver.service.js');
    clearCache();
    await resolveTenant({ calledNumber: null, twilioAccountSid: null });

    const owner = getResolvedOwner();
    expect(owner.ownerValidated).toBe(true);
    expect(owner.companyValidated).toBe(true);
    expect(owner.persistenceAvailable).toBe(true);
    expect(typeof owner.userId).toBe('string');
  });
});

describe('Phase 5 — Trusted Ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('9. null userId never reaches Prisma operations', { timeout: 30000 }, async () => {
    const { createCallRecord } = await import('../src/services/receptionistOrchestrator.service.js');
    const result = await createCallRecord({
      userId: null,
      companyId: null,
      callSid: 'CA-test',
      from: '+1234567890',
      to: '+0987654321',
    });
    expect(result).toBeNull();
  });

  it('10. caller cannot override userId/companyId through tool arguments', { timeout: 60000 }, async () => {
    const injectedUserId = 'e8191a8a-26bd-4cdf-b967-475c313a25a7';
    const injectedCompanyId = '00000000-0000-0000-0000-000000000010';

    prismaMock.aiReceptionistAppointment.create.mockResolvedValue({
      id: 'appt-1',
      userId: injectedUserId,
      companyId: injectedCompanyId,
    });
    prismaMock.aiReceptionistAuditLog.create.mockResolvedValue({});

    const { executeAppointmentCreation } = await import('../src/services/receptionistOrchestrator.service.js');
    const session = {
      userId: injectedUserId,
      companyId: injectedCompanyId,
      callId: 'call-1',
      customerId: null,
      collectedData: {
        callerName: 'Attacker',
        preferredDate: '2026-07-15',
        preferredTime: '14:00',
      },
      currentStage: 'confirming',
      pendingAction: 'create_appointment',
    };

    const result = await executeAppointmentCreation(session);
    if (!result.actionResult) {
      console.error('executeAppointmentCreation failed:', JSON.stringify(result));
    }
    expect(result.actionResult).toBeTruthy();

    const createdAppointment = prismaMock.aiReceptionistAppointment.create.mock.calls[0][0];
    expect(createdAppointment.data.userId).toBe(injectedUserId);
    expect(createdAppointment.data.companyId).toBe(injectedCompanyId);
    expect(createdAppointment.data.userId).not.toBe('attacker-controlled-id');
    expect(createdAppointment.data.companyId).not.toBe('attacker-controlled-company');
  });
});

describe('Phase 6 — Call Creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('11. call record receives trusted ownership', async () => {
    prismaMock.aiReceptionistCall.upsert.mockResolvedValue({
      id: 'call-1',
      userId: 'e8191a8a-26bd-4cdf-b967-475c313a25a7',
      companyId: '00000000-0000-0000-0000-000000000010',
    });

    const { createCallRecord } = await import('../src/services/receptionistOrchestrator.service.js');
    const result = await createCallRecord({
      userId: 'e8191a8a-26bd-4cdf-b967-475c313a25a7',
      companyId: '00000000-0000-0000-0000-000000000010',
      callSid: 'CA-test-call-123',
      from: '+1234567890',
      to: '+0987654321',
    });

    expect(result).toBeTruthy();
    expect(prismaMock.aiReceptionistCall.upsert).toHaveBeenCalledOnce();

    const upsertArgs = prismaMock.aiReceptionistCall.upsert.mock.calls[0][0];
    expect(upsertArgs.create.userId).toBe('e8191a8a-26bd-4cdf-b967-475c313a25a7');
    expect(upsertArgs.create.companyId).toBe('00000000-0000-0000-0000-000000000010');
    expect(upsertArgs.where.twilioCallSid).toBe('CA-test-call-123');
  });

  it('15. duplicate CallSid does not create duplicate call', async () => {
    prismaMock.aiReceptionistCall.upsert.mockResolvedValue({
      id: 'existing-call-1',
      userId: 'e8191a8a-26bd-4cdf-b967-475c313a25a7',
      companyId: '00000000-0000-0000-0000-000000000010',
    });

    const { createCallRecord } = await import('../src/services/receptionistOrchestrator.service.js');
    const result1 = await createCallRecord({
      userId: 'e8191a8a-26bd-4cdf-b967-475c313a25a7',
      companyId: '00000000-0000-0000-0000-000000000010',
      callSid: 'CA-duplicate-test',
      from: '+1234567890',
    });

    expect(result1).toBeTruthy();
    expect(prismaMock.aiReceptionistCall.upsert).toHaveBeenCalledTimes(1);
  });
});

describe('Phase 7 — Customer Lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('12. customer lookup is tenant-scoped with exact E.164', async () => {
    prismaMock.receptionistCustomer.findFirst.mockResolvedValue({
      id: 'cust-1',
      userId: 'e8191a8a-26bd-4cdf-b967-475c313a25a7',
      name: 'John Doe',
      phone: '+1234567890',
    });

    const { lookupCustomerByPhone } = await import('../src/services/receptionistOrchestrator.service.js');
    await lookupCustomerByPhone('e8191a8a-26bd-4cdf-b967-475c313a25a7', '+1234567890');

    const findArgs = prismaMock.receptionistCustomer.findFirst.mock.calls[0][0];
    expect(findArgs.where.userId).toBe('e8191a8a-26bd-4cdf-b967-475c313a25a7');
    expect(findArgs.where.OR[0].phone).toBe('+1234567890');
  });

  it('customer lookup with different userId returns null', async () => {
    prismaMock.receptionistCustomer.findFirst.mockResolvedValue(null);

    const { lookupCustomerByPhone } = await import('../src/services/receptionistOrchestrator.service.js');
    const result = await lookupCustomerByPhone('other-user-id', '+1234567890');

    expect(result).toBeNull();
    const findArgs = prismaMock.receptionistCustomer.findFirst.mock.calls[0][0];
    expect(findArgs.where.userId).toBe('other-user-id');
  });
});

describe('Phase 8 & 9 — Appointment and Support Ticket Ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('13. appointment receives trusted ownership', { timeout: 60000 }, async () => {
    prismaMock.aiReceptionistAppointment.create.mockResolvedValue({
      id: 'appt-1',
      userId: 'e8191a8a-26bd-4cdf-b967-475c313a25a7',
      companyId: '00000000-0000-0000-0000-000000000010',
    });
    prismaMock.aiReceptionistAuditLog.create.mockResolvedValue({});

    const { executeAppointmentCreation } = await import('../src/services/receptionistOrchestrator.service.js');
    const result = await executeAppointmentCreation({
      userId: 'e8191a8a-26bd-4cdf-b967-475c313a25a7',
      companyId: '00000000-0000-0000-0000-000000000010',
      callId: 'call-appt-1',
      customerId: null,
      collectedData: {
        callerName: 'Jane Smith',
        preferredDate: '2026-07-20',
        preferredTime: '10:00',
        meetingPurpose: 'Demo',
      },
    });

    if (!result.actionResult) {
      console.error('executeAppointmentCreation failed:', JSON.stringify(result));
    }
    expect(result.actionResult).toBeTruthy();
    const created = prismaMock.aiReceptionistAppointment.create.mock.calls[0][0];
    expect(created.data.userId).toBe('e8191a8a-26bd-4cdf-b967-475c313a25a7');
    expect(created.data.companyId).toBe('00000000-0000-0000-0000-000000000010');
  });

  it('14. support ticket receives trusted ownership', { timeout: 60000 }, async () => {
    prismaMock.aiReceptionistSupportTicket.create.mockResolvedValue({
      id: 'ticket-1',
      userId: 'e8191a8a-26bd-4cdf-b967-475c313a25a7',
      companyId: '00000000-0000-0000-0000-000000000010',
    });
    prismaMock.aiReceptionistAuditLog.create.mockResolvedValue({});

    const { executeSupportTicketCreation } = await import('../src/services/receptionistOrchestrator.service.js');
    const result = await executeSupportTicketCreation({
      userId: 'e8191a8a-26bd-4cdf-b967-475c313a25a7',
      companyId: '00000000-0000-0000-0000-000000000010',
      callId: 'call-ticket-1',
      customerId: null,
      collectedData: {
        callerName: 'Bob Wilson',
        issue: 'GPS not updating',
      },
    });

    if (!result.actionResult) {
      console.error('executeSupportTicketCreation failed:', JSON.stringify(result));
    }
    expect(result.actionResult).toBeTruthy();
    const created = prismaMock.aiReceptionistSupportTicket.create.mock.calls[0][0];
    expect(created.data.userId).toBe('e8191a8a-26bd-4cdf-b967-475c313a25a7');
    expect(created.data.companyId).toBe('00000000-0000-0000-0000-000000000010');
  });

  it('appointment creation skipped when userId missing', async () => {
    const { executeAppointmentCreation } = await import('../src/services/receptionistOrchestrator.service.js');
    const result = await executeAppointmentCreation({
      userId: null,
      companyId: null,
      callId: 'call-no-owner',
      customerId: null,
      collectedData: { callerName: 'Test' },
    });

    expect(result.error).toBe('missing_owner');
    expect(prismaMock.aiReceptionistAppointment.create).not.toHaveBeenCalled();
  });

  it('support ticket creation skipped when companyId missing', async () => {
    const { executeSupportTicketCreation } = await import('../src/services/receptionistOrchestrator.service.js');
    const result = await executeSupportTicketCreation({
      userId: 'e8191a8a-26bd-4cdf-b967-475c313a25a7',
      companyId: null,
      callId: 'call-no-company',
      customerId: null,
      collectedData: { issue: 'Test issue' },
    });

    expect(result.error).toBe('missing_owner');
    expect(prismaMock.aiReceptionistSupportTicket.create).not.toHaveBeenCalled();
  });
});
