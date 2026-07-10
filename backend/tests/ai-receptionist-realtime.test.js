import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';

// ── Mock the 'ws' module so the handler uses a controllable fake socket ──
const openaiSockets = [];
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
    openaiSockets.push(this);
    this.on('open', () => { this.readyState = FakeWebSocket.OPEN; });
    this.on('close', () => { this.readyState = FakeWebSocket.CLOSED; });
    if (throwOnConstruct) {
      throw new Error('openai connect failure');
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
  config.openai.apiKey = ready ? 'sk-test-key' : '';
  config.realtime.configured = ready;
  config.realtime.mediaStreamEnabled = ready;
  config.realtime.model = 'gpt-4o-realtime-preview';
}

beforeEach(() => {
  openaiSockets.length = 0;
  throwOnConstruct = false;
  setRealtimeReady(true);
  config.realtime.maxCallSeconds = 600;
  config.realtime.silenceTimeoutSeconds = 30;
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
    expect(twiml).not.toContain('<Say');
    expect(twiml).not.toContain('<Hangup');
  });
});

describe('Twilio media events', () => {
  it('handles connected event without starting business logic', () => {
    const ws = makeFakeTwilioWs();
    handleMediaStream(ws, { url: '/api/ai-receptionist/twilio/media-stream?callSid=CA123' });
    expect(() => ws.emit('message', JSON.stringify({ event: 'connected' }))).not.toThrow();
  });

  it('handles start event and connects to OpenAI with greeting + g711 format', () => {
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

    expect(openaiSockets.length).toBe(1);
    const openai = openaiSockets[0];
    openai.emit('open');

    const sessionUpdate = openai.sent.find((m) => m.includes('session.update'));
    expect(sessionUpdate).toBeDefined();
    expect(sessionUpdate).toContain('g711_ulaw');
    expect(sessionUpdate).toContain('server_vad');

    // Greeting is deferred until session.created (Phase 6).
    expect(openai.sent.find((m) => m.includes('response.create'))).toBeUndefined();

    openai.emit('message', JSON.stringify({
      type: 'session.created',
      session: { id: 'sess_123', model: 'gpt-4o-realtime-preview' },
    }));

    const greeting = openai.sent.find((m) => m.includes('response.create'));
    expect(greeting).toBeDefined();
    expect(greeting).toContain('FleetNimble AI Receptionist');
    expect(getSession('CA123')).toBeDefined();
  });

  it('forwards Twilio media payload to OpenAI as input_audio_buffer.append', () => {
    const ws = makeFakeTwilioWs();
    handleMediaStream(ws, { url: '/api/ai-receptionist/twilio/media-stream?callSid=CA123' });
    ws.emit('message', JSON.stringify({
      event: 'start',
      start: { streamSid: 'MZ123', callSid: 'CA123', customParameters: { callSid: 'CA123' } },
    }));
    const openai = openaiSockets[0];
    openai.emit('open');

    ws.emit('message', JSON.stringify({ event: 'media', streamSid: 'MZ123', media: { payload: 'BASE64AUDIO' } }));
    const forwarded = openai.sent.find((m) => m.includes('input_audio_buffer.append'));
    expect(forwarded).toBeDefined();
    expect(forwarded).toContain('BASE64AUDIO');
  });

  it('forwards OpenAI audio deltas back to Twilio as media events', () => {
    const ws = makeFakeTwilioWs();
    handleMediaStream(ws, { url: '/api/ai-receptionist/twilio/media-stream?callSid=CA123' });
    ws.emit('message', JSON.stringify({
      event: 'start',
      start: { streamSid: 'MZ123', callSid: 'CA123', customParameters: { callSid: 'CA123' } },
    }));
    const openai = openaiSockets[0];
    openai.emit('open');

    openai.emit('message', JSON.stringify({ type: 'response.audio.delta', delta: 'DELTA64' }));
    const media = ws.sent.find((m) => m.includes('"event":"media"'));
    expect(media).toBeDefined();
    expect(media).toContain('DELTA64');
  });

  it('cleans up session on stop and closes the Twilio socket', () => {
    const ws = makeFakeTwilioWs();
    handleMediaStream(ws, { url: '/api/ai-receptionist/twilio/media-stream?callSid=CA123' });
    ws.emit('message', JSON.stringify({
      event: 'start',
      start: { streamSid: 'MZ123', callSid: 'CA123', customParameters: { callSid: 'CA123' } },
    }));
    expect(getSession('CA123')).toBeDefined();

    ws.emit('message', JSON.stringify({ event: 'stop' }));
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
  it('falls back gracefully when realtime is not configured', () => {
    setRealtimeReady(false);
    const ws = makeFakeTwilioWs();
    handleMediaStream(ws, { url: '/api/ai-receptionist/twilio/media-stream?callSid=CA123' });
    ws.emit('message', JSON.stringify({
      event: 'start',
      start: { streamSid: 'MZ123', callSid: 'CA123', customParameters: { callSid: 'CA123' } },
    }));
    expect(openaiSockets.length).toBe(0);
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('falls back gracefully on OpenAI connection error', () => {
    throwOnConstruct = true;
    const ws = makeFakeTwilioWs();
    handleMediaStream(ws, { url: '/api/ai-receptionist/twilio/media-stream?callSid=CA123' });
    ws.emit('message', JSON.stringify({
      event: 'start',
      start: { streamSid: 'MZ123', callSid: 'CA123', customParameters: { callSid: 'CA123' } },
    }));
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
