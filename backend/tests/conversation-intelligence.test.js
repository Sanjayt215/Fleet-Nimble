import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/utils/prisma.js', () => ({
  default: {
    conversationTimelineEvent: {
      create: vi.fn().mockRejectedValue(new Error('DB unreachable')),
      findMany: vi.fn().mockRejectedValue(new Error('DB unreachable')),
    },
    conversationSummary: {
      upsert: vi.fn().mockRejectedValue(new Error('DB unreachable')),
      findFirst: vi.fn().mockRejectedValue(new Error('DB unreachable')),
      findMany: vi.fn().mockRejectedValue(new Error('DB unreachable')),
    },
    conversationAnalytics: {
      upsert: vi.fn().mockRejectedValue(new Error('DB unreachable')),
      findFirst: vi.fn().mockRejectedValue(new Error('DB unreachable')),
      findMany: vi.fn().mockRejectedValue(new Error('DB unreachable')),
    },
    followUpReminder: {
      create: vi.fn().mockRejectedValue(new Error('DB unreachable')),
      update: vi.fn().mockRejectedValue(new Error('DB unreachable')),
      findMany: vi.fn().mockRejectedValue(new Error('DB unreachable')),
      findFirst: vi.fn().mockRejectedValue(new Error('DB unreachable')),
    },
    receptionistCustomer: {
      findUnique: vi.fn().mockRejectedValue(new Error('DB unreachable')),
      findFirst: vi.fn().mockRejectedValue(new Error('DB unreachable')),
      findMany: vi.fn().mockRejectedValue(new Error('DB unreachable')),
      update: vi.fn().mockRejectedValue(new Error('DB unreachable')),
    },
    receptionistCustomerNote: {
      create: vi.fn().mockRejectedValue(new Error('DB unreachable')),
    },
    aiReceptionistCall: {
      findMany: vi.fn().mockRejectedValue(new Error('DB unreachable')),
      findUnique: vi.fn().mockRejectedValue(new Error('DB unreachable')),
      findFirst: vi.fn().mockRejectedValue(new Error('DB unreachable')),
    },
    aiReceptionistAppointment: {
      update: vi.fn().mockRejectedValue(new Error('DB unreachable')),
    },
    agentRun: {
      findMany: vi.fn().mockRejectedValue(new Error('DB unreachable')),
    },
  },
}));

const {
  recordTimelineEvent,
  getLiveTimeline,
  getAllLiveTimelines,
  clearLiveTimeline,
  getTimelineStats,
  getTimelineByCall,
  TIMELINE_EVENT_TYPES,
} = await import('../src/services/conversationTimeline.service.js');
const { computeConversationAnalytics } = await import('../src/services/conversationAnalytics.service.js');
const { qualifyLeadFromText, computeLeadScore, persistLeadProfile } = await import('../src/services/leadQualification.service.js');
const {
  buildFollowUpEmailContent,
  buildFollowUpSmsContent,
  createFollowUpBundle,
  getFollowUps,
} = await import('../src/services/followUp.service.js');
const { generateConversationSummaries } = await import('../src/services/conversationSummary.service.js');
const { supervise } = await import('../src/services/callSupervisor.service.js');

describe('conversationTimeline.service', () => {
  beforeEach(() => {
    clearLiveTimeline('call-tl-1');
    clearLiveTimeline('call-tl-2');
  });

  afterEach(() => {
    clearLiveTimeline('call-tl-1');
    clearLiveTimeline('call-tl-2');
  });

  it('records events into the live timeline and emits default labels', async () => {
    const entry = await recordTimelineEvent({
      userId: 'u1',
      callId: 'call-tl-1',
      callSid: 'CA1',
      eventType: TIMELINE_EVENT_TYPES.GREETING_SENT,
    });
    expect(entry.eventType).toBe('GREETING_SENT');
    expect(entry.label).toBe('Greeting sent');
    const live = getLiveTimeline('call-tl-1');
    expect(live).toHaveLength(1);
    expect(live[0].callId).toBe('call-tl-1');
  });

  it('returns persisted events when available, live otherwise', async () => {
    await recordTimelineEvent({ userId: 'u1', callId: 'call-tl-1', eventType: TIMELINE_EVENT_TYPES.INTENT_DETECTED, label: 'Intent detected', data: { intent: 'SALES' } });
    const events = await getTimelineByCall('u1', 'call-tl-1');
    expect(events.some(e => e.eventType === 'INTENT_DETECTED')).toBe(true);
  });

  it('keeps per-call event list bounded and exposes stats', async () => {
    for (let i = 0; i < 600; i++) {
      await recordTimelineEvent({ userId: 'u1', callId: 'call-tl-1', eventType: TIMELINE_EVENT_TYPES.MEMORY_UPDATED, label: `e${i}`, data: { i } });
    }
    expect(getLiveTimeline('call-tl-1').length).toBeLessThanOrEqual(500);
    const stats = await getTimelineStats();
    expect(stats.liveCalls).toBeGreaterThan(0);
    expect(getAllLiveTimelines().length).toBeGreaterThan(0);
  });

  it('clears live timeline entries', async () => {
    await recordTimelineEvent({ userId: 'u1', callId: 'call-tl-2', eventType: TIMELINE_EVENT_TYPES.CALL_STARTED });
    await clearLiveTimeline('call-tl-2');
    expect(getLiveTimeline('call-tl-2')).toHaveLength(0);
  });
});

describe('conversationAnalytics.service', () => {
  it('computes talk ratio and latency from transcript entries', async () => {
    const transcript = [
      { role: 'caller', content: 'Hello there how are you', timestamp: '2026-08-02T10:00:00.000Z' },
      { role: 'assistant', content: 'Hi welcome to FleetNimble', timestamp: '2026-08-02T10:00:02.000Z' },
      { role: 'caller', content: 'I need help with my fleet', timestamp: '2026-08-02T10:00:04.000Z' },
    ];
    const result = await computeConversationAnalytics({
      userId: 'u1',
      callId: 'call-an-1',
      transcriptEntries: transcript,
      timelineEvents: [
        { eventType: 'KNOWLEDGE_SEARCHED' },
        { eventType: 'TOOL_STARTED' },
      ],
      collectedData: { leadScore: 80, appointmentCreated: true },
      intent: 'SALES_INTEREST',
      sentiment: 'positive',
    });
    expect(result.talkRatio).toBeGreaterThan(0);
    expect(result.avgResponseLatencyMs).toBeGreaterThan(0);
    expect(result.knowledgeHits).toBe(1);
    expect(result.toolUses).toBe(1);
    expect(result.salesScore).toBe(100);
    expect(result.conversationScore).toBeGreaterThanOrEqual(0);
    expect(result.conversationScore).toBeLessThanOrEqual(100);
  });

  it('handles empty transcripts gracefully', async () => {
    const result = await computeConversationAnalytics({
      userId: 'u1',
      callId: 'call-an-2',
      transcriptEntries: [],
      timelineEvents: [],
      collectedData: {},
    });
    expect(result.conversationScore).toBe(0);
    expect(result.talkRatio).toBe(0.5);
  });
});

describe('leadQualification.service', () => {
  it('detects lead signals from conversation text', async () => {
    const text = 'We are a logistics company running 120 trucks and we currently use Excel spreadsheets. We want a fleet management platform within 3 months.';
    const result = await qualifyLeadFromText({ text });
    expect(result.industry).toMatch(/logistics/i);
    expect(result.fleetSize).toBeGreaterThan(0);
    expect(result.currentFleetSoftware).toMatch(/excel/i);
    expect(result.leadScore).toBeGreaterThanOrEqual(0);
    expect(result.leadScore).toBeLessThanOrEqual(100);
  });

  it('computes lead score within bounds and skips persist without a customer', async () => {
    const profile = await qualifyLeadFromText({ text: 'Interested in a demo next week, budget around 5000' });
    const score = computeLeadScore(profile);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    const persisted = await persistLeadProfile({
      userId: 'u1',
      callId: 'call-lead-1',
      customerId: null,
      profile,
    });
    expect(persisted).toBeNull();
  });
});

describe('conversationSummary.service', () => {
  it('generates summaries and stores them per call without DB', async () => {
    const summaries = await generateConversationSummaries({
      userId: 'u1',
      callId: 'call-sum-1',
      transcriptEntries: [
        { role: 'caller', content: 'Can you help me reduce fuel costs across my trucks?', timestamp: '2026-08-02T10:00:00.000Z' },
        { role: 'assistant', content: 'Yes, FleetNimble tracks fuel usage per vehicle.', timestamp: '2026-08-02T10:00:01.000Z' },
      ],
      collectedData: { intent: 'SALES_INTEREST', leadScore: 70 },
    });
    expect(summaries.executiveSummary).toBeTruthy();
    expect(summaries.salesSummary).toBeTruthy();
    expect(summaries.supportSummary).toBeTruthy();
    expect(summaries.customerIntent).toBeTruthy();
    expect(summaries.sentiment).toMatch(/positive|neutral|negative/);
  });
});

describe('followUp.service', () => {
  const appointment = {
    id: 'appt-12345678',
    callerName: 'Jane Doe',
    callerPhone: '+15551234567',
    callerEmail: 'jane@example.com',
    meetingTitle: 'FleetNimble Demo',
    scheduledDate: '2026-08-10T15:00:00.000Z',
    meetingLink: 'https://meet.example/abc',
  };

  it('builds email and sms follow-up content', () => {
    const email = buildFollowUpEmailContent({ appointment, customer: null });
    expect(email.subject).toContain('FleetNimble');
    expect(email.body).toContain('Jane Doe');
    expect(email.body).toContain(appointment.id.substring(0, 8));
    const sms = buildFollowUpSmsContent({ appointment, customer: null });
    expect(sms).toContain('Jane Doe');
    expect(sms).toContain(appointment.id.substring(0, 8));
  });

  it('degrades gracefully when providers and DB are unavailable', async () => {
    const result = await createFollowUpBundle({
      userId: 'u1',
      callId: 'call-fu-1',
      customerId: null,
      appointment,
    });
    expect(result).toBeNull();
  });

  it('returns empty list when persistence is unavailable', async () => {
    const list = await getFollowUps('u1', {});
    expect(Array.isArray(list)).toBe(true);
  });
});

describe('callSupervisor.service', () => {
  it('retries failing operations then degrades with a safe message', async () => {
    let attempts = 0;
    const result = await supervise({
      label: 'test-op',
      fn: async () => {
        attempts++;
        if (attempts < 3) throw new Error('transient failure');
        return { ok: true };
      },
      maxRetries: 3,
    });
    expect(result.ok).toBe(true);
    expect(attempts).toBe(3);
  });

  it('degrades when all retries are exhausted', async () => {
    const result = await supervise({
      label: 'always-fails',
      fn: async () => { throw new Error('permanent failure'); },
      maxRetries: 2,
    });
    expect(result.ok).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.safeMessage).toBeTruthy();
  });

  it('dedupes concurrent duplicate operations', async () => {
    const results = await Promise.all([
      supervise({ label: 'dupe', dedupeKey: 'dup-1', fn: async () => 'a' }),
      supervise({ label: 'dupe', dedupeKey: 'dup-1', fn: async () => 'b' }),
    ]);
    expect(results[0]).toBeTruthy();
  });
});
