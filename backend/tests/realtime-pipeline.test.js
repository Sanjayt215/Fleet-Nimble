import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RealtimeModelValidator } from '../src/services/realtimeModelValidator.js';
import { RealtimeSessionManager } from '../src/services/realtimeSessionManager.js';

describe('RealtimeModelValidator', () => {
  beforeEach(() => {
    RealtimeModelValidator.clearCache();
  });

  it('accepts gpt-4o-realtime-preview', () => {
    const r = RealtimeModelValidator.validate('gpt-4o-realtime-preview');
    expect(r.valid).toBe(true);
    expect(r.model).toBe('gpt-4o-realtime-preview');
  });

  it('accepts gpt-4o-mini-realtime-preview', () => {
    const r = RealtimeModelValidator.validate('gpt-4o-mini-realtime-preview');
    expect(r.valid).toBe(true);
  });

  it('accepts gpt-realtime-2.1 (future model)', () => {
    const r = RealtimeModelValidator.validate('gpt-realtime-2.1');
    expect(r.valid).toBe(true);
  });

  it('accepts gpt-5-realtime (future model)', () => {
    const r = RealtimeModelValidator.validate('gpt-5-realtime');
    expect(r.valid).toBe(true);
  });

  it('accepts o4-mini-realtime (future model)', () => {
    const r = RealtimeModelValidator.validate('o4-mini-realtime');
    expect(r.valid).toBe(true);
  });

  it('rejects empty string', () => {
    const r = RealtimeModelValidator.validate('');
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('empty_or_whitespace');
  });

  it('rejects null', () => {
    const r = RealtimeModelValidator.validate(null);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('empty_or_whitespace');
  });

  it('rejects undefined', () => {
    const r = RealtimeModelValidator.validate(undefined);
    expect(r.valid).toBe(false);
  });

  it('rejects whitespace-only string', () => {
    const r = RealtimeModelValidator.validate('   ');
    expect(r.valid).toBe(false);
  });

  it('caches failed models', () => {
    RealtimeModelValidator.markFailed('gpt-broken', 'model_not_found');
    const r = RealtimeModelValidator.validate('gpt-broken');
    expect(r.valid).toBe(false);
    expect(r.cached).toBe(true);
  });

  it('clears cache on clearCache()', () => {
    RealtimeModelValidator.markFailed('gpt-broken', 'model_not_found');
    RealtimeModelValidator.clearCache();
    const r = RealtimeModelValidator.validate('gpt-broken');
    expect(r.valid).toBe(true);
  });

  it('marks succeeded after successful session.created', () => {
    RealtimeModelValidator.markFailed('gpt-broken', 'model_not_found');
    RealtimeModelValidator.markSucceeded('gpt-broken');
    const r = RealtimeModelValidator.validate('gpt-broken');
    expect(r.valid).toBe(true);
  });
});

describe('RealtimeSessionManager', () => {
  beforeEach(() => {
    RealtimeSessionManager.clearAll();
  });

  it('creates session with IDLE state', () => {
    const ws = { readyState: 1 };
    const s = RealtimeSessionManager.create('CA001', ws, { from: '+1234' });
    expect(s.callSid).toBe('CA001');
    expect(s.twilioSocket).toBe(ws);
    expect(s.state).toBe(RealtimeSessionManager.STATES.IDLE);
    expect(s.greetingSent).toBe(false);
    expect(s.closed).toBe(false);
    expect(s.startedAt).toBeGreaterThan(0);
    expect(s.metadata.from).toBe('+1234');
  });

  it('returns null for non-existent session', () => {
    expect(RealtimeSessionManager.get('NONEXISTENT')).toBeNull();
  });

  it('retrieves session by callSid', () => {
    RealtimeSessionManager.create('CA002', { readyState: 1 });
    expect(RealtimeSessionManager.get('CA002')).toBeDefined();
    expect(RealtimeSessionManager.get('CA002').callSid).toBe('CA002');
  });

  it('warns and returns existing session on duplicate create', () => {
    RealtimeSessionManager.create('CA003', { readyState: 1 });
    const s2 = RealtimeSessionManager.create('CA003', { readyState: 1 });
    expect(s2.callSid).toBe('CA003');
  });

  it('removes session and sets CLOSED state', () => {
    RealtimeSessionManager.create('CA004', { readyState: 1 });
    const removed = RealtimeSessionManager.remove('CA004');
    expect(removed.state).toBe(RealtimeSessionManager.STATES.CLOSED);
    expect(removed.closed).toBe(true);
    expect(RealtimeSessionManager.get('CA004')).toBeNull();
  });

  it('tracks state transitions', () => {
    const s = RealtimeSessionManager.create('CA005', { readyState: 1 });
    expect(s.state).toBe(RealtimeSessionManager.STATES.IDLE);
    s.setState(RealtimeSessionManager.STATES.CONNECTING);
    expect(s.state).toBe(RealtimeSessionManager.STATES.CONNECTING);
    s.setState(RealtimeSessionManager.STATES.CONNECTED);
    expect(s.state).toBe(RealtimeSessionManager.STATES.CONNECTED);
    s.setState(RealtimeSessionManager.STATES.GREETING);
    expect(s.state).toBe(RealtimeSessionManager.STATES.GREETING);
    s.setState(RealtimeSessionManager.STATES.LISTENING);
    expect(s.state).toBe(RealtimeSessionManager.STATES.LISTENING);
    s.setState(RealtimeSessionManager.STATES.RESPONDING);
    expect(s.state).toBe(RealtimeSessionManager.STATES.RESPONDING);
    s.setState(RealtimeSessionManager.STATES.CLOSING);
    expect(s.state).toBe(RealtimeSessionManager.STATES.CLOSING);
    s.setState(RealtimeSessionManager.STATES.CLOSED);
    expect(s.state).toBe(RealtimeSessionManager.STATES.CLOSED);
  });

  it('detects expired sessions', () => {
    const s = RealtimeSessionManager.create('CA006', { readyState: 1 });
    expect(s.isExpired(-1)).toBe(true);
    expect(s.isExpired(1000000)).toBe(false);
  });

  it('cleanup removes expired sessions', () => {
    RealtimeSessionManager.create('CA007', { readyState: 1 });
    RealtimeSessionManager.create('CA008', { readyState: 1 });
    expect(RealtimeSessionManager.getCount()).toBe(2);
    const cleaned = RealtimeSessionManager.cleanup(-1);
    expect(cleaned).toBe(2);
    expect(RealtimeSessionManager.getCount()).toBe(0);
  });

  it('getAll returns all sessions', () => {
    RealtimeSessionManager.create('CA009', { readyState: 1 });
    RealtimeSessionManager.create('CA010', { readyState: 1 });
    expect(RealtimeSessionManager.getAll().length).toBe(2);
  });

  it('getCount returns correct count', () => {
    expect(RealtimeSessionManager.getCount()).toBe(0);
    RealtimeSessionManager.create('CA011', { readyState: 1 });
    expect(RealtimeSessionManager.getCount()).toBe(1);
  });

  it('tracks metrics', () => {
    const s = RealtimeSessionManager.create('CA012', { readyState: 1 });
    s.audioBytesReceived = 1000;
    s.audioBytesSent = 500;
    s.packetsReceived = 10;
    s.packetsSent = 5;
    s.droppedPackets = 1;
    s.reconnectCount = 2;
    s.addLatencySample(100);
    s.addLatencySample(200);
    expect(s.getAverageLatency()).toBe(150);
    expect(s.audioBytesReceived).toBe(1000);
    expect(s.audioBytesSent).toBe(500);
    expect(s.packetsReceived).toBe(10);
    expect(s.packetsSent).toBe(5);
    expect(s.droppedPackets).toBe(1);
    expect(s.reconnectCount).toBe(2);
  });

  it('toJSON excludes socket references', () => {
    const ws = { readyState: 1, send: () => {} };
    const s = RealtimeSessionManager.create('CA013', ws);
    const json = s.toJSON();
    expect(json.callSid).toBe('CA013');
    expect(json.state).toBe(RealtimeSessionManager.STATES.IDLE);
    expect(json.twilioSocket).toBeUndefined();
    expect(json.openAiSocket).toBeUndefined();
    expect(json.duration).toBeGreaterThanOrEqual(0);
  });

  it('getMetrics returns aggregate', () => {
    const s1 = RealtimeSessionManager.create('CA014', { readyState: 1 });
    s1.audioBytesReceived = 500;
    s1.audioBytesSent = 300;
    const s2 = RealtimeSessionManager.create('CA015', { readyState: 1 });
    s2.audioBytesReceived = 700;
    s2.audioBytesSent = 200;
    s2.droppedPackets = 1;
    const metrics = RealtimeSessionManager.getMetrics();
    expect(metrics.activeCalls).toBe(2);
    expect(metrics.totalAudioBytesReceived).toBe(1200);
    expect(metrics.totalAudioBytesSent).toBe(500);
    expect(metrics.totalDroppedPackets).toBe(1);
  });

  it('greetingSent flag prevents duplicate greeting', () => {
    const s = RealtimeSessionManager.create('CA016', { readyState: 1 });
    expect(s.greetingSent).toBe(false);
    s.greetingSent = true;
    expect(s.greetingSent).toBe(true);
  });
});
