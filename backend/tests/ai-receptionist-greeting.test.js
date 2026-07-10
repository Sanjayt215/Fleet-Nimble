import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import http from 'node:http';
import crypto from 'node:crypto';
import app from '../src/app.js';
import { config } from '../src/config/index.js';

// Replicates Twilio's RequestValidator HMAC-SHA1 signature so we can test valid signatures.
function buildTwilioSignature(authToken, url, params) {
  let data = url;
  if (params) {
    Object.keys(params)
      .sort()
      .forEach((key) => {
        data += key + params[key];
      });
  }
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}


let server;
let baseURL;

beforeAll(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseURL = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server.close();
});

const saved = {
  env: config.env,
  twilio: { ...config.twilio },
  aiReceptionist: { ...config.aiReceptionist },
};

afterEach(() => {
  config.env = saved.env;
  config.twilio = { ...saved.twilio };
  config.aiReceptionist = { ...saved.aiReceptionist };
});

async function postForm(path, body = {}, headers = {}) {
  const params = new URLSearchParams(body).toString();
  const res = await fetch(baseURL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: params,
  });
  const text = await res.text();
  return { status: res.status, contentType: res.headers.get('content-type'), text };
}

describe('AI Receptionist health endpoint', () => {
  it('returns 200 with safe module shape and no secrets', async () => {
    const res = await fetch(baseURL + '/api/ai-receptionist/health');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.module).toBe('ai-receptionist');
    expect(data.twilioConfigured).toBeTypeOf('boolean');
    expect(data.phoneConfigured).toBeTypeOf('boolean');
    expect(data.voiceMode).toBeDefined();
    expect(data.realtimeConnected).toBe(false);
    expect(data.mediaStreamEnabled).toBe(false);
    const body = JSON.stringify(data);
    expect(body).not.toContain(config.twilio.accountSid);
    expect(body).not.toContain(config.twilio.authToken);
    expect(body).not.toContain(config.twilio.phoneNumber);
  });
});

describe('Incoming call voice webhook (milestone 1)', () => {
  it('returns 200 with text/xml TwiML', async () => {
    const { status, contentType } = await postForm('/api/ai-receptionist/twilio/voice', {
      CallSid: 'CA123',
      From: '+919876543210',
      To: '+1XXXXXXXXXX',
    });
    expect(status).toBe(200);
    expect(contentType).toContain('text/xml');
  });

  it('returns valid TwiML containing greeting and Hangup (no JSON)', async () => {
    const { status, contentType, text } = await postForm('/api/ai-receptionist/twilio/voice', {
      CallSid: 'CA123',
      From: '+919876543210',
      To: '+1XXXXXXXXXX',
    });
    expect(status).toBe(200);
    expect(contentType).toContain('text/xml');
    expect(text).toContain('<?xml');
    expect(text).toContain('<Say');
    expect(text).toContain('FleetNimble');
    expect(text).toContain('<Hangup');
    expect(text).not.toContain('<Connect');
    expect(text).not.toContain('<Stream');
  });
});

describe('Fallback webhook', () => {
  it('returns valid XML TwiML', async () => {
    const { status, contentType, text } = await postForm('/api/ai-receptionist/twilio/fallback');
    expect(status).toBe(200);
    expect(contentType).toContain('text/xml');
    expect(text).toContain('<?xml');
    expect(text).toContain('<Say');
    expect(text).toContain('try again later');
    expect(text).toContain('<Hangup');
  });
});

describe('Status callback webhook', () => {
  it('returns 204 No Content', async () => {
    const { status } = await postForm('/api/ai-receptionist/twilio/status', {
      CallSid: 'CA123',
      CallStatus: 'completed',
      CallDuration: '12',
    });
    expect(status).toBe(204);
  });

  it('does not crash when optional fields are missing', async () => {
    const { status } = await postForm('/api/ai-receptionist/twilio/status', {});
    expect(status).toBe(204);
  });
});

describe('Twilio signature validation (production)', () => {
  it('returns 403 for an invalid signature', async () => {
    config.env = 'production';
    config.twilio.authToken = 'test-token';
    config.twilio.configured = true;
    config.twilio.validateSignature = true;
    config.publicUrl = baseURL;
    config.aiReceptionist.enabled = true;

    const { status } = await postForm(
      '/api/ai-receptionist/twilio/voice',
      { CallSid: 'CA123', From: '+919876543210', To: '+1XXXXXXXXXX' },
      { 'X-Twilio-Signature': 'deadbeef' }
    );
    expect(status).toBe(403);
  });

  it('returns 200 for a valid signature', async () => {
    config.env = 'production';
    config.twilio.authToken = 'test-token';
    config.twilio.configured = true;
    config.twilio.validateSignature = true;
    config.publicUrl = baseURL;
    config.aiReceptionist.enabled = true;

    const params = { CallSid: 'CA123', From: '+919876543210', To: '+1XXXXXXXXXX' };
    const url = baseURL + '/api/ai-receptionist/twilio/voice';
    const sig = buildTwilioSignature(config.twilio.authToken, url, params);

    const { status, contentType, text } = await postForm(
      '/api/ai-receptionist/twilio/voice',
      params,
      { 'X-Twilio-Signature': sig }
    );
    expect(status).toBe(200);
    expect(contentType).toContain('text/xml');
    expect(text).toContain('FleetNimble');
    expect(text).toContain('<Hangup');
  });
});

describe('Missing Twilio configuration does not crash backend startup', () => {
  it('config resolves safely when env vars are absent', async () => {
    expect(config.twilio).toBeTypeOf('object');
    expect(config.twilio.configured).toBeTypeOf('boolean');
    expect(config.aiReceptionist.enabled).toBeTypeOf('boolean');
    // app already loaded in beforeAll without throwing, proving startup safety.
    expect(server.listening).toBe(true);
  });
});
