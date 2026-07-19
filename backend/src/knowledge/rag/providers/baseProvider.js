export class BaseEmbeddingProvider {
  constructor(config) {
    this._config = config;
  }

  async initialize() {
    throw new Error('Not implemented');
  }

  async embed(text) {
    throw new Error('Not implemented');
  }

  async embedBatch(texts) {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  get dimensions() {
    throw new Error('Not implemented');
  }

  get model() {
    throw new Error('Not implemented');
  }

  get name() {
    throw new Error('Not implemented');
  }
}
