import { config } from '../../config/index.js';
import logger from '../../utils/logger.js';
import { AssistantProvider } from './assistantProvider.interface.js';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

export class GroqAssistantProvider extends AssistantProvider {
  constructor() {
    super();
    this._apiKey = config.groq?.apiKey || process.env.GROQ_API_KEY;
    this._model = config.groq?.model || 'mixtral-8x7b-32768';
    this._timeoutMs = config.groq?.timeoutMs || 15000;
    this._maxRetries = config.groq?.maxRetries || 2;
    this._maxTokens = config.groq?.maxTokens || 1024;
    this._temperature = config.groq?.temperature ?? 0.2;
    this._ready = Boolean(this._apiKey);
  }

  get providerName() { return 'groq'; }

  async sendMessage(messages, context = {}) {
    if (!this._apiKey) {
      logger.warn('GROQ_API_KEY_MISSING');
      return {
        success: false,
        error: 'Groq API key not configured',
        provider: 'groq',
        fallbackUsed: false,
      };
    }

    const payload = {
      model: this._model,
      messages,
      temperature: this._temperature,
      max_tokens: this._maxTokens,
    };

    let lastError = null;

    for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
      const startTime = Date.now();

      try {
        logger.info('GROQ_REQUEST_STARTED', {
          model: this._model,
          attempt: attempt + 1,
          messageCount: messages.length,
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this._timeoutMs);

        const response = await fetch(GROQ_BASE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this._apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const latencyMs = Date.now() - startTime;

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          const errorMsg = `Groq API error: ${response.status} - ${errorBody.substring(0, 200)}`;

          if (response.status === 402 || response.status === 401 || response.status === 403) {
            logger.warn('GROQ_REQUEST_FAILED', {
              status: response.status,
              error: errorMsg.substring(0, 100),
              fatal: true,
            });
            return {
              success: false,
              error: 'AI service temporarily unavailable',
              provider: 'groq',
              fallbackUsed: true,
              finishReason: 'fatal_error',
            };
          }

          logger.warn('GROQ_REQUEST_FAILED', {
            status: response.status,
            attempt: attempt + 1,
            error: errorMsg.substring(0, 100),
          });

          lastError = errorMsg;
          if (attempt < this._maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          continue;
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';
        const usage = data.usage || {};
        const finishReason = data.choices?.[0]?.finish_reason || 'stop';

        logger.info('GROQ_RESPONSE_RECEIVED', {
          model: this._model,
          latencyMs,
          finishReason,
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
        });

        return {
          success: true,
          text,
          provider: 'groq',
          model: this._model,
          usage,
          latencyMs,
          finishReason,
          fallbackUsed: false,
        };
      } catch (err) {
        if (err.name === 'AbortError') {
          lastError = 'Request timeout';
          logger.warn('GROQ_REQUEST_FAILED', {
            attempt: attempt + 1,
            error: 'timeout',
            timeoutMs: this._timeoutMs,
          });
        } else {
          lastError = err.message;
          logger.warn('GROQ_REQUEST_FAILED', {
            attempt: attempt + 1,
            error: err.message,
          });
        }

        if (attempt < this._maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    logger.warn('GROQ_ALL_RETRIES_EXHAUSTED', { error: lastError });
    return {
      success: false,
      error: lastError || 'All retries exhausted',
      provider: 'groq',
      fallbackUsed: true,
    };
  }
}
