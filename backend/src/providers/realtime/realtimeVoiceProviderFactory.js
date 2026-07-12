import logger from '../../utils/logger.js';
import { config } from '../../config/index.js';
import { OpenAIRealtimeProvider } from './openAIRealtime.provider.js';
import { GeminiLiveProvider } from './geminiLive.provider.js';

const PROVIDER_MAP = {
  openai: OpenAIRealtimeProvider,
  gemini: GeminiLiveProvider,
};

const FALLBACK_PROVIDER_MAP = {
  openai: OpenAIRealtimeProvider,
  gemini: GeminiLiveProvider,
};

function getConfiguredProvider() {
  const providerName = config.realtimeProvider?.provider || 'openai';
  const ProviderClass = PROVIDER_MAP[providerName];
  if (!ProviderClass) {
    logger.error('REALTIME_PROVIDER_UNKNOWN', {
      provider: providerName,
      supported: Object.keys(PROVIDER_MAP),
    });
    return null;
  }
  return { name: providerName, ProviderClass };
}

function getFallbackProviderName() {
  return config.realtimeProvider?.fallbackProvider || 'openai';
}

export function createRealtimeVoiceProvider() {
  const primary = getConfiguredProvider();
  if (!primary) return null;

  const provider = new primary.ProviderClass();
  logger.info('REALTIME_PROVIDER_SELECTED', {
    provider: primary.name,
    enabled: config.realtimeProvider?.enabled !== false,
    fallbackProvider: getFallbackProviderName(),
  });

  return provider;
}

export function isRealtimeProviderEnabled() {
  return config.realtimeProvider?.enabled !== false;
}

export function getRealtimeProviderHealth() {
  const providerName = config.realtimeProvider?.provider || 'openai';
  return {
    provider: providerName,
    configured: Boolean(config.gemini?.apiKey || config.openai?.apiKey),
    available: config.realtime?.configured || Boolean(config.gemini?.apiKey),
    fallbackProvider: getFallbackProviderName(),
    enabled: config.realtimeProvider?.enabled !== false,
  };
}
