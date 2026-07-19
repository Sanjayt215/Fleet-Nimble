import { BaseEmbeddingProvider } from './baseProvider.js';

export class GeminiEmbeddingProvider extends BaseEmbeddingProvider {
  constructor(config) {
    super(config);
    this._model = config.model ? `models/${config.model}` : 'models/text-embedding-004';
    this._dimensions = config.dimensions || 768;
    this._apiKey = config.geminiKey || '';
    this._client = null;
  }

  async initialize() {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(this._apiKey);
    this._client = genAI.getGenerativeModel({ model: this._model });
    return true;
  }

  async embed(text) {
    if (!this._client) await this.initialize();
    const result = await this._client.embedContent(String(text).slice(0, 8000));
    return result.embedding.values;
  }

  async embedBatch(texts) {
    if (!this._client) await this.initialize();
    const results = [];
    for (let i = 0; i < texts.length; i += 20) {
      const batch = texts.slice(i, i + 20).map(t => String(t).slice(0, 8000));
      const resp = await this._client.batchEmbedContents({ requests: batch.map(t => ({ content: { parts: [{ text: t }] } })) });
      for (const emb of resp.embeddings) {
        results.push(emb.values);
      }
    }
    return results;
  }

  get dimensions() { return this._dimensions; }
  get model() { return this._model; }
  get name() { return 'gemini'; }
}
