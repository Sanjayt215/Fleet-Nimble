import { BaseEmbeddingProvider } from './baseProvider.js';

export class OpenAIEmbeddingProvider extends BaseEmbeddingProvider {
  constructor(config) {
    super(config);
    this._model = config.model || 'text-embedding-ada-002';
    this._dimensions = config.dimensions || 1536;
    this._apiKey = config.openaiKey || '';
    this._client = null;
  }

  async initialize() {
    const { default: OpenAI } = await import('openai');
    this._client = new OpenAI({ apiKey: this._apiKey });
    return true;
  }

  async embed(text) {
    if (!this._client) await this.initialize();
    const resp = await this._client.embeddings.create({
      model: this._model,
      input: String(text).slice(0, 8000),
    });
    return resp.data[0].embedding;
  }

  async embedBatch(texts) {
    if (!this._client) await this.initialize();
    const results = [];
    for (let i = 0; i < texts.length; i += 20) {
      const batch = texts.slice(i, i + 20).map(t => String(t).slice(0, 8000));
      const resp = await this._client.embeddings.create({ model: this._model, input: batch });
      for (const item of resp.data.sort((a, b) => a.index - b.index)) {
        results.push(item.embedding);
      }
    }
    return results;
  }

  get dimensions() { return this._dimensions; }
  get model() { return this._model; }
  get name() { return 'openai'; }
}
