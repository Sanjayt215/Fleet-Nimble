/**
 * AI Provider Module
 * Handles calls to OpenAI, OpenRouter, and Gemini APIs
 */

import logger from '../../utils/logger.js';

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const REQUEST_TIMEOUT = Number(process.env.AI_REQUEST_TIMEOUT || 30000); // 30 seconds default

const SYSTEM_PROMPT = `You are FleetNimble AI Assistant. Answer using only provided fleet context. Be concise, professional, and actionable. If data is unavailable, say so. Do not invent data.`;

// Circuit breaker state for each provider
const circuitBreakerState = {
  openai: { failures: 0, lastFailure: null, isOpen: false },
  openrouter: { failures: 0, lastFailure: null, isOpen: false },
  gemini: { failures: 0, lastFailure: null, isOpen: false },
};

const CIRCUIT_BREAKER_THRESHOLD = 5; // Open circuit after 5 consecutive failures
const CIRCUIT_BREAKER_RESET_TIME = 60000; // Reset after 60 seconds

/**
 * Check if circuit breaker is open for a provider
 */
function isCircuitBreakerOpen(provider) {
  const state = circuitBreakerState[provider];
  if (!state) return false;

  // Check if circuit should reset
  if (state.isOpen && Date.now() - state.lastFailure > CIRCUIT_BREAKER_RESET_TIME) {
    logger.info('AI_CIRCUIT_BREAKER_RESET', { provider });
    state.isOpen = false;
    state.failures = 0;
    return false;
  }

  return state.isOpen;
}

/**
 * Record provider failure for circuit breaker
 */
function recordProviderFailure(provider) {
  const state = circuitBreakerState[provider];
  if (!state) return;

  state.failures++;
  state.lastFailure = Date.now();

  if (state.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    state.isOpen = true;
    logger.warn('AI_CIRCUIT_BREAKER_OPENED', { provider, failures: state.failures });
  }
}

/**
 * Record provider success for circuit breaker
 */
function recordProviderSuccess(provider) {
  const state = circuitBreakerState[provider];
  if (!state) return;

  state.failures = 0;
  state.isOpen = false;
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url, options, timeout = REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

/**
 * Call OpenAI API
 */
export async function callOpenAI(messages) {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: Number(process.env.AI_MAX_TOKENS || 700),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || 'No response generated';
}

/**
 * Call OpenRouter API
 */
export async function callOpenRouter(messages, maxTokensOverride = null) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured');
  }

  const maxTokens = maxTokensOverride || Number(process.env.AI_MAX_TOKENS || 700);

  const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || 'No response generated';
}

/**
 * Call Gemini API
 */
export async function callGemini(messages) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  // Convert OpenAI format to Gemini format
  const geminiMessages = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: geminiMessages,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 700,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';
}

/**
 * Call AI provider with retry logic and provider switching
 */
export async function callAIWithRetry(messages, context, maxRetries = 1) {
  logger.info('AI_PROVIDER_SELECTED', { provider: AI_PROVIDER, model: AI_MODEL });
  logger.info('AI_PROVIDER_REQUEST_START', { provider: AI_PROVIDER });

  const providers = [AI_PROVIDER];

  // Add fallback providers (skip if circuit breaker is open)
  if (AI_PROVIDER === 'openai' && OPENROUTER_API_KEY && !isCircuitBreakerOpen('openrouter')) {
    providers.push('openrouter');
  } else if (AI_PROVIDER === 'openrouter' && OPENAI_API_KEY && !isCircuitBreakerOpen('openai')) {
    providers.push('openai');
  }

  if (GEMINI_API_KEY && !providers.includes('gemini') && !isCircuitBreakerOpen('gemini')) {
    providers.push('gemini');
  }

  for (const provider of providers) {
    // Skip if circuit breaker is open
    if (isCircuitBreakerOpen(provider)) {
      logger.warn('AI_PROVIDER_CIRCUIT_BREAKER_OPEN', { provider });
      continue;
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        let response;
        const maxTokensOverride = attempt > 0 ? 400 : null; // Reduce tokens on retry

        if (provider === 'openrouter') {
          response = await callOpenRouter(messages, maxTokensOverride);
        } else if (provider === 'gemini') {
          response = await callGemini(messages);
        } else {
          response = await callOpenAI(messages);
        }

        logger.info('AI_PROVIDER_RESPONSE_RECEIVED', { provider, attempt });
        logger.info('AI_PROVIDER_REPLY_LENGTH', { length: response?.length || 0 });

        // Validate response
        if (!response || response.trim() === '') {
          logger.warn('AI_PROVIDER_RESPONSE_NULL', { provider });
          throw new Error('Empty response from provider');
        }

        // Record success for circuit breaker
        recordProviderSuccess(provider);

        return {
          success: true,
          response: response,
          provider: provider,
        };
      } catch (aiError) {
        logger.error('AI_PROVIDER_ERROR', { provider, attempt, error: aiError.message });

        // Record failure for circuit breaker
        recordProviderFailure(provider);

        // Check if error is retryable (402, 429, timeout, 5xx)
        const errorMessage = aiError.message?.toLowerCase() || '';
        const isRetryable = errorMessage.includes('timeout') ||
                           errorMessage.includes('429') ||
                           errorMessage.includes('402') ||
                           errorMessage.includes('rate limit') ||
                           errorMessage.includes('5xx') ||
                           errorMessage.includes('502') ||
                           errorMessage.includes('503') ||
                           errorMessage.includes('504');

        // If not retryable or last attempt failed, try next provider
        if (!isRetryable || attempt === maxRetries) {
          logger.warn('AI_PROVIDER_SWITCH_PROVIDER', {
            currentProvider: provider,
            reason: isRetryable ? 'max_retries_exceeded' : 'non_retryable_error',
            error: errorMessage
          });
          break; // Try next provider
        }

        // Wait before retry (exponential backoff)
        const delay = Math.pow(2, attempt) * 1000;
        logger.info('AI_PROVIDER_RETRY', { provider, attempt, delay, maxTokensOverride: 400 });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All providers failed
  logger.warn('AI_ALL_PROVIDERS_FAILED', { reason: 'all_providers_failed' });
  return {
    success: false,
    error: 'All AI providers failed',
    isRetryable: false,
  };
}

/**
 * Build messages for AI provider
 */
export function buildAIMessages(context, message, chatHistory = []) {
  const contextString = JSON.stringify(context, null, 2);
  const limitedHistory = chatHistory.slice(-4);
  
  return [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\nFleet Context:\n${contextString}` },
    ...limitedHistory,
    { role: 'user', content: message }
  ];
}

/**
 * Get system prompt
 */
export function getSystemPrompt() {
  return SYSTEM_PROMPT;
}

/**
 * Get AI provider info
 */
export function getProviderInfo() {
  return {
    provider: AI_PROVIDER,
    model: AI_MODEL,
    hasOpenAIKey: !!OPENAI_API_KEY,
    hasOpenRouterKey: !!OPENROUTER_API_KEY,
    hasGeminiKey: !!GEMINI_API_KEY,
  };
}
