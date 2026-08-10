import logger from '../utils/logger.js';
import { config } from '../config/index.js';
import { TASK_STATUS, failedResponse, partialResponse } from './protocol.js';

const BACKOFF_BASE_MS = 300;
const BACKOFF_STEP_MS = 600;

export const FALLBACK_TARGETS = {
  crm: ['knowledge'],
  knowledge: ['receptionist'],
  sales: ['knowledge'],
  support: ['receptionist'],
  fleetExpert: ['knowledge'],
  scheduling: ['receptionist'],
  receptionist: [],
};

export function policyFor(agentId, metadata = null) {
  const kind = metadata?.kind || 'DATA';
  const defaultPolicy = kind === 'LLM' || kind === 'ANALYST' || kind === 'ACTOR'
    ? { maxRetries: 2, backoffMs: BACKOFF_BASE_MS }
    : { maxRetries: 1, backoffMs: BACKOFF_BASE_MS };
  return {
    maxRetries: Math.min(config.multiAgent.maxTaskRetries, defaultPolicy.maxRetries),
    backoffMs: defaultPolicy.backoffMs,
    fallbackTargets: FALLBACK_TARGETS[agentId] || [],
    timeoutMs: metadata?.cost === 'llm' ? config.multiAgent.taskTimeoutMs : Math.min(config.multiAgent.taskTimeoutMs, 5000),
  };
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withTimeout(promise, ms, taskId) {
  if (!ms || ms <= 0) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`task ${taskId} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function executeWithPolicy(task, executor, { metadata = null, policy = null, onRetry = null } = {}) {
  const agentPolicy = policy || policyFor(task.agent, metadata);
  const backoffMs = agentPolicy.backoffMs || BACKOFF_BASE_MS;
  const maxRetries = agentPolicy.maxRetries || 0;

  let attempts = 0;
  let lastError = null;

  while (attempts <= maxRetries) {
    try {
      const outcome = await withTimeout(executor(), agentPolicy.timeoutMs, task.taskId);
      if (outcome && typeof outcome === 'object' && outcome.status) {
        if (outcome.status === TASK_STATUS.FAILED) {
          lastError = outcome.error?.message || 'agent returned FAILED';
          if (onRetry) onRetry({ attempt: attempts, error: lastError });
        } else {
          return { ...outcome, retries: attempts };
        }
      } else {
        return { ...outcome, retries: attempts };
      }
    } catch (err) {
      lastError = err.message || String(err);
      if (onRetry) onRetry({ attempt: attempts, error: lastError });
    }
    attempts++;
    if (attempts <= maxRetries) {
      const delay = backoffMs * Math.pow(2, attempts - 1) + Math.floor(Math.random() * 50);
      logger.warn('AGENT_TASK_RETRY', { agent: task.agent, taskId: task.taskId, attempt: attempts, maxRetries, delayMs: delay, error: lastError });
      await sleep(delay);
    }
  }

  logger.warn('AGENT_TASK_EXHAUSTED', { agent: task.agent, taskId: task.taskId, attempts, error: lastError });
  return failedResponse(task, new Error(lastError || `agent ${task.agent} failed`), {
    cost: { ms: attempts * 1 },
  });
}

export function degradeResponse(task, reason) {
  return partialResponse(task, { degraded: true, reason }, {
    confidence: 0.2,
    artifacts: { degraded: true, reason },
  });
}
