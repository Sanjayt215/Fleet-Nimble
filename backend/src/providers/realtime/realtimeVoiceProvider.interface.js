const EVENTS = [
  'connected',
  'ready',
  'audio',
  'callerTranscript',
  'assistantTranscript',
  'speechStarted',
  'speechEnded',
  'toolCall',
  'responseStarted',
  'responseCompleted',
  'error',
  'closed',
];

import logger from '../../utils/logger.js';

export class RealtimeVoiceProvider {
  constructor() {
    this._eventHandlers = {};
    for (const ev of EVENTS) {
      this._eventHandlers[ev] = [];
    }
    this._connected = false;
    this._ready = false;
  }

  on(eventName, handler) {
    if (!this._eventHandlers[eventName]) {
      this._eventHandlers[eventName] = [];
    }
    this._eventHandlers[eventName].push(handler);
    return () => {
      this._eventHandlers[eventName] = this._eventHandlers[eventName].filter(h => h !== handler);
    };
  }

  _emit(eventName, data) {
    const handlers = this._eventHandlers[eventName] || [];
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (err) {
        logger.error('PROVIDER_EVENT_HANDLER_ERROR', { eventName, error: err.message });
      }
    }
  }

  async connect(sessionContext) {
    throw new Error('connect() must be implemented by subclass');
  }

  async sendAudio(audioChunk) {
    throw new Error('sendAudio() must be implemented by subclass');
  }

  async sendText(text) {
    throw new Error('sendText() must be implemented by subclass');
  }

  async updateInstructions(instructions) {
    throw new Error('updateInstructions() must be implemented by subclass');
  }

  async sendToolResult(toolCallId, result) {
    throw new Error('sendToolResult() must be implemented by subclass');
  }

  async cancelResponse() {
    throw new Error('cancelResponse() must be implemented by subclass');
  }

  async close(reason) {
    throw new Error('close() must be implemented by subclass');
  }

  get isConnected() {
    return this._connected;
  }

  get isReady() {
    return this._ready;
  }

  get providerName() {
    return 'base';
  }

  getHealth() {
    return {
      provider: this.providerName,
      connected: this._connected,
      ready: this._ready,
    };
  }
}
