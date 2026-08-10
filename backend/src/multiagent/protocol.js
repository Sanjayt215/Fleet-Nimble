import { createHash, randomUUID } from 'node:crypto';

export const PROTOCOL_VERSION = 1;

export const TASK_STATUS = {
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
  RETRIED: 'RETRIED',
};

export const RUN_STATUS = {
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
};

export const AGENT_KINDS = {
  SPEAKER: 'SPEAKER',
  ANALYST: 'ANALYST',
  ACTOR: 'ACTOR',
  DATA: 'DATA',
  OBSERVER: 'OBSERVER',
};

export const INTENTS = {
  GREETING: 'GREETING',
  SCHEDULE_MEETING: 'SCHEDULE_MEETING',
  SUPPORT_REQUEST: 'SUPPORT_REQUEST',
  PRICING_QUESTION: 'PRICING_QUESTION',
  GENERAL_QUESTION: 'GENERAL_QUESTION',
  PRODUCT_QUESTION: 'PRODUCT_QUESTION',
  SALES_INTEREST: 'SALES_INTEREST',
  TECHNICAL_ISSUE: 'TECHNICAL_ISSUE',
  FLEET_QUESTION: 'FLEET_QUESTION',
  EMERGENCY: 'EMERGENCY',
  APPOINTMENT_INQUIRY: 'APPOINTMENT_INQUIRY',
  UNKNOWN: 'UNKNOWN',
};

export function canonicalize(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(canonicalize).filter(Boolean).join('|');
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return keys.map(key => `${key}=${canonicalize(value[key])}`).filter(Boolean).join('|');
  }
  return JSON.stringify(value);
}

export function idempotencyKeyFrom(agentId, taskType, payload, callSid) {
  const canonical = canonicalize(payload);
  const raw = [agentId, taskType, canonical, callSid || ''].join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export function createTaskId() {
  return `T-${randomUUID().slice(0, 8)}`;
}

export function createRunId() {
  return `R-${randomUUID().slice(0, 8)}`;
}

export function createMemoryId() {
  return `M-${randomUUID().slice(0, 8)}`;
}

export function buildTask({ runId, agentId, taskType, payload = {}, callSid = null, context = {}, constraints = {}, idempotencyKey = null }) {
  const task = {
    protocolVersion: PROTOCOL_VERSION,
    taskId: createTaskId(),
    runId,
    agent: agentId,
    task: {
      type: taskType,
      payload: payload || {},
    },
    context: context || {},
    constraints: constraints || {},
    idempotencyKey: idempotencyKey || idempotencyKeyFrom(agentId, taskType, payload, callSid),
  };
  const validation = validateTask(task);
  if (!validation.valid) {
    throw new TypeError(`Invalid task: ${validation.errors.join(', ')}`);
  }
  return task;
}

export function buildResponse({ task, status, result = null, confidence = 1, artifacts = {}, cost = {}, error = null }) {
  const response = {
    protocolVersion: PROTOCOL_VERSION,
    taskId: task?.taskId || null,
    runId: task?.runId || null,
    agent: task?.agent || null,
    status,
    result,
    confidence: Math.max(0, Math.min(1, confidence ?? 1)),
    artifacts: artifacts || {},
    cost: {
      llmTokens: 0,
      dbQueries: 0,
      cacheHits: 0,
      ms: 0,
      ...(cost || {}),
    },
    error: error ? { code: error.code || 'AGENT_ERROR', message: error.message || String(error) } : null,
  };
  const validation = validateResponse(response);
  if (!validation.valid) {
    throw new TypeError(`Invalid response: ${validation.errors.join(', ')}`);
  }
  return response;
}

export function successResponse(task, result, { confidence = 1, artifacts = {}, cost = {} } = {}) {
  return buildResponse({ task, status: TASK_STATUS.SUCCESS, result, confidence, artifacts, cost });
}

export function partialResponse(task, result, { confidence = 0.5, artifacts = {}, cost = {}, error = null } = {}) {
  return buildResponse({ task, status: TASK_STATUS.PARTIAL, result, confidence, artifacts, cost, error });
}

export function failedResponse(task, error, { artifacts = {}, cost = {} } = {}) {
  return buildResponse({ task, status: TASK_STATUS.FAILED, error, artifacts, cost, confidence: 0 });
}

export function skippedResponse(task, reason, { cost = {} } = {}) {
  return buildResponse({
    task,
    status: TASK_STATUS.SKIPPED,
    result: { reason },
    confidence: 0,
    artifacts: { reason },
    cost,
  });
}

export function validateTask(task) {
  const errors = [];
  if (!task || typeof task !== 'object') {
    errors.push('task must be an object');
    return { valid: false, errors };
  }
  if (task.protocolVersion !== PROTOCOL_VERSION) errors.push(`protocolVersion must be ${PROTOCOL_VERSION}`);
  if (!task.taskId) errors.push('taskId is required');
  if (!task.runId) errors.push('runId is required');
  if (!task.agent || typeof task.agent !== 'string') errors.push('agent is required');
  if (!task.task || typeof task.task.type !== 'string' || !task.task.type) errors.push('task.type is required');
  if (!task.idempotencyKey) errors.push('idempotencyKey is required');
  return { valid: errors.length === 0, errors };
}

export function validateResponse(response) {
  const errors = [];
  if (!response || typeof response !== 'object') {
    errors.push('response must be an object');
    return { valid: false, errors };
  }
  if (response.protocolVersion !== PROTOCOL_VERSION) errors.push(`protocolVersion must be ${PROTOCOL_VERSION}`);
  if (!response.taskId) errors.push('taskId is required');
  if (!Object.values(TASK_STATUS).includes(response.status)) errors.push(`status must be one of ${Object.values(TASK_STATUS).join(', ')}`);
  if (typeof response.confidence !== 'number' || response.confidence < 0 || response.confidence > 1) {
    errors.push('confidence must be a number in [0, 1]');
  }
  if (response.status === TASK_STATUS.FAILED && !response.error) errors.push('failed responses require error');
  return { valid: errors.length === 0, errors };
}
