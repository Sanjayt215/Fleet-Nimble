import logger from '../utils/logger.js';

const FATAL_NON_RETRYABLE_CODES = new Set([
  'insufficient_quota',
  'billing_not_active',
  'invalid_api_key',
  'authentication_error',
  'model_not_found',
  'unsupported_model',
  'permission_denied',
]);

const TRANSIENT_RETRYABLE_CODES = new Set([
  'rate_limit_exceeded',
  'server_error',
  'service_unavailable',
  'timeout',
  'connection_reset',
]);

const state = {
  configured: false,
  verified: false,
  available: false,
  lastSuccessfulConnectionAt: null,
  lastErrorCode: null,
  lastErrorAt: null,
  audioForwardingDisabled: false,
};

export function markConfigured() {
  state.configured = true;
}

export function markVerified() {
  state.verified = true;
  state.available = true;
  state.lastErrorCode = null;
  state.lastErrorAt = null;
  state.lastSuccessfulConnectionAt = Date.now();
}

export function markUnavailable() {
  state.available = false;
  state.verified = false;
}

export function classifyError(err) {
  const code = err?.code || err?.errorCode || '';
  const message = (err?.message || err?.errorMessage || '').toLowerCase();
  const type = (err?.type || err?.errorType || '').toLowerCase();

  const combined = `${code} ${type} ${message}`;

  if (FATAL_NON_RETRYABLE_CODES.has(code) ||
      FATAL_NON_RETRYABLE_CODES.has(type) ||
      combined.includes('insufficient_quota') ||
      combined.includes('billing') ||
      combined.includes('invalid_api_key') ||
      combined.includes('authentication') ||
      combined.includes('model_not_found') ||
      combined.includes('unsupported_model') ||
      combined.includes('permission_denied')) {
    return { fatal: true, retryable: false, code: code || 'unknown_fatal' };
  }

  if (TRANSIENT_RETRYABLE_CODES.has(code) ||
      TRANSIENT_RETRYABLE_CODES.has(type) ||
      combined.includes('rate_limit') ||
      combined.includes('server_error') ||
      combined.includes('service_unavailable') ||
      combined.includes('timeout') ||
      combined.includes('reset') ||
      combined.includes('try again')) {
    return { fatal: false, retryable: true, code: code || 'unknown_transient' };
  }

  return { fatal: true, retryable: false, code: 'unclassified_fatal' };
}

export function handleFatalError(err, callSid) {
  const classification = classifyError(err);
  state.available = false;
  state.verified = false;
  state.lastErrorCode = classification.code;
  state.lastErrorAt = Date.now();
  state.audioForwardingDisabled = true;

  logger.error('OPENAI_FATAL_ERROR', {
    code: classification.code,
    retryable: classification.retryable,
    callSid,
  });
}

export function handleTransientError(err, callSid) {
  const classification = classifyError(err);
  state.lastErrorCode = classification.code;
  state.lastErrorAt = Date.now();

  logger.warn('OPENAI_TRANSIENT_ERROR', {
    code: classification.code,
    retryable: classification.retryable,
    callSid,
  });
}

export function enableAudioForwarding() {
  state.audioForwardingDisabled = false;
}

export function disableAudioForwarding() {
  state.audioForwardingDisabled = true;
}

export function isAudioForwardingDisabled() {
  return state.audioForwardingDisabled;
}

export function getInternalState() {
  return { ...state };
}

export function getPublicHealth() {
  return {
    configured: state.configured,
    verified: state.verified,
    available: state.available,
    lastRealtimeErrorCode: state.lastErrorCode,
    lastRealtimeErrorAt: state.lastErrorAt,
  };
}

export function clearState() {
  state.configured = false;
  state.verified = false;
  state.available = false;
  state.lastSuccessfulConnectionAt = null;
  state.lastErrorCode = null;
  state.lastErrorAt = null;
  state.audioForwardingDisabled = false;
}
