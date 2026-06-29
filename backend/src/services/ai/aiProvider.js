/**
 * AI Provider Module
 * Handles calls to OpenAI and OpenRouter APIs
 */

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const SYSTEM_PROMPT = `You are FleetNimble AI Assistant. Answer using only provided fleet context. Be concise, professional, and actionable. If data is unavailable, say so. Do not invent data.`;

/**
 * Call OpenAI API
 */
export async function callOpenAI(messages) {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 1000,
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
export async function callOpenRouter(messages) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 1000,
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
 * Call AI provider with retry logic
 */
export async function callAIWithRetry(messages, context, maxRetries = 1) {
  console.log('AI_PROVIDER_CALL_START', { provider: AI_PROVIDER, retries: maxRetries });
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let response;
      if (AI_PROVIDER === 'openrouter') {
        response = await callOpenRouter(messages);
      } else {
        response = await callOpenAI(messages);
      }
      
      console.log('AI_PROVIDER_CALL_SUCCESS', { attempt });
      
      return {
        success: true,
        response: response || 'No response generated',
        provider: AI_PROVIDER,
      };
    } catch (aiError) {
      console.error('AI_PROVIDER_CALL_FAILED', { attempt, error: aiError.message });
      
      // Check if error is retryable
      const errorMessage = aiError.message?.toLowerCase() || '';
      const isRetryable = errorMessage.includes('timeout') || 
                         errorMessage.includes('429') || 
                         errorMessage.includes('rate limit') ||
                         errorMessage.includes('5xx');
      
      // If not retryable or last attempt failed, return failure
      if (!isRetryable || attempt === maxRetries) {
        console.log('AI_PROVIDER_FALLBACK_TRIGGERED', { 
          reason: isRetryable ? 'max_retries_exceeded' : 'non_retryable_error',
          error: errorMessage 
        });
        
        return {
          success: false,
          error: aiError.message,
          isRetryable,
        };
      }
      
      // Wait before retry (exponential backoff)
      const delay = Math.pow(2, attempt) * 1000;
      console.log('AI_PROVIDER_RETRY', { attempt, delay });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
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
  };
}
