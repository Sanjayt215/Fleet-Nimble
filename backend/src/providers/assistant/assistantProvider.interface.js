export class AssistantProvider {
  constructor() {
    this._ready = false;
  }

  get providerName() {
    return 'base';
  }

  get isReady() {
    return this._ready;
  }

  async sendMessage(messages, context = {}) {
    throw new Error('sendMessage() must be implemented by subclass');
  }

  getHealth() {
    return {
      provider: this.providerName,
      ready: this._ready,
    };
  }
}
