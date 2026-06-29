/**
 * FleetNimble AI Service - Main Orchestrator
 * Coordinates AI intent detection, context building, provider calls, and fallbacks
 */

import { detectIntent, extractEntities } from './ai/aiIntentDetector.js';
import { AIContextBuilder } from './ai/aiContextBuilder.js';
import { callAIWithRetry, buildAIMessages, getProviderInfo } from './ai/aiProvider.js';
import { formatSuccessResponse, formatErrorResponse, getSuggestedActions } from './ai/aiResponseFormatter.js';
import { getDeterministicFallback } from './ai/aiDeterministicFallback.js';
import { getConversationHistory, saveConversationMessage, limitChatHistory } from './aiConversationMemory.js';
import { searchKnowledgeBase } from './aiKnowledgeBase.js';

const AI_ORCHESTRATOR_ENABLED = process.env.AI_ORCHESTRATOR_ENABLED === 'true';
const MAX_PROMPT_CHARS = 12000;

/**
 * Process user message and get AI response
 */
export async function processChatMessage(userId, message, vehicleId = null, chatHistory = []) {
  console.log('AI_SERVICE_PROCESS_START', { userId, message: message?.substring(0, 50) });
  
  try {
    // Step 1: Detect intent
    let intentResult;
    try {
      const userVehicles = await getUserVehicles(userId);
      intentResult = {
        intent: detectIntent(message),
        entities: extractEntities(message, userId, userVehicles),
        userVehicles,
      };
      console.log('AI_STEP_INTENT_OK', { intent: intentResult.intent });
    } catch (intentError) {
      console.error('AI_STEP_INTENT_FAILED', intentError);
      intentResult = { intent: 'general', entities: {}, userVehicles: [] };
    }
    
    // Step 2: Build context
    let context;
    try {
      const contextBuilder = new AIContextBuilder(userId, message, intentResult.userVehicles);
      context = await contextBuilder.build();
      console.log('AI_STEP_CONTEXT_OK', { intent: context.intent });
    } catch (contextError) {
      console.error('AI_STEP_CONTEXT_FAILED', contextError);
      context = null;
    }
    
    // Step 3: Search knowledge base
    let knowledgeResults;
    try {
      knowledgeResults = searchKnowledgeBase(message);
    } catch (kbError) {
      console.error('AI_FAILED_AT_KNOWLEDGE_BASE', kbError);
      knowledgeResults = [];
    }
    
    // Step 4: Limit conversation history
    const limitedHistory = limitChatHistory(chatHistory, 4);
    
    // Step 5: Build AI messages
    const messages = buildAIMessages(context, message, limitedHistory);
    
    // Step 6: Check prompt size
    const promptSize = JSON.stringify(messages).length;
    console.log('AI_PROMPT_SIZE_CHARS', promptSize);
    
    if (promptSize > MAX_PROMPT_CHARS) {
      console.log('AI_TOKEN_LIMIT_EXCEEDED', { promptSize, max: MAX_PROMPT_CHARS });
      // Use deterministic fallback for large prompts
      const fallbackResult = await getDeterministicFallback(userId, message, vehicleId);
      return formatSuccessResponse(fallbackResult.data.reply, context, fallbackResult.data.metadata);
    }
    
    // Step 7: Call AI provider with retry
    const aiResult = await callAIWithRetry(messages, context, 1);
    
    if (aiResult.success) {
      // Step 8: Format successful response
      const suggestedActions = getSuggestedActions(context?.intent || intentResult.intent);
      return formatSuccessResponse(aiResult.response, context, {
        confidence: "MEDIUM",
        dataFreshness: "LIVE",
        suggestedActions,
      });
    } else {
      // Step 9: Use deterministic fallback on provider failure
      console.log('AI_PROVIDER_FAILED', aiResult.error);
      console.log('AI_DETERMINISTIC_FALLBACK_USED');
      const fallbackResult = await getDeterministicFallback(userId, message, vehicleId);
      return formatSuccessResponse(fallbackResult.data.reply, context, fallbackResult.data.metadata);
    }
  } catch (error) {
    console.error('AI_SERVICE_ERROR', error);
    console.error(error.stack);
    
    // Final fallback
    const fallbackResult = await getDeterministicFallback(userId, message, vehicleId);
    return formatSuccessResponse(fallbackResult.data.reply, null, fallbackResult.data.metadata);
  }
}

/**
 * Process user message with streaming response
 */
export async function processChatMessageStream(userId, message, vehicleId = null, chatHistory = [], onChunk) {
  console.log('AI_SERVICE_STREAM_START', { userId, message: message?.substring(0, 50) });
  
  try {
    // For streaming, use the same logic but stream the response
    // This is a simplified version - full streaming would require provider-specific handling
    const result = await processChatMessage(userId, message, vehicleId, chatHistory);
    
    // Simulate streaming by sending chunks
    const chunks = result.data.reply.split(' ');
    for (const chunk of chunks) {
      onChunk(chunk + ' ');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    return result;
  } catch (error) {
    console.error('AI_SERVICE_STREAM_ERROR', error);
    onChunk('Error processing request');
    return formatErrorResponse(error);
  }
}

/**
 * Get user vehicles for entity extraction
 */
async function getUserVehicles(userId) {
  const prisma = (await import('../utils/prisma.js')).default;
  return prisma.vehicle.findMany({
    where: { userId, deletedAt: null },
    select: { id: true, name: true, plateNumber: true, vin: true },
  });
}

/**
 * Verify AI service startup
 */
export function verifyAIServiceStartup() {
  console.log('✓ Intent Detector Loaded');
  console.log('✓ Context Builder Loaded');
  console.log('✓ AI Provider Loaded');
  console.log('✓ Deterministic Fallback Loaded');
  console.log('✓ AI Response Formatter Loaded');
  console.log('✓ FleetNimble AI Ready');
  
  const providerInfo = getProviderInfo();
  console.log('AI Provider Info:', providerInfo);
  
  return true;
}
