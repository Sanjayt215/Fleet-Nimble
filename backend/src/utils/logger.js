import winston from 'winston';
import { config } from '../config/index.js';

// Create a custom format for AI-specific logs
const aiLogFormat = winston.format.printf(({ level, message, timestamp, userId, intent, provider, confidence, ...meta }) => {
  const baseLog = {
    timestamp,
    level,
    message,
  };

  // Add AI-specific fields if present
  if (userId) baseLog.userId = userId;
  if (intent) baseLog.intent = intent;
  if (provider) baseLog.provider = provider;
  if (confidence) baseLog.confidence = confidence;

  // Add remaining metadata
  Object.assign(baseLog, meta);

  return JSON.stringify(baseLog);
});

const logger = winston.createLogger({
  level: config.logLevel || (config.env === 'production' ? 'info' : 'debug'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'isoDateTime' }),
    winston.format.errors({ stack: true }),
    aiLogFormat
  ),
  transports: [new winston.transports.Console()],
});

/**
 * AI-specific logging functions with structured fields
 */
export const aiLogger = {
  request: (userId, message, meta = {}) => {
    logger.info('AI_REQUEST', { userId, message, ...meta });
  },

  intentDetected: (userId, intent, confidence, meta = {}) => {
    logger.info('AI_INTENT_DETECTED', { userId, intent, confidence, ...meta });
  },

  contextBuilt: (userId, intent, contextSize, meta = {}) => {
    logger.info('AI_CONTEXT_BUILT', { userId, intent, contextSize, ...meta });
  },

  providerCall: (userId, provider, model, meta = {}) => {
    logger.info('AI_PROVIDER_CALL', { userId, provider, model, ...meta });
  },

  providerResponse: (userId, provider, responseLength, meta = {}) => {
    logger.info('AI_PROVIDER_RESPONSE', { userId, provider, responseLength, ...meta });
  },

  providerError: (userId, provider, error, meta = {}) => {
    logger.error('AI_PROVIDER_ERROR', { userId, provider, error, ...meta });
  },

  fallbackUsed: (userId, reason, meta = {}) => {
    logger.warn('AI_FALLBACK_USED', { userId, reason, ...meta });
  },

  circuitBreakerOpened: (provider, failures, meta = {}) => {
    logger.warn('AI_CIRCUIT_BREAKER_OPENED', { provider, failures, ...meta });
  },

  circuitBreakerReset: (provider, meta = {}) => {
    logger.info('AI_CIRCUIT_BREAKER_RESET', { provider, ...meta });
  },

  contextSaved: (userId, chatId, meta = {}) => {
    logger.info('AI_CONTEXT_SAVED', { userId, chatId, ...meta });
  },

  pronounResolved: (userId, original, resolved, meta = {}) => {
    logger.info('AI_PRONOUN_RESOLVED', { userId, original, resolved, ...meta });
  },
};

export default logger;
