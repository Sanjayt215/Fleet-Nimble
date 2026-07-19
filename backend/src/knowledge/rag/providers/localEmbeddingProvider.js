import { BaseEmbeddingProvider } from './baseProvider.js';

export class LocalEmbeddingProvider extends BaseEmbeddingProvider {
  constructor(config) {
    super(config);
    this._model = config.model || 'local';
    this._dimensions = config.dimensions || 384;
    this._modelPath = config.localModelPath || '';
    this._pipeline = null;
  }

  async initialize() {
    try {
      const { pipeline } = await import('@xenova/transformers');
      this._pipeline = await pipeline('feature-extraction', this._modelPath || 'Xenova/all-MiniLM-L6-v2');
    } catch (err) {
      throw new Error(`Local embedding model failed to load: ${err.message}. Install @xenova/transformers.`);
    }
    return true;
  }

  async embed(text) {
    if (!this._pipeline) await this.initialize();
    const result = await this._pipeline(String(text).slice(0, 8000), { pooling: 'mean', normalize: true });
    return Array.from(result.data);
  }

  async embedBatch(texts) {
    if (!this._pipeline) await this.initialize();
    const results = [];
    for (const t of texts) {
      results.push(await this.embed(t));
    }
    return results;
  }

  get dimensions() { return this._dimensions; }
  get model() { return this._model; }
  get name() { return 'local'; }
}
