import { config } from '../../config/index.js';
import logger from '../../utils/logger.js';
import { OpenAIEmbeddingProvider } from './providers/openaiEmbeddingProvider.js';
import { GeminiEmbeddingProvider } from './providers/geminiEmbeddingProvider.js';
import { LocalEmbeddingProvider } from './providers/localEmbeddingProvider.js';

const PROVIDERS = {
  openai: OpenAIEmbeddingProvider,
  gemini: GeminiEmbeddingProvider,
  local: LocalEmbeddingProvider,
};

// Fallback chain used when the configured provider fails to initialize.
const FALLBACK_CHAIN = ['gemini', 'local'];

let _provider = null;
let _initialized = false;

export async function getEmbeddingProvider() {
  if (_initialized && _provider) return _provider;

  const cfg = config.rag.embedding;
  const candidates = [cfg.provider, ...FALLBACK_CHAIN.filter(p => p !== cfg.provider)];

  for (const name of candidates) {
    const ProviderClass = PROVIDERS[name];
    if (!ProviderClass) continue;
    try {
      const candidate = new ProviderClass(cfg);
      await candidate.initialize();
      _provider = candidate;
      _initialized = true;
      logger.info('RAG_EMBEDDING_PROVIDER_INITIALIZED', {
        provider: _provider.name,
        model: _provider.model,
        dimensions: _provider.dimensions,
      });
      return _provider;
    } catch (err) {
      logger.warn('RAG_EMBEDDING_PROVIDER_FALLBACK', { provider: name, error: err.message });
    }
  }

  logger.error('RAG_EMBEDDING_PROVIDER_FAILED', { provider: cfg.provider, candidates });
  throw new Error(`No embedding provider could be initialized. Tried: ${candidates.join(', ')}`);
}

export async function embedText(text) {
  const provider = await getEmbeddingProvider();
  return provider.embed(text);
}

export async function embedBatch(texts) {
  const provider = await getEmbeddingProvider();
  return provider.embedBatch(texts);
}

export function getEmbeddingDimensions() {
  return _provider?.dimensions || config.rag.embedding.dimensions;
}

export function getEmbeddingModel() {
  return _provider?.model || config.rag.embedding.model;
}

export function getEmbeddingProviderName() {
  return _provider?.name || config.rag.embedding.provider;
}

export function resetEmbeddingProvider() {
  _provider = null;
  _initialized = false;
}

export async function warmEmbeddingProvider() {
  try {
    await getEmbeddingProvider();
    return true;
  } catch {
    return false;
  }
}
