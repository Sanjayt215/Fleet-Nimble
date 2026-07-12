import logger from '../../utils/logger.js';
import { config } from '../../config/index.js';
import { GroqAssistantProvider } from './groqAssistant.provider.js';
import { OpenRouterAssistantProvider } from './openRouterAssistant.provider.js';

const PROVIDER_MAP = {
  groq: GroqAssistantProvider,
  openrouter: OpenRouterAssistantProvider,
};

function getConfiguredAssistantProvider() {
  const providerName = config.assistantProvider?.provider || 'groq';
  const ProviderClass = PROVIDER_MAP[providerName];
  if (!ProviderClass) {
    logger.warn('ASSISTANT_PROVIDER_UNKNOWN', {
      provider: providerName,
      supported: Object.keys(PROVIDER_MAP),
    });
    return { name: 'openrouter', ProviderClass: OpenRouterAssistantProvider };
  }
  return { name: providerName, ProviderClass };
}

export function createAssistantProvider() {
  const primary = getConfiguredAssistantProvider();
  const provider = new primary.ProviderClass();

  logger.info('ASSISTANT_PROVIDER_SELECTED', {
    provider: primary.name,
    enabled: config.assistantProvider?.enabled !== false,
  });

  return provider;
}

export function getAssistantProviderHealth() {
  const providerName = config.assistantProvider?.provider || 'groq';
  return {
    assistantProvider: providerName,
    assistantConfigured: Boolean(
      (providerName === 'groq' && (config.groq?.apiKey || process.env.GROQ_API_KEY)) ||
      (providerName === 'openrouter' && process.env.OPENROUTER_API_KEY)
    ),
    assistantEnabled: config.assistantProvider?.enabled !== false,
  };
}
