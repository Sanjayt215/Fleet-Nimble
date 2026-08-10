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
    // Only track Gemini Live API connections
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

// Mock orchestrator to avoid real Prisma calls in gracefulClose
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
const twilioWebhook = await import('../src/services/twilioWebhook.service.js');

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

beforeEach(() => {
  geminiSockets.length = 0;
  throwOnConstruct = false;
  setRealtimeReady(true);
  config.realtime.maxCallSeconds = 600;
  config.realtime.silenceTimeoutSeconds = 30;
  // Wipe real Twilio creds so redirectToGreeting/getClient() returns null (no I/O)
  config.twilio.accountSid = '';
  config.twilio.authToken = '';
  config.twilio.phoneNumber = '';
});

afterEach(() => {
  setRealtimeReady(false);
});

describe('HTTPS -> WSS URL conversion', () => {
  it('converts https public URL to wss media-stream URL', () => {
    const url = twilioWebhook.buildMediaStreamUrl('https://fleet-nimble.onrender.com');
    expect(url).toBe('wss://fleet-nimble.onrender.com/api/ai-receptionist/twilio/media-stream');
  });

  it('converts http public URL to ws media-stream URL', () => {
    const url = twilioWebhook.buildMediaStreamUrl('http://localhost:5000');
    expect(url).toBe('ws://localhost:5000/api/ai-receptionist/twilio/media-stream');
  });
});

describe('Streaming TwiML creation', () => {
  it('produces Connect/Stream with call context Parameters and no Say/Hangup', () => {
    const twiml = twilioWebhook.buildIncomingTwiML('CA123', '+919876543210', '+1XXXXXXXXXX', {
      publicUrl: 'https://fleet-nimble.onrender.com',
    });
    expect(twiml).toContain('<Connect>');
    expect(twiml).toContain('<Stream');
    expect(twiml).toContain('wss://fleet-nimble.onrender.com/api/ai-receptionist/twilio/media-stream');
    expect(twiml).toContain('<Parameter name="callSid" value="CA123"');
    expect(twiml).toContain('<Parameter name="from" value="+919876543210"');
    expect(twiml).toContain('<Parameter name="to" value="+1XXXXXXXXXX"');
    expect(twiml).not.toContain('<Say');  // pre-stream greeting removed (VOICE-004)
    expect(twiml).not.toContain('<Hangup');
  });
});

describe('Twilio media events', () => {
  it('handles connected event without starting business logic', () => {
    const ws = makeFakeTwilioWs();
    handleMediaStream(ws, { url: '/api/ai-receptionist/twilio/media-stream?callSid=CA123' });
    expect(() => ws.emit('message', JSON.stringify({ event: 'connected' }))).not.toThrow();
  });

  it('handles start event and connects to Gemini with setup message', async () => {
    const ws = makeFakeTwilioWs();
    handleMediaStream(ws, { url: '/api/ai-receptionist/twilio/media-stream?callSid=CA123' });
    ws.emit('message', JSON.stringify({
      event: 'start',
      start: {
        streamSid: 'MZ123',
        callSid: 'CA123',
        customParameters: { callSid: 'CA123', from: '+919876543210', to: '+1XXXXXXXXXX' },
      },
    }));

    expect(geminiSockets.length).toBe(1);
    const gemini = geminiSockets[0];
    gemini.emit('open');
    // Flush microtask queue to let async buildSystemPrompt complete
    await new Promise(resolve => setImmediate(resolve));

    const setupMessage = gemini.sent.find((m) => m.includes('setup'));
    expect(setupMessage).toBeDefined();
    expect(setupMessage).toContain('gemini-3.1-flash-live-preview');
    expect(setupMessage).toContain('systemInstruction');
    expect(setupMessage).toContain('generationConfig');
    expect(setupMessage).toContain('responseModalities');

    // Send setupComplete to acknowledge the setup
    gemini.emit('message', JSON.stringify({
      setupComplete: true,
    }));

    // Verify session was created
    expect(getSession('CA123')).toBeDefined();
  });

  it('forwards Twilio media payload to Gemini as realtimeInput.audio', () => {
    const ws = makeFakeTwilioWs();
    handleMediaStream(ws, { url: '/api/ai-receptionist/twilio/media-stream?callSid=CA123' });
    ws.emit('message', JSON.stringify({
      event: 'start',
      start: { streamSid: 'MZ123', callSid: 'CA123', customParameters: { callSid: 'CA123' } },
    }));
    const gemini = geminiSockets[0];
    gemini.emit('open');
    gemini.emit('message', JSON.stringify({ setupComplete: true }));

    ws.emit('message', JSON.stringify({ event: 'media', streamSid: 'MZ123', media: { payload: 'BASE64AUDIO' } }));
    const forwarded = gemini.sent.find((m) => m.includes('realtimeInput') && m.includes('audio'));
    expect(forwarded).toBeDefined();
    expect(forwarded).toContain('data');
  });

  it('forwards Gemini audio deltas back to Twilio as media events', () => {
    const ws = makeFakeTwilioWs();
    handleMediaStream(ws, { url: '/api/ai-receptionist/twilio/media-stream?callSid=CA123' });
    ws.emit('message', JSON.stringify({
      event: 'start',
      start: { streamSid: 'MZ123', callSid: 'CA123', customParameters: { callSid: 'CA123' } },
    }));
    const gemini = geminiSockets[0];
    gemini.emit('open');
    gemini.emit('message', JSON.stringify({ setupComplete: true }));

    // Simulate Gemini sending audio via serverContent
    gemini.emit('message', JSON.stringify({
      serverContent: {
        modelTurn: {
          parts: [{
            inlineData: {
              data: 'DELTA64',
              mimeType: 'audio/pcm;rate=24000',
            },
          }],
        },
      },
    }));
    const media = ws.sent.find((m) => m.includes('"event":"media"'));
    expect(media).toBeDefined();
    expect(media).toContain('media');
  });

  it('cleans up session on stop and closes the Twilio socket', async () => {
    const ws = makeFakeTwilioWs();
    handleMediaStream(ws, { url: '/api/ai-receptionist/twilio/media-stream?callSid=CA123' });
    ws.emit('message', JSON.stringify({
      event: 'start',
      start: { streamSid: 'MZ123', callSid: 'CA123', customParameters: { callSid: 'CA123' } },
    }));
    expect(getSession('CA123')).toBeDefined();

    ws.emit('message', JSON.stringify({ event: 'stop' }));
    // gracefulClose is async — flush microtasks so it completes
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(getSession('CA123')).toBeUndefined();
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('handles duplicate stop without error (idempotent cleanup)', () => {
    const ws = makeFakeTwilioWs();
    handleMediaStream(ws, { url: '/api/ai-receptionist/twilio/media-stream?callSid=CA123' });
    ws.emit('message', JSON.stringify({
      event: 'start',
      start: { streamSid: 'MZ123', callSid: 'CA123', customParameters: { callSid: 'CA123' } },
    }));
    ws.emit('message', JSON.stringify({ event: 'stop' }));
    expect(() => ws.emit('message', JSON.stringify({ event: 'stop' }))).not.toThrow();
  });

  it('handles malformed payload without crashing', () => {
    const ws = makeFakeTwilioWs();
    handleMediaStream(ws, { url: '/api/ai-receptionist/twilio/media-stream?callSid=CA123' });
    expect(() => ws.emit('message', 'not-json')).not.toThrow();
    expect(() => ws.emit('message', JSON.stringify({ foo: 'bar' }))).not.toThrow();
  });
});

describe('Realtime configuration and failures', () => {
  it('falls back gracefully when realtime is not configured', async () => {
    setRealtimeReady(false);
    const ws = makeFakeTwilioWs();
    handleMediaStream(ws, { url: '/api/ai-receptionist/twilio/media-stream?callSid=CA123' });
    ws.emit('message', JSON.stringify({
      event: 'start',
      start: { streamSid: 'MZ123', callSid: 'CA123', customParameters: { callSid: 'CA123' } },
    }));
    // connectToGemini calls gracefulClose which is async — flush microtasks
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(geminiSockets.length).toBe(0);
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('falls back gracefully on Gemini connection error', async () => {
    throwOnConstruct = true;
    const ws = makeFakeTwilioWs();
    handleMediaStream(ws, { url: '/api/ai-receptionist/twilio/media-stream?callSid=CA123' });
    ws.emit('message', JSON.stringify({
      event: 'start',
      start: { streamSid: 'MZ123', callSid: 'CA123', customParameters: { callSid: 'CA123' } },
    }));
    // connectToGemini calls gracefulClose which is async — flush microtasks
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('closes cleanly when callSid is missing', () => {
    const ws = makeFakeTwilioWs();
    handleMediaStream(ws, { url: '/api/ai-receptionist/twilio/media-stream' });
    ws.emit('message', JSON.stringify({
      event: 'start',
      start: { streamSid: 'MZ123', customParameters: {} },
    }));
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
  });
});

describe('Socket.IO path is not intercepted', () => {
  it('handler is path-agnostic and safe even with a socket.io-style request url', () => {
    const ws = makeFakeTwilioWs();
    handleMediaStream(ws, { url: '/socket.io/?EIO=4&transport=websocket' });
    expect(() =>
      ws.emit('message', JSON.stringify({
        event: 'start',
        start: { streamSid: 'MZ123', callSid: 'CA123', customParameters: { callSid: 'CA123' } },
      }))
    ).not.toThrow();
  });
});
