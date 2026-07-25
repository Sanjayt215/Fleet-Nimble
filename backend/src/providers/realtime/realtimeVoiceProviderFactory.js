import logger from '../../utils/logger.js';
import { config } from '../../config/index.js';
import { GeminiLiveProvider } from './geminiLive.provider.js';
import { OpenAIRealtimeProvider } from './openAIRealtime.provider.js';
import * as providerHealth from '../../services/receptionistProviderHealth.service.js';

const PROVIDER_MAP = {
  gemini: GeminiLiveProvider,
};

// OpenAI is only available when ENABLE_OPENAI_REALTIME=true
if (config.realtimeProvider?.openaiEnabled) {
  PROVIDER_MAP.openai = OpenAIRealtimeProvider;
  logger.info('OPENAI_REALTIME_PROVIDER_LOADED', { reason: 'ENABLE_OPENAI_REALTIME=true' });
}

const OPENAI_QUOTA_COOLDOWN_MS = 300_000; // 5 min cooldown after quota exhaustion
let openaiQuotaExhaustedAt = null;

function validateProviderConfig(providerName) {
  const issues = [];

  if (providerName === 'openai') {
    if (!config.openai?.apiKey) {
      issues.push('OPENAI_API_KEY not configured');
    }
    if (!config.realtime?.model) {
      issues.push('AI_RECEPTIONIST_MODEL not configured');
    }
  }

  if (providerName === 'gemini') {
    if (!config.gemini?.apiKey) {
      issues.push('GEMINI_API_KEY not configured');
    }
    if (!config.gemini?.liveModel) {
      issues.push('GEMINI_LIVE_MODEL not configured');
    }
    if (!config.gemini?.voice) {
      issues.push('GEMINI_VOICE not configured (default: Puck)');
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

function getConfiguredProvider() {
  const providerName = config.realtimeProvider?.provider || 'gemini';
  const ProviderClass = PROVIDER_MAP[providerName];

  if (!ProviderClass) {
    logger.error('REALTIME_PROVIDER_UNKNOWN', {
      provider: providerName,
      supported: Object.keys(PROVIDER_MAP),
    });
    return null;
  }

  const validation = validateProviderConfig(providerName);
  if (!validation.valid) {
    logger.error('REALTIME_PROVIDER_CONFIG_INVALID', {
      provider: providerName,
      issues: validation.issues,
    });
    return { name: providerName, ProviderClass, configIssues: validation.issues };
  }

  return { name: providerName, ProviderClass, configIssues: [] };
}

export function createRealtimeVoiceProvider() {
  if (!providerHealth.areNewSessionsAllowed()) {
    logger.warn('REALTIME_PROVIDER_SESSIONS_BLOCKED', {
      reason: providerHealth.getInternalState().newSessionsBlockReason,
      blockedAt: providerHealth.getInternalState().newSessionsBlockedAt,
    });
    return null;
  }

  const primary = getConfiguredProvider();
  if (!primary) return null;

  if (primary.configIssues && primary.configIssues.length > 0) {
    logger.warn('REALTIME_PROVIDER_CONFIG_ISSUES', {
      provider: primary.name,
      issues: primary.configIssues,
      action: 'Provider will be created but may not function correctly',
    });
  }

  if (primary.name === 'gemini') {
    const health = providerHealth.getInternalState();
    if (health.lastErrorCode && !health.available) {
      const fallbackName = getFallbackProviderName();
      if (fallbackName && PROVIDER_MAP[fallbackName]) {
        const fallbackValidation = validateProviderConfig(fallbackName);
        if (fallbackValidation.valid && isOpenaiQuotaAvailable(fallbackName)) {
          logger.info('REALTIME_PROVIDER_FAILOVER', { from: 'gemini', to: fallbackName });
          const provider = new PROVIDER_MAP[fallbackName]();
          logger.info('REALTIME_PROVIDER_SELECTED', {
            provider: fallbackName,
            enabled: config.realtimeProvider?.enabled !== false,
            configValid: true,
            failover: true,
            fallbackProvider: '',
          });
          return provider;
        }
      }
      logger.warn('REALTIME_PROVIDER_FAILOVER_UNAVAILABLE', {
        from: 'gemini',
        fallback: fallbackName,
        reason: 'fallback not configured or quota exhausted',
      });
    }
  }

  const provider = new primary.ProviderClass();
  logger.info('REALTIME_PROVIDER_SELECTED', {
    provider: primary.name,
    enabled: config.realtimeProvider?.enabled !== false,
    configValid: primary.configIssues.length === 0,
    fallbackProvider: getFallbackProviderName(),
  });

  return provider;
}

export function markOpenaiQuotaExhausted() {
  openaiQuotaExhaustedAt = Date.now();
  logger.warn('OPENAI_QUOTA_EXHAUSTED', { cooldownMs: OPENAI_QUOTA_COOLDOWN_MS });
}

function isOpenaiQuotaAvailable(providerName) {
  if (providerName !== 'openai') return true;
  if (!openaiQuotaExhaustedAt) return true;
  if (Date.now() - openaiQuotaExhaustedAt > OPENAI_QUOTA_COOLDOWN_MS) {
    openaiQuotaExhaustedAt = null;
    logger.info('OPENAI_QUOTA_COOLDOWN_EXPIRED');
    return true;
  }
  return false;
}

export function isRealtimeProviderEnabled() {
  if (config.realtimeProvider?.enabled === false) return false;
  if (!providerHealth.areNewSessionsAllowed()) return false;
  return true;
}

function getFallbackProviderName() {
  return config.realtimeProvider?.fallbackProvider || '';
}

export function getRealtimeProviderHealth() {
  const providerName = config.realtimeProvider?.provider || 'gemini';
  const validation = validateProviderConfig(providerName);

  return {
    provider: providerName,
    configured: validation.valid,
    configIssues: validation.issues,
    apiKeyPresent: Boolean(config.gemini?.apiKey || config.openai?.apiKey),
    available: validation.valid,
    fallbackProvider: getFallbackProviderName(),
    enabled: config.realtimeProvider?.enabled !== false,
  };
}
