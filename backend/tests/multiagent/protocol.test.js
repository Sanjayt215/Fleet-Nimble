import { describe, it, expect } from 'vitest';
import {
  buildTask,
  buildResponse,
  successResponse,
  partialResponse,
  failedResponse,
  skippedResponse,
  validateTask,
  validateResponse,
  idempotencyKeyFrom,
  canonicalize,
  PROTOCOL_VERSION,
  TASK_STATUS,
  RUN_STATUS,
} from '../../src/multiagent/protocol.js';

describe('protocol: task building', () => {
  it('builds a valid task with default idempotency key', () => {
    const task = buildTask({
      runId: 'R-1',
      agentId: 'knowledge',
      taskType: 'retrieve',
      payload: { query: 'pricing' },
      callSid: 'CA1',
    });
    expect(task.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(task.taskId).toMatch(/^T-/);
    expect(task.runId).toBe('R-1');
    expect(task.agent).toBe('knowledge');
    expect(task.task.type).toBe('retrieve');
    expect(task.idempotencyKey).toHaveLength(32);
  });

  it('throws on invalid task (missing agent)', () => {
    expect(() => buildTask({ runId: 'R-1', taskType: 'retrieve' })).toThrow(TypeError);
  });

  it('throws on invalid task (missing task type)', () => {
    expect(() => buildTask({ runId: 'R-1', agentId: 'crm' })).toThrow(TypeError);
  });

  it('validateTask reports structural errors', () => {
    const result = validateTask({ protocolVersion: 99, taskId: null });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('protocol: response building', () => {
  const task = buildTask({ runId: 'R-1', agentId: 'crm', taskType: 'lookup', payload: {} });

  it('builds a success response', () => {
    const response = successResponse(task, { customer: { id: 'c1' } }, { confidence: 0.9 });
    expect(response.status).toBe(TASK_STATUS.SUCCESS);
    expect(response.result.customer.id).toBe('c1');
    expect(response.confidence).toBe(0.9);
    expect(response.error).toBeNull();
  });

  it('builds a partial response with default confidence 0.5', () => {
    const response = partialResponse(task, { reason: 'clarification' });
    expect(response.status).toBe(TASK_STATUS.PARTIAL);
    expect(response.confidence).toBe(0.5);
  });

  it('builds a failed response and requires an error', () => {
    const response = failedResponse(task, new Error('boom'));
    expect(response.status).toBe(TASK_STATUS.FAILED);
    expect(response.error.code).toBe('AGENT_ERROR');
    expect(response.error.message).toBe('boom');
    expect(() => buildResponse({ task, status: TASK_STATUS.FAILED })).toThrow(TypeError);
  });

  it('builds a skipped response', () => {
    const response = skippedResponse(task, 'agent unhealthy');
    expect(response.status).toBe(TASK_STATUS.SKIPPED);
    expect(response.result.reason).toBe('agent unhealthy');
  });

  it('clamps confidence to [0,1]', () => {
    const response = buildResponse({ task, status: TASK_STATUS.SUCCESS, confidence: 5 });
    expect(response.confidence).toBe(1);
  });

  it('rejects invalid status', () => {
    expect(() => buildResponse({ task, status: 'NOPE' })).toThrow(TypeError);
  });

  it('defaults cost fields', () => {
    const response = successResponse(task, { ok: true }, { cost: { ms: 12 } });
    expect(response.cost.llmTokens).toBe(0);
    expect(response.cost.dbQueries).toBe(0);
    expect(response.cost.cacheHits).toBe(0);
    expect(response.cost.ms).toBe(12);
  });
});

describe('protocol: idempotency keys', () => {
  it('is stable for identical inputs', () => {
    const a = idempotencyKeyFrom('scheduling', 'book', { date: '2026-08-03' }, 'CA1');
    const b = idempotencyKeyFrom('scheduling', 'book', { date: '2026-08-03' }, 'CA1');
    expect(a).toBe(b);
  });

  it('differs when payload changes', () => {
    const a = idempotencyKeyFrom('scheduling', 'book', { date: '2026-08-03' }, 'CA1');
    const b = idempotencyKeyFrom('scheduling', 'book', { date: '2026-08-04' }, 'CA1');
    expect(a).not.toBe(b);
  });

  it('differs when agent changes', () => {
    const a = idempotencyKeyFrom('crm', 'book', { date: '2026-08-03' }, 'CA1');
    const b = idempotencyKeyFrom('scheduling', 'book', { date: '2026-08-03' }, 'CA1');
    expect(a).not.toBe(b);
  });

  it('is independent of key order and whitespace', () => {
    const a = idempotencyKeyFrom('knowledge', 'retrieve', { query: '  Fleet Tracking  ' }, 'CA1');
    const b = idempotencyKeyFrom('knowledge', 'retrieve', { query: 'fleet tracking' }, 'CA1');
    expect(a).toBe(b);
  });
});

describe('protocol: canonicalize', () => {
  it('normalizes strings', () => {
    expect(canonicalize('  Hello   World  ')).toBe('hello world');
  });

  it('passes through null/undefined as empty', () => {
    expect(canonicalize(null)).toBe('');
    expect(canonicalize(undefined)).toBe('');
  });
});

describe('protocol: run status constants', () => {
  it('exposes RUN_STATUS', () => {
    expect(RUN_STATUS.RUNNING).toBe('RUNNING');
    expect(RUN_STATUS.SUCCESS).toBe('SUCCESS');
    expect(RUN_STATUS.PARTIAL).toBe('PARTIAL');
    expect(RUN_STATUS.FAILED).toBe('FAILED');
  });
});
