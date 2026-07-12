import { config } from '../../config/index.js';
import logger from '../../utils/logger.js';
import { AssistantProvider } from './assistantProvider.interface.js';

export class OpenRouterAssistantProvider extends AssistantProvider {
  constructor() {
    super();
    this._apiKey = process.env.OPENROUTER_API_KEY || '';
    this._model = config.ai?.model || 'openai/gpt-4.1-mini';
    this._timeoutMs = config.ai?.timeoutMs || 15000;
    this._maxTokens = config.ai?.maxTokens || 300;
    this._temperature = config.ai?.temperature ?? 0.2;
    this._ready = Boolean(this._apiKey);
  }

  get providerName() { return 'openrouter'; }

  async sendMessage(messages, context = {}) {
    if (!this._apiKey) {
      return {
        success: false,
        error: 'OpenRouter API key not configured',
        provider: 'openrouter',
        fallbackUsed: true,
      };
    }

    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this._timeoutMs);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._apiKey}`,
        },
        body: JSON.stringify({
          model: this._model,
          messages,
          temperature: this._temperature,
          max_tokens: this._maxTokens,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        return {
          success: false,
          error: `OpenRouter API error: ${response.status}`,
          provider: 'openrouter',
          fallbackUsed: true,
        };
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      const usage = data.usage || {};
      const finishReason = data.choices?.[0]?.finish_reason || 'stop';

      return {
        success: true,
        text,
        provider: 'openrouter',
        model: this._model,
        usage,
        latencyMs,
        finishReason,
        fallbackUsed: false,
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'OpenRouter request failed',
        provider: 'openrouter',
        fallbackUsed: true,
      };
    }
  }
}
