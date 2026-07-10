import logger from '../utils/logger.js';

const FAILURE_CACHE = new Map();
const FAILURE_TTL_MS = 300000;

export class RealtimeModelValidator {
  static validate(model) {
    if (!model || typeof model !== 'string' || model.trim().length === 0) {
      return { valid: false, reason: 'empty_or_whitespace' };
    }
    const trimmed = model.trim();
    const cached = FAILURE_CACHE.get(trimmed);
    if (cached && Date.now() - cached.failedAt < FAILURE_TTL_MS) {
      return { valid: false, reason: cached.reason, cached: true };
    }
    if (cached && Date.now() - cached.failedAt >= FAILURE_TTL_MS) {
      FAILURE_CACHE.delete(trimmed);
    }
    return { valid: true, model: trimmed };
  }

  static markFailed(model, reason) {
    const key = model.trim();
    FAILURE_CACHE.set(key, { valid: false, reason, failedAt: Date.now() });
    logger.error('MODEL_NOT_SUPPORTED', { model: key, reason });
  }

  static markSucceeded(model) {
    const key = model.trim();
    FAILURE_CACHE.delete(key);
  }

  static clearCache() {
    FAILURE_CACHE.clear();
  }
}
