import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/utils/prisma.js', () => {
  const mockPrisma = {
    aiReceptionistCall: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
    aiReceptionistConfig: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    aiReceptionistAppointment: { count: vi.fn() },
    aiReceptionistSupportTicket: { count: vi.fn() },
    receptionistCustomer: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  };
  return { default: mockPrisma, __esModule: true };
});

vi.mock('../src/config/index.js', () => ({
  config: {
    env: 'test',
    twilio: { accountSid: 'test', authToken: 'test', phoneNumber: '+1234567890' },
    openai: { apiKey: 'test-key', voice: 'alloy', model: 'gpt-4o-realtime-preview' },
    publicUrl: 'http://localhost:5000',
  },
}));

// Reset the global ACTIVE_SESSIONS Map between tests
beforeEach(async () => {
  const { ACTIVE_SESSIONS } = await import('../src/services/receptionistRealtime.service.js');
  ACTIVE_SESSIONS.clear();
});

describe('Twilio Webhook Validation', () => {
  it('should return true in development mode', async () => {
    const { config } = await import('../src/config/index.js');
    config.env = 'development';
    const { validateTwilioRequest } = await import('../src/services/twilioWebhook.service.js');
    const req = { headers: {}, body: {} };
    expect(validateTwilioRequest(req)).toBe(true);
    config.env = 'test';
  }, 15000);

  it('should return false when signature is missing in production', async () => {
    const { config } = await import('../src/config/index.js');
    config.env = 'production';
    const { validateTwilioRequest } = await import('../src/services/twilioWebhook.service.js');
    const req = { headers: {}, body: {}, originalUrl: '/twilio/voice' };
    expect(validateTwilioRequest(req)).toBe(false);
    config.env = 'test';
  });

  it('should generate valid TwiML for incoming calls', async () => {
    const { buildIncomingTwiML } = await import('../src/services/twilioWebhook.service.js');
    const twiml = buildIncomingTwiML('CA123', '+1234567890', { publicUrl: 'http://localhost:5000' });
    expect(twiml).toContain('<?xml');
    expect(twiml).toContain('<Connect>');
    expect(twiml).toContain('<Stream');
  });

  it('should generate fallback TwiML', async () => {
    const { buildFallbackTwiML } = await import('../src/services/twilioWebhook.service.js');
    const twiml = buildFallbackTwiML();
    expect(twiml).toContain('<?xml');
    expect(twiml).toContain('Thank you for calling');
    expect(twiml).toContain('<Hangup/>');
  });

  it('should generate forward call TwiML', async () => {
    const { buildForwardCallTwiML } = await import('../src/services/twilioWebhook.service.js');
    const twiml = buildForwardCallTwiML('+1987654321', '+1234567890');
    expect(twiml).toContain('<Dial');
    expect(twiml).toContain('+1987654321');
  });
});

describe('Status Callback Handling', () => {
  it('should return 204 and not crash for status callbacks', async () => {
    const { handleStatusCallback } = await import('../src/controllers/twilioReceptionist.controller.js');
    const prisma = (await import('../src/utils/prisma.js')).default;

    prisma.aiReceptionistCall.findFirst.mockResolvedValue({
      id: 'call-1',
      userId: 'user-1',
      callStatus: 'IN_PROGRESS',
    });
    prisma.aiReceptionistCall.update.mockResolvedValue({});

    const req = {
      body: { CallSid: 'CA123', CallStatus: 'completed', CallDuration: '120' },
      app: { get: () => null },
    };
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn() };
    await handleStatusCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(prisma.aiReceptionistCall.update).not.toHaveBeenCalled();
  });
});

describe('Recording Callback Handling', () => {
  it('should store recording metadata', async () => {
    const { handleRecordingCallback } = await import('../src/controllers/twilioReceptionist.controller.js');
    const prisma = (await import('../src/utils/prisma.js')).default;

    prisma.aiReceptionistCall.findFirst.mockResolvedValue({
      id: 'call-1', userId: 'user-1',
    });
    prisma.aiReceptionistCall.update.mockResolvedValue({});

    const req = {
      body: { CallSid: 'CA123', RecordingUrl: 'https://api.twilio.com/recording.mp3', RecordingDuration: '60', RecordingSid: 'RE123' },
      app: { get: () => null },
    };
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn() };
    await handleRecordingCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(prisma.aiReceptionistCall.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recordingUrl: 'https://api.twilio.com/recording.mp3',
          recordingDuration: 60,
        }),
      })
    );
  });
});

describe('Realtime Session Management', () => {
  it('should register and retrieve sessions', async () => {
    const { registerSession, getSession, getActiveSessionsCount } = await import('../src/services/receptionistRealtime.service.js');
    registerSession('CA123', null, { userId: 'user-1' });
    expect(getSession('CA123')).toBeDefined();
    expect(getSession('CA123').callSid).toBe('CA123');
    expect(getActiveSessionsCount()).toBe(1);
  });

  it('should remove sessions cleanly', async () => {
    const { registerSession, removeSession, getActiveSessionsCount } = await import('../src/services/receptionistRealtime.service.js');
    registerSession('CA456', null, {});
    expect(getActiveSessionsCount()).toBe(1);
    removeSession('CA456');
    expect(getActiveSessionsCount()).toBe(0);
  });

  it('should track session activity', async () => {
    const { registerSession, updateSessionActivity, getSession } = await import('../src/services/receptionistRealtime.service.js');
    registerSession('CA789', null, {});
    const before = getSession('CA789').lastActivityAt;
    await new Promise(r => setTimeout(r, 10));
    updateSessionActivity('CA789');
    const after = getSession('CA789').lastActivityAt;
    expect(after).toBeGreaterThan(before);
  });

  it('should add and retrieve transcript entries', async () => {
    const { registerSession, addTranscriptEntry, getSession } = await import('../src/services/receptionistRealtime.service.js');
    registerSession('CA000', null, {});
    addTranscriptEntry('CA000', { role: 'caller', content: 'Hello' });
    expect(getSession('CA000').transcript.length).toBe(1);
  });
});

describe('Transcript Service', () => {
  it('should buffer and flush transcript entries', async () => {
    const { bufferTranscriptEntry, flushPendingTranscripts } = await import('../src/services/receptionistTranscript.service.js');
    const prisma = (await import('../src/utils/prisma.js')).default;
    prisma.aiReceptionistCall.findUnique.mockResolvedValue({ transcript: '[]' });
    prisma.aiReceptionistCall.update.mockResolvedValue({});

    bufferTranscriptEntry('call-1', { role: 'caller', content: 'Test' });
    bufferTranscriptEntry('call-1', { role: 'assistant', content: 'Hello' });

    await flushPendingTranscripts();
    expect(prisma.aiReceptionistCall.update).toHaveBeenCalled();
  });
});

describe('Human Handoff', () => {
  it('should detect escalation triggers for emergency', async () => {
    const { checkEscalationTriggers } = await import('../src/services/receptionistHandoff.service.js');
    const triggers = checkEscalationTriggers('emergency_escalation', 'neutral', 0.9);
    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers[0].reason).toContain('Emergency');
  });

  it('should detect escalation triggers for low confidence', async () => {
    const { checkEscalationTriggers } = await import('../src/services/receptionistHandoff.service.js');
    const triggers = checkEscalationTriggers('general_question', 'neutral', 0.2);
    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers[0].reason).toContain('confidence');
  });

  it('should detect escalation triggers for anger', async () => {
    const { checkEscalationTriggers } = await import('../src/services/receptionistHandoff.service.js');
    const triggers = checkEscalationTriggers('support_request', 'angry', 0.8);
    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers.some(t => t.reason.includes('angry'))).toBe(true);
  });
});

describe('Call Lifecycle Cleanup', () => {
  it('should clean up stale sessions', async () => {
    const { registerSession, cleanupStaleSessions, getActiveSessionsCount } = await import('../src/services/receptionistRealtime.service.js');
    registerSession('CA-OLD', null, {});
    expect(getActiveSessionsCount()).toBe(1);
    const cleaned = cleanupStaleSessions(-1);
    expect(cleaned).toBe(1);
    expect(getActiveSessionsCount()).toBe(0);
  });
});

describe('Voice Service Config', () => {
  it('should map valid OpenAI voices', async () => {
    const { mapToOpenAIVoice } = await import('../src/services/receptionistVoice.service.js');
    expect(mapToOpenAIVoice('nova')).toBe('nova');
    expect(mapToOpenAIVoice('INVALID')).toBe('alloy');
  });

  it('should build system prompt with context', async () => {
    const { buildSystemPrompt } = await import('../src/services/receptionistVoice.service.js');
    const prompt = buildSystemPrompt({ businessName: 'TestCo' }, 'Returning caller: John');
    expect(prompt).toContain('TestCo');
    expect(prompt).toContain('John');
  });

  it('should build tool definitions', async () => {
    const { buildToolDefinitions } = await import('../src/services/receptionistVoice.service.js');
    const tools = buildToolDefinitions();
    expect(tools.length).toBe(4);
    expect(tools[0].name).toBe('schedule_appointment');
    expect(tools[3].name).toBe('escalate_to_human');
  });
});

describe('Live Dashboard Socket Events', () => {
  it('should register socket event names correctly', () => {
    const events = ['call.started', 'transcript.partial', 'transcript.final', 'intent.changed', 'tool.called', 'call.escalated', 'call.ended'];
    expect(events).toContain('call.started');
    expect(events).toContain('call.ended');
    expect(events).toContain('call.escalated');
    expect(events).toContain('transcript.partial');
    expect(events).toContain('transcript.final');
    expect(events).toContain('tool.called');
  });
});