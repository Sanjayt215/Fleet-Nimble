import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';

// ── Mock the 'ws' module so the handler uses a controllable fake socket ──
const geminiSockets = [];
let throwOnConstruct = false;

class FakeWebSocket extends EventEmitter {
  static OPEN = 1;
  static CLOSED = 3;
  static CONNECTING = 0;

  constructor(url, opts) {
    super();
    this.url = url;
    this.opts = opts;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    if (url && url.includes('generativelanguage.googleapis.com')) {
      geminiSockets.push(this);
    }
    this.on('open', () => { this.readyState = FakeWebSocket.OPEN; });
    this.on('close', () => { this.readyState = FakeWebSocket.CLOSED; });
    if (throwOnConstruct) {
      throw new Error('gemini connect failure');
    }
  }

  send(data) {
    this.sent.push(data);
  }

  close(code, reason) {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close', code ?? 1000, reason ?? 'client');
  }
}

vi.mock('ws', () => ({
  default: FakeWebSocket,
  WebSocketServer: class extends EventEmitter {},
}));

vi.mock('../src/services/receptionistOrchestrator.service.js', () => ({
  createCallRecord: vi.fn().mockResolvedValue({ id: 'mock-call-id' }),
  updateCallRecordAtEnd: vi.fn().mockResolvedValue(),
  updateCRMAfterCall: vi.fn().mockResolvedValue(),
  lookupCustomerByPhone: vi.fn().mockResolvedValue(null),
  executeAppointmentCreation: vi.fn().mockResolvedValue({ actionResult: null, reply: 'mock' }),
  executeSupportTicketCreation: vi.fn().mockResolvedValue({ actionResult: null, reply: 'mock' }),
}));

const { handleMediaStream } = await import('../src/services/mediaStreamHandler.js');
const { config } = await import('../src/config/index.js');
const { getSession, removeSession } = await import('../src/services/receptionistRealtime.service.js');
const { RealtimeSessionManager } = await import('../src/services/realtimeSessionManager.js');
const {
  buildSystemPrompt,
  buildGreetingMessage,
  isBookingConfirmationRequest,
  AI_RECEPTIONIST_GREETING,
} = await import('../src/services/receptionistVoice.service.js');
const providerHealth = await import('../src/services/receptionistProviderHealth.service.js');
const orchestrator = await import('../src/services/receptionistOrchestrator.service.js');
const logger = (await import('../src/utils/logger.js')).default;

function makeFakeTwilioWs() {
  const ws = new EventEmitter();
  ws.readyState = FakeWebSocket.OPEN;
  ws.sent = [];
  ws.send = (data) => ws.sent.push(data);
  ws.close = () => { ws.readyState = FakeWebSocket.CLOSED; ws.emit('close', 1000, 'client'); };
  return ws;
}

function setRealtimeReady(ready) {
  config.gemini.apiKey = ready ? 'AIza-test-key' : '';
  config.gemini.liveModel = ready ? 'gemini-3.1-flash-live-preview' : '';
  config.realtime.configured = ready;
  config.realtime.mediaStreamEnabled = ready;
  config.realtime.model = 'gemini-3.1-flash-live-preview';
  config.realtimeProvider.provider = 'gemini';
  config.realtimeProvider.geminiEnabled = ready;
}

function startCall(ws, callSid = 'CA123') {
  handleMediaStream(ws, { url: `/api/ai-receptionist/twilio/media-stream?callSid=${callSid}` });
  ws.emit('message', JSON.stringify({
    event: 'start',
    start: {
      streamSid: 'MZ123',
      callSid,
      customParameters: { callSid, from: '+919876543210', to: '+1XXXXXXXXXX' },
    },
  }));
}

async function readyGemini(ws, gemini) {
  gemini.emit('open');
  await new Promise(resolve => setImmediate(resolve));
  gemini.emit('message', JSON.stringify({ setupComplete: true }));
  await new Promise(resolve => setImmediate(resolve));
}

function greetingTextFrom(gemini) {
  const msg = (gemini.sent || [])
    .map((m) => { try { return JSON.parse(m); } catch { return null; } })
    .find((m) => m && m.realtimeInput && typeof m.realtimeInput.text === 'string');
  return msg ? msg.realtimeInput.text : null;
}

beforeEach(() => {
  geminiSockets.length = 0;
  throwOnConstruct = false;
  setRealtimeReady(true);
  config.realtime.maxCallSeconds = 600;
  config.realtime.silenceTimeoutSeconds = 30;
  config.twilio.accountSid = '';
  config.twilio.authToken = '';
  config.twilio.phoneNumber = '';
  providerHealth.clearState();
});

afterEach(() => {
  removeSession('CA123');
  setRealtimeReady(false);
});

// ────────────────────────────────────────────────────────────────────────────
// TEST 1 + 2: New call → greeting is the first AI response, no detail requests
// ────────────────────────────────────────────────────────────────────────────
describe('Realtime greeting is the first AI response', () => {
  it('sends a warm FleetNimble greeting as the first provider message after setup', async () => {
    const ws = makeFakeTwilioWs();
    startCall(ws, 'CA123');
    const gemini = geminiSockets[0];
    await readyGemini(ws, gemini);

    const greeting = greetingTextFrom(gemini);
    expect(greeting).toBeTruthy();
    expect(greeting).toContain('Thank you for calling FleetNimble');
    expect(greeting).toContain('AI Receptionist');
    expect(greeting).toContain('How can I help you today');
  });

  it('greeting does not ask for name, company, phone, email, or fleet size', async () => {
    const ws = makeFakeTwilioWs();
    startCall(ws, 'CA123');
    const gemini = geminiSockets[0];
    await readyGemini(ws, gemini);

    const greeting = greetingTextFrom(gemini);
    expect(greeting).toBeTruthy();
    expect(greeting).not.toMatch(/your name/i);
    expect(greeting).not.toMatch(/company/i);
    expect(greeting).not.toMatch(/phone number/i);
    expect(greeting).not.toMatch(/email/i);
    expect(greeting).not.toMatch(/fleet size/i);
  });

  it('nothing is sent to Gemini before the greeting (no pre-greeting turns)', async () => {
    const ws = makeFakeTwilioWs();
    startCall(ws, 'CA123');
    const gemini = geminiSockets[0];
    await readyGemini(ws, gemini);

    const textMessages = (gemini.sent || [])
      .map((m) => { try { return JSON.parse(m); } catch { return null; } })
      .filter((m) => m && m.realtimeInput && typeof m.realtimeInput.text === 'string');
    expect(textMessages.length).toBe(1);
    expect(textMessages[0].realtimeInput.text).toContain('Thank you for calling FleetNimble');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// TEST 4: Greeting occurs only once per CallSid
// ────────────────────────────────────────────────────────────────────────────
describe('Greeting occurs exactly once per call', () => {
  it('duplicate ready (second setupComplete) does not re-send the greeting', async () => {
    const ws = makeFakeTwilioWs();
    startCall(ws, 'CA123');
    const gemini = geminiSockets[0];
    await readyGemini(ws, gemini);
    expect(greetingTextFrom(gemini)).toBeTruthy();

    gemini.emit('message', JSON.stringify({ setupComplete: true }));
    await new Promise(resolve => setImmediate(resolve));

    const textMessages = (gemini.sent || [])
      .map((m) => { try { return JSON.parse(m); } catch { return null; } })
      .filter((m) => m && m.realtimeInput && typeof m.realtimeInput.text === 'string');
    expect(textMessages.length).toBe(1);
  });

  it('session records greetingState NOT_STARTED → PLAYING → COMPLETED', async () => {
    const ws = makeFakeTwilioWs();
    startCall(ws, 'CA123');
    const gemini = geminiSockets[0];

    expect(RealtimeSessionManager.get('CA123').greetingState)
      .toBe(RealtimeSessionManager.GREETING_STATES.NOT_STARTED);

    await readyGemini(ws, gemini);
    const session = RealtimeSessionManager.get('CA123');
    expect(session.greetingState).toBe(RealtimeSessionManager.GREETING_STATES.PLAYING);
    expect(session.state).toBe(RealtimeSessionManager.STATES.GREETING);

    // Greeting audio arrives → still PLAYING (audio streaming)
    gemini.emit('message', JSON.stringify({
      serverContent: {
        modelTurn: {
          parts: [{
            inlineData: { data: 'DELTA64', mimeType: 'audio/pcm;rate=24000' },
          }],
        },
      },
    }));
    await new Promise(resolve => setImmediate(resolve));
    expect(session.greetingAudioReceived).toBe(true);
    expect(session.greetingState).toBe(RealtimeSessionManager.GREETING_STATES.PLAYING);

    // Greeting turn completes → COMPLETED and back to LISTENING
    gemini.emit('message', JSON.stringify({
      serverContent: { turnComplete: true },
    }));
    await new Promise(resolve => setImmediate(resolve));
    expect(session.greetingState).toBe(RealtimeSessionManager.GREETING_STATES.COMPLETED);
    expect(session.state).toBe(RealtimeSessionManager.STATES.LISTENING);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// TEST 3: Caller interrupts the greeting → agent stops and responds naturally
// ────────────────────────────────────────────────────────────────────────────
describe('Greeting interruption', () => {
  it('speechStarted during greeting marks greeting COMPLETED and cancels the response', async () => {
    const ws = makeFakeTwilioWs();
    startCall(ws, 'CA123');
    const gemini = geminiSockets[0];
    await readyGemini(ws, gemini);
    const session = RealtimeSessionManager.get('CA123');
    expect(session.greetingState).toBe(RealtimeSessionManager.GREETING_STATES.PLAYING);

    gemini.emit('message', JSON.stringify({ serverContent: { interrupted: true } }));
    await new Promise(resolve => setImmediate(resolve));

    expect(session.greetingState).toBe(RealtimeSessionManager.GREETING_STATES.COMPLETED);
    expect(() => gemini.emit('message', JSON.stringify({
      serverContent: { modelTurn: { parts: [{ text: 'How can I help?' }] } },
    }))).not.toThrow();
  });

  it('greeting remains completed after interruption (never re-sent)', async () => {
    const ws = makeFakeTwilioWs();
    startCall(ws, 'CA123');
    const gemini = geminiSockets[0];
    await readyGemini(ws, gemini);

    gemini.emit('message', JSON.stringify({ serverContent: { interrupted: true } }));
    await new Promise(resolve => setImmediate(resolve));
    gemini.emit('message', JSON.stringify({ setupComplete: true }));
    await new Promise(resolve => setImmediate(resolve));

    const textMessages = (gemini.sent || [])
      .map((m) => { try { return JSON.parse(m); } catch { return null; } })
      .filter((m) => m && m.realtimeInput && typeof m.realtimeInput.text === 'string');
    expect(textMessages.length).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// System prompt guarantees (TEST 5/6/7/10)
// ────────────────────────────────────────────────────────────────────────────
describe('System prompt behavior contract', () => {
  const fakeConfig = {
    businessName: 'FleetNimble',
    realtime: { businessToolsEnabled: true },
  };

  it('mandates a warm greeting on every new call', () => {
    const prompt = buildSystemPrompt(fakeConfig);
    expect(prompt).toContain('Every new call MUST begin with a warm FleetNimble greeting');
    expect(prompt).toContain('Never begin a new call by immediately requesting personal information');
  });

  it('requires answering questions without collecting details (TEST 5)', () => {
    const prompt = buildSystemPrompt(fakeConfig);
    expect(prompt).toMatch(/answer the caller's question directly/i);
    expect(prompt).toMatch(/do not collect personal or business details unless/i);
  });

  it('requires conversational demo detail collection (TEST 6)', () => {
    const prompt = buildSystemPrompt(fakeConfig);
    expect(prompt).toContain('full name, company name, email, phone number, fleet size');
    expect(prompt).toContain('one at a time, conversationally');
    expect(prompt).toContain('Never ask all of them in one robotic block');
  });

  it('requires explicit confirmation before create_appointment (TEST 7)', () => {
    const prompt = buildSystemPrompt(fakeConfig);
    expect(prompt).toContain('read the full details back to the caller');
    expect(prompt).toContain('explicit confirmation before calling create_appointment');
    expect(prompt).toContain('Never call create_appointment until the caller has explicitly confirmed');
    expect(prompt).toContain('Do not silently create appointments');
  });

  it('requires a polite goodbye at the end of the conversation (TEST 10)', () => {
    const prompt = buildSystemPrompt(fakeConfig);
    expect(prompt).toContain('politely say goodbye before the call ends');
  });

  it('never begins by asking for name/company/phone/email/fleet size', () => {
    const prompt = buildSystemPrompt(fakeConfig);
    expect(prompt).not.toMatch(/ask the caller for their name first/i);
    expect(prompt).not.toMatch(/start by asking/i);
  });

  it('handles interruptions naturally (stop speaking and respond)', () => {
    const prompt = buildSystemPrompt(fakeConfig);
    expect(prompt).toMatch(/if the caller interrupts you, stop speaking immediately/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Greeting message builder + confirmation detector
// ────────────────────────────────────────────────────────────────────────────
describe('Greeting message builder', () => {
  it('fresh caller receives the warm standard greeting', () => {
    expect(buildGreetingMessage(null)).toBe(AI_RECEPTIONIST_GREETING);
    expect(AI_RECEPTIONIST_GREETING).toContain('Thank you for calling FleetNimble');
    expect(AI_RECEPTIONIST_GREETING).toContain('How can I help you today?');
  });

  it('returning caller receives a personalized greeting', () => {
    const memory = {
      isReturning: true,
      customer: { name: 'Ravi Kumar' },
    };
    const greeting = buildGreetingMessage(memory);
    expect(greeting).toContain('Welcome back, Ravi Kumar');
    expect(greeting).toContain('FleetNimble');
  });

  it('greeting never requests personal details', () => {
    const greeting = buildGreetingMessage(null);
    expect(greeting).not.toMatch(/your name/i);
    expect(greeting).not.toMatch(/company/i);
    expect(greeting).not.toMatch(/fleet size/i);
    expect(greeting).not.toMatch(/email/i);
  });
});

describe('Booking confirmation request detection', () => {
  it('detects confirmation phrasing', () => {
    expect(isBookingConfirmationRequest('Shall I go ahead and book that for you?')).toBe(true);
    expect(isBookingConfirmationRequest('Perfect. I have your demo request for Ravi from ABC Logistics, with about 25 vehicles, scheduled for Monday at 10:00 AM IST. Shall I go ahead and book that for you?')).toBe(true);
    expect(isBookingConfirmationRequest('I can book this appointment for you, shall I schedule it?')).toBe(true);
    expect(isBookingConfirmationRequest('Should I go ahead and book the demo?')).toBe(true);
  });

  it('ignores non-confirmation utterances', () => {
    expect(isBookingConfirmationRequest('What is your name?')).toBe(false);
    expect(isBookingConfirmationRequest('How can I help you today?')).toBe(false);
    expect(isBookingConfirmationRequest('The demo is scheduled for Monday.')).toBe(false);
    expect(isBookingConfirmationRequest('')).toBe(false);
    expect(isBookingConfirmationRequest(null)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Full lifecycle: greeting → details → confirmation → booking → goodbye
// ────────────────────────────────────────────────────────────────────────────
describe('Full call lifecycle e2e (greeting → demo → confirm → book → goodbye)', () => {
  let loggerSpy;

  beforeEach(() => {
    loggerSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.mocked(orchestrator.executeAppointmentCreation).mockResolvedValue({
      success: true,
      actionResult: { id: 'appt-e2e-1', type: 'appointment' },
      customerId: 'cust-e2e-1',
      reply: "You're all set, your demo is scheduled.",
    });
  });

  afterEach(() => {
    loggerSpy.mockRestore();
  });

  function logMarkers() {
    return (loggerSpy.mock.calls || []).map((call) => call[0]);
  }

  it('runs the full booking lifecycle and emits all lifecycle logs in order', async () => {
    const ws = makeFakeTwilioWs();
    startCall(ws, 'CA123');
    const gemini = geminiSockets[0];
    await readyGemini(ws, gemini);

    expect(logMarkers()).toContain('RECEPTIONIST_CALL_STARTED');
    expect(logMarkers()).toContain('RECEPTIONIST_GREETING_STARTED');
    expect(greetingTextFrom(gemini)).toContain('Thank you for calling FleetNimble');

    // Caller speaks details → Gemini asks for explicit confirmation
    gemini.emit('message', JSON.stringify({
      serverContent: { interrupted: true },
    }));
    await new Promise(resolve => setImmediate(resolve));
    gemini.emit('message', JSON.stringify({
      serverContent: {
        modelTurn: {
          parts: [{
            text: 'Great, I have all your details: Ravi Kumar, ABC Logistics, 25 vehicles, Monday 10:00 AM IST. Shall I go ahead and book that demo for you?',
          }],
        },
        turnComplete: true,
      },
    }));
    await new Promise(resolve => setImmediate(resolve));
    expect(logMarkers()).toContain('RECEPTIONIST_GREETING_COMPLETED');
    expect(logMarkers()).toContain('RECEPTIONIST_BOOKING_CONFIRMATION_REQUESTED');

    // Caller confirms → Gemini calls create_appointment
    gemini.emit('message', JSON.stringify({
      toolCall: {
        functionCalls: [{
          id: 'fc-booking-1',
          name: 'create_appointment',
          args: {
            callerName: 'Ravi Kumar',
            companyName: 'ABC Logistics',
            fleetSize: 25,
            email: 'ravi@abc-logistics.com',
            phone: '+919876543210',
            meetingPurpose: 'Product demo',
            preferredDate: '2026-08-17',
            preferredTime: '10:00',
            timezone: 'Asia/Kolkata',
          },
        }],
      },
    }));
    await new Promise(resolve => setImmediate(resolve));

    expect(logMarkers()).toContain('RECEPTIONIST_INTENT_DETECTED');
    expect(logMarkers()).toContain('RECEPTIONIST_DETAILS_UPDATED');
    expect(logMarkers()).toContain('RECEPTIONIST_BOOKING_CREATED');
    expect(logMarkers()).toContain('RECEPTIONIST_CUSTOMER_PERSISTED');
    expect(orchestrator.executeAppointmentCreation).toHaveBeenCalled();

    const sentToolResults = (gemini.sent || [])
      .map((m) => { try { return JSON.parse(m); } catch { return null; } })
      .filter((m) => m && m.toolResponse && Array.isArray(m.toolResponse.functionResponses));
    expect(sentToolResults.length).toBe(1);
    expect(sentToolResults[0].toolResponse.functionResponses[0].name).toBe('create_appointment');
    expect(sentToolResults[0].toolResponse.functionResponses[0].response.success).toBe(true);

    // Booking confirmed → agent ends call with a goodbye
    gemini.emit('message', JSON.stringify({
      toolCall: {
        functionCalls: [{
          id: 'fc-end-1',
          name: 'end_call',
          args: { reason: 'caller_done' },
        }],
      },
    }));
    await new Promise(resolve => setTimeout(resolve, 4500));

    expect(logMarkers()).toContain('RECEPTIONIST_GOODBYE_STARTED');
    expect(logMarkers()).toContain('RECEPTIONIST_CALL_COMPLETED');
    expect(logMarkers().indexOf('RECEPTIONIST_CALL_STARTED'))
      .toBeLessThan(logMarkers().indexOf('RECEPTIONIST_CALL_COMPLETED'));
  });
});
