import logger from '../utils/logger.js';
import { recordTimelineEvent, TIMELINE_EVENT_TYPES } from './conversationTimeline.service.js';
import { getMemoryStats } from '../multiagent/shared/memoryStore.js';
import { getHealthSnapshot } from '../multiagent/health.js';

export const SUPERVISOR_DEFAULTS = Object.freeze({
  maxRetries: 2,
  backoffMs: 300,
  timeoutMs: 15000,
});

const inFlight = new Set();

export function isSupervised(operationKey) {
  return inFlight.has(operationKey);
}

function safeDegrade(reason) {
  return {
    ok: false,
    degraded: true,
    reason,
    safeMessage: 'I apologize, but I encountered a temporary issue. Our team has been notified and will follow up shortly.',
  };
}

export async function supervise({
  userId = null,
  callId = null,
  callSid = null,
  operationKey,
  operation = 'unknown',
  fn,
  maxRetries = SUPERVISOR_DEFAULTS.maxRetries,
  backoffMs = SUPERVISOR_DEFAULTS.backoffMs,
  timeoutMs = SUPERVISOR_DEFAULTS.timeoutMs,
  onRetry = null,
  timeline = true,
}) {
  const key = operationKey || `${callId || callSid || 'session'}:${operation}`;
  if (inFlight.has(key)) {
    logger.warn('SUPERVISOR_OP_IN_FLIGHT', { operationKey: key, operation });
    return safeDegrade('duplicate_operation');
  }
  inFlight.add(key);

  let lastError = null;
  try {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        logger.warn('SUPERVISOR_RETRY', { operation, attempt, error: lastError?.message, callId });
        if (timeline && callId) {
          await recordTimelineEvent({
            userId,
            callId,
            callSid,
            eventType: TIMELINE_EVENT_TYPES.SUPERVISOR_RETRY,
            data: { operation, attempt, error: lastError?.message },
          });
        }
        if (onRetry) onRetry({ attempt, error: lastError });
        await new Promise(resolve => setTimeout(resolve, Math.min(backoffMs * Math.pow(2, attempt), 5000)));
      }
      try {
        const result = await Promise.race([
          Promise.resolve().then(fn),
          timeoutMs > 0
            ? new Promise((_, reject) => setTimeout(() => reject(new Error('supervisor_timeout')), timeoutMs))
            : Promise.resolve(null),
        ]);
        if (result && result.success === false && attempt < maxRetries) {
          lastError = new Error(result.error || 'transient_failure');
          continue;
        }
        if (attempt > 0 && timeline && callId) {
          await recordTimelineEvent({
            userId,
            callId,
            callSid,
            eventType: TIMELINE_EVENT_TYPES.SUPERVISOR_RECOVERED,
            data: { operation, attempts: attempt + 1 },
          });
          logger.info('SUPERVISOR_RECOVERED', { operation, attempts: attempt + 1, callId });
        }
        return result;
      } catch (err) {
        lastError = err;
      }
    }
    logger.error('SUPERVISOR_OPERATION_FAILED', { operation, callId, error: lastError?.message });
    return safeDegrade(operation);
  } finally {
    inFlight.delete(key);
  }
}

export async function superviseToolCall(toolCallContext, executeFn) {
  const { userId, callId, callSid, tool } = toolCallContext;
  const startedAt = Date.now();
  const result = await supervise({
    userId,
    callId,
    callSid,
    operationKey: `${callId || callSid}:tool:${tool}`,
    operation: `tool:${tool}`,
    fn: executeFn,
    maxRetries: 2,
  });
  const outcome = result?.ok === false && result?.degraded
    ? { success: false, message: result.safeMessage, error: result.reason }
    : result;
  return { ...outcome, durationMs: Date.now() - startedAt };
}

export async function getSupervisorStatus() {
  let health = {};
  try {
    health = getHealthSnapshot();
  } catch (err) {
    logger.warn('SUPERVISOR_HEALTH_SNAPSHOT_FAILED', { error: err.message });
  }
  let memory = {};
  try {
    memory = getMemoryStats();
  } catch (err) {
    logger.warn('SUPERVISOR_MEMORY_STATS_FAILED', { error: err.message });
  }
  return {
    supervisor: 'ACTIVE',
    inFlightOperations: inFlight.size,
    retryPolicy: { ...SUPERVISOR_DEFAULTS },
    agentHealth: health,
    memory: memory,
    timestamp: new Date().toISOString(),
  };
}
