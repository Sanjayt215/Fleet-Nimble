import { describe, it, expect } from 'vitest';
import {
  executeWithPolicy,
  policyFor,
  withTimeout,
  degradeResponse,
  FALLBACK_TARGETS,
} from '../../src/multiagent/failurePolicy.js';
import { buildTask, TASK_STATUS } from '../../src/multiagent/protocol.js';

const makeTask = (agentId, type = 't') => buildTask({ runId: 'R-1', agentId, taskType: type, payload: {} });

describe('failure policy', () => {
  it('policyFor gives more retries to llm agents', () => {
    const llmPolicy = policyFor('sales', { kind: 'ANALYST', cost: 'llm' });
    const dataPolicy = policyFor('crm', { kind: 'DATA', cost: 'rules+db' });
    expect(llmPolicy.maxRetries).toBeGreaterThanOrEqual(dataPolicy.maxRetries);
    expect(llmPolicy.timeoutMs).toBeGreaterThanOrEqual(dataPolicy.timeoutMs);
  });

  it('defaults to rules-like policy when metadata is missing', () => {
    const policy = policyFor('unknown', null);
    expect(policy.maxRetries).toBeGreaterThanOrEqual(1);
    expect(policy.timeoutMs).toBeGreaterThan(0);
  });

  it('exposes fallback targets per agent', () => {
    expect(FALLBACK_TARGETS.knowledge).toContain('receptionist');
    expect(FALLBACK_TARGETS.scheduling).toContain('receptionist');
  });

  it('returns the outcome immediately on success', async () => {
    const task = makeTask('crm');
    const outcome = await executeWithPolicy(task, async () => ({ status: TASK_STATUS.SUCCESS, ok: true }));
    expect(outcome.status).toBe(TASK_STATUS.SUCCESS);
    expect(outcome.retries).toBe(0);
  });

  it('retries transient failures and returns success with retry count', async () => {
    const task = makeTask('knowledge');
    let calls = 0;
    const outcome = await executeWithPolicy(task, async () => {
      calls++;
      if (calls === 1) throw new Error('transient');
      return { status: TASK_STATUS.SUCCESS, ok: true };
    }, { policy: { maxRetries: 2, backoffMs: 1, timeoutMs: 5000 } });
    expect(calls).toBe(2);
    expect(outcome.ok).toBe(true);
    expect(outcome.retries).toBe(1);
  });

  it('retries agents that return FAILED responses', async () => {
    const task = makeTask('knowledge');
    let calls = 0;
    const outcome = await executeWithPolicy(task, async () => {
      calls++;
      if (calls === 1) return { status: TASK_STATUS.FAILED, error: { message: 'nope' } };
      return { status: TASK_STATUS.SUCCESS, ok: true };
    }, { policy: { maxRetries: 1, backoffMs: 1, timeoutMs: 5000 } });
    expect(calls).toBe(2);
    expect(outcome.status).toBe(TASK_STATUS.SUCCESS);
  });

  it('exhausts retries and returns a FAILED response', async () => {
    const task = makeTask('crm');
    let calls = 0;
    const outcome = await executeWithPolicy(task, async () => {
      calls++;
      throw new Error('always fails');
    }, { policy: { maxRetries: 2, backoffMs: 1, timeoutMs: 5000 } });
    expect(calls).toBe(3);
    expect(outcome.status).toBe(TASK_STATUS.FAILED);
    expect(outcome.error.message).toContain('always fails');
  });

  it('honors the onRetry callback', async () => {
    const task = makeTask('crm');
    const retries = [];
    await executeWithPolicy(task, async () => { throw new Error('x'); }, {
      policy: { maxRetries: 1, backoffMs: 1, timeoutMs: 5000 },
      onRetry: (info) => retries.push(info),
    });
    expect(retries.length).toBeGreaterThan(0);
  });

  it('withTimeout rejects when the promise exceeds the timeout', async () => {
    const task = makeTask('crm');
    await expect(withTimeout(new Promise(() => {}), 20, task.taskId)).rejects.toThrow(/timed out/);
  });

  it('withTimeout resolves normally when fast', async () => {
    await expect(withTimeout(Promise.resolve('done'), 100)).resolves.toBe('done');
  });

  it('degradeResponse marks partial with low confidence', () => {
    const task = makeTask('scheduling');
    const degraded = degradeResponse(task, 'agent down');
    expect(degraded.status).toBe(TASK_STATUS.PARTIAL);
    expect(degraded.confidence).toBe(0.2);
    expect(degraded.result.degraded).toBe(true);
  });
});
