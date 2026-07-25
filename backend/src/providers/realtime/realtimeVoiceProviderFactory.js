import logger from '../../utils/logger.js';
import { config } from '../../config/index.js';
import { GeminiLiveProvider } from './geminiLive.provider.js';
import { OpenAIRealtimeProvider } from './openAIRealtime.provider.js';

const PROVIDER_MAP = {
  gemini: GeminiLiveProvider,
};

// OpenAI is only available when ENABLE_OPENAI_REALTIME=true
if (config.realtimeProvider?.openaiEnabled) {
  PROVIDER_MAP.openai = OpenAIRealtimeProvider;
  logger.info('OPENAI_REALTIME_PROVIDER_LOADED', { reason: 'ENABLE_OPENAI_REALTIME=true' });
}

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
  const primary = getConfiguredProvider();
  if (!primary) return null;

  if (primary.configIssues && primary.configIssues.length > 0) {
    logger.warn('REALTIME_PROVIDER_CONFIG_ISSUES', {
      provider: primary.name,
      issues: primary.configIssues,
      action: 'Provider will be created but may not function correctly',
    });
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

export function isRealtimeProviderEnabled() {
  return config.realtimeProvider?.enabled !== false;
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
