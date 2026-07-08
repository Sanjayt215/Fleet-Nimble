/**
 * FleetNimble AI Service - Main Orchestrator
 * Coordinates AI intent detection, context building, provider calls, and fallbacks
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { detectIntent, extractEntities } from './ai/aiIntentDetector.js';
import { AIContextBuilder } from './ai/aiContextBuilder.js';
import { callAIWithRetry, buildAIMessages, getProviderInfo } from './ai/aiProvider.js';
import { formatSuccessResponse, formatErrorResponse, getSuggestedActions } from './ai/aiResponseFormatter.js';
import { getDeterministicFallback } from './ai/aiDeterministicFallback.js';
import { limitChatHistory, resolvePronouns, saveConversationContext, buildEnhancedContext } from './aiConversationMemory.js';
import { searchKnowledgeBase } from './aiKnowledgeBase.js';
import { getNavigationAnswer, searchProductKnowledge } from './ai/fleetNimbleKnowledgeBase.js';

const AI_ORCHESTRATOR_ENABLED = process.env.AI_ORCHESTRATOR_ENABLED === 'true';
const MAX_PROMPT_CHARS = 6000;

/**
 * Process user message and get AI response
 */
export async function processChatMessage(userId, message, vehicleId = null, chatHistory = []) {
  logger.info('AI_REQUEST_RECEIVED', { userId, message: message?.substring(0, 50) });

  // Validate inputs
  if (!message || typeof message !== 'string' || message.trim() === '') {
    logger.warn('AI_INVALID_INPUT', { userId, message });
    return {
      response: 'Please provide a valid message.',
      context: null,
      knowledgeResults: [],
      metadata: {
        title: "FleetNimble AI Assistant",
        confidence: "LOW",
        dataFreshness: "UNKNOWN",
        simulatedNote: null,
        suggestedActions: [
          "Summarize my fleet health",
          "Show critical alerts",
          "Show vehicles needing maintenance",
        ],
        entities: {},
      },
    };
  }

  try {
    // Step 0: Check for navigation/product knowledge questions first
    const navigationAnswer = getNavigationAnswer(message);
    if (navigationAnswer) {
      logger.info('AI_NAVIGATION_ANSWER_USED', { userId, message });
      return {
        response: navigationAnswer,
        context: null,
        knowledgeResults: [],
        metadata: {
          title: "FleetNimble AI Assistant",
          confidence: "HIGH",
          dataFreshness: "STATIC",
          simulatedNote: null,
          suggestedActions: [
            "Show vehicle details",
            "Show live diagnostics",
            "View dashboard",
          ],
          entities: {},
        },
      };
    }

    // Step 0.5: Resolve pronouns using conversation context
    let resolvedMessage = message;
    try {
      resolvedMessage = await resolvePronouns(userId, message);
      if (resolvedMessage !== message) {
        logger.info('AI_PRONOUN_RESOLUTION', { userId, original: message, resolved: resolvedMessage });
      }
    } catch (pronounError) {
      logger.error('AI_PRONOUN_RESOLUTION_FAILED', { userId, error: pronounError.message });
      resolvedMessage = message; // Use original on error
    }

    // Step 1: Detect intent
    let intentResult;
    try {
      const userVehicles = await getUserVehicles(userId);
      intentResult = {
        intent: detectIntent(resolvedMessage),
        entities: extractEntities(resolvedMessage, userId, userVehicles),
        userVehicles,
      };
      logger.info('AI_INTENT_DETECTED', { userId, intent: intentResult.intent });
    } catch (intentError) {
      logger.error('AI_INTENT_DETECTION_FAILED', { userId, error: intentError.message });
      intentResult = { intent: 'general', entities: {}, userVehicles: [] };
    }
    
    // Step 2: Build context
    let context;
    try {
      const contextBuilder = new AIContextBuilder(userId, message, intentResult.userVehicles);
      context = await contextBuilder.build();
      logger.info('AI_CONTEXT_BUILT', { userId, intent: context.intent });
      
      // Log context preview and length
      const contextString = JSON.stringify(context, null, 2);
      logger.info('AI_CONTEXT_PREVIEW', { 
        userId, 
        intent: context.intent,
        preview: contextString.substring(0, 500) 
      });
      logger.info('AI_CONTEXT_LENGTH', { 
        userId, 
        chars: contextString.length,
        intent: context.intent 
      });
      
      // For fleet_summary, if context is too small, use deterministic fallback
      if (intentResult.intent === 'fleet_summary' && contextString.length < 100) {
        logger.warn('AI_CONTEXT_TOO_SMALL_FOR_FLEET_SUMMARY', { 
          userId, 
          contextLength: contextString.length 
        });
        const fallbackResult = await getDeterministicFallback(userId, message, vehicleId);
        const reply = fallbackResult?.data?.reply || 'Unable to process fleet summary request.';
        logger.info('AI_FALLBACK_USED', { userId, reason: 'context_too_small' });
        return {
          response: reply,
          context,
          knowledgeResults,
          metadata: fallbackResult?.data?.metadata || {
            title: "FleetNimble AI Assistant",
            confidence: "LOW",
            dataFreshness: "UNKNOWN",
            simulatedNote: null,
            suggestedActions: [
              "Summarize my fleet health",
              "Show critical alerts",
              "Show vehicles needing maintenance",
            ],
            entities: {},
          },
        };
      }
    } catch (contextError) {
      logger.error('AI_CONTEXT_BUILD_FAILED', { userId, error: contextError.message });
      context = null;
    }
    
    // Step 3: Search knowledge base
    let knowledgeResults;
    try {
      knowledgeResults = searchKnowledgeBase(message);
    } catch (kbError) {
      logger.error('AI_KNOWLEDGE_BASE_FAILED', { userId, error: kbError.message });
      knowledgeResults = [];
    }
    
    // Step 4: Limit conversation history
    const limitedHistory = limitChatHistory(chatHistory, 4);
    
    // Step 5: Build AI messages
    const messages = buildAIMessages(context, message, limitedHistory);
    
    // Step 6: Check prompt size
    const promptSize = JSON.stringify(messages).length;
    logger.info('AI_PROMPT_SIZE', { userId, chars: promptSize, max: MAX_PROMPT_CHARS });
    
    if (promptSize > MAX_PROMPT_CHARS) {
      logger.warn('AI_TOKEN_LIMIT_EXCEEDED', { userId, promptSize, max: MAX_PROMPT_CHARS });
      // Use deterministic fallback for large prompts
      const fallbackResult = await getDeterministicFallback(userId, message, vehicleId);
      const reply = fallbackResult?.data?.reply || 'Unable to process request due to size constraints.';
      logger.info('AI_FALLBACK_USED', { userId, reason: 'token_limit' });
      return {
        response: reply,
        context,
        knowledgeResults,
        metadata: fallbackResult?.data?.metadata || {
          title: "FleetNimble AI Assistant",
          confidence: "LOW",
          dataFreshness: "UNKNOWN",
          simulatedNote: null,
          suggestedActions: [
            "Summarize my fleet health",
            "Show critical alerts",
            "Show vehicles needing maintenance",
          ],
          entities: {},
        },
      };
    }
    
    // Step 7: Call AI provider with retry
    logger.info('AI_PROVIDER_CALL_START', { userId });
    const aiResult = await callAIWithRetry(messages, context, 1);
    
    if (aiResult?.success && aiResult?.response) {
      // Step 8: Format successful response
      const suggestedActions = getSuggestedActions(context?.intent || intentResult.intent);
      logger.info('AI_RESPONSE_SUCCESS', { userId, provider: aiResult.provider, length: aiResult.response.length });

      // Step 8.5: Save conversation context for follow-up
      try {
        const vehicleForContext = context?.vehicle ? {
          vehicleId: context.vehicle.id,
          vehicleName: context.vehicle.name,
          plate: context.vehicle.plate,
          make: context.vehicle.make,
          model: context.vehicle.model,
        } : null;
        await saveConversationContext(
          userId,
          resolvedMessage,
          { response: aiResult.response, success: true },
          intentResult.entities,
          vehicleForContext
        );
      } catch (contextSaveError) {
        logger.error('AI_CONTEXT_SAVE_FAILED', { userId, error: contextSaveError.message });
        // Don't fail the request if context save fails
      }

      return {
        response: aiResult.response,
        context,
        knowledgeResults,
        metadata: {
          title: "FleetNimble AI Assistant",
          confidence: "MEDIUM",
          dataFreshness: "LIVE",
          simulatedNote: null,
          suggestedActions,
          entities: {},
        },
      };
    } else {
      // Step 9: Use deterministic fallback on provider failure
      logger.warn('AI_PROVIDER_FAILED', { userId, error: aiResult?.error });
      const fallbackResult = await getDeterministicFallback(userId, message, vehicleId);
      const reply = fallbackResult?.data?.reply || 'I apologize, but I encountered an error processing your request. Please try again.';
      logger.info('AI_FALLBACK_USED', { userId, reason: 'provider_failure' });
      return {
        response: reply,
        context,
        knowledgeResults,
        metadata: fallbackResult?.data?.metadata || {
          title: "FleetNimble AI Assistant",
          confidence: "LOW",
          dataFreshness: "UNKNOWN",
          simulatedNote: null,
          suggestedActions: [
            "Summarize my fleet health",
            "Show critical alerts",
            "Show vehicles needing maintenance",
          ],
          entities: {},
        },
      };
    }
  } catch (error) {
    logger.error('AI_SERVICE_ERROR', { userId, error: error.message, stack: error.stack });
    
    // Final fallback
    const fallbackResult = await getDeterministicFallback(userId, message, vehicleId);
    const reply = fallbackResult?.data?.reply || 'I apologize, but I encountered an error processing your request. Please try again.';
    logger.info('AI_FALLBACK_USED', { userId, reason: 'service_error' });
    return {
      response: reply,
      context: null,
      knowledgeResults: [],
      metadata: fallbackResult?.data?.metadata || {
        title: "FleetNimble AI Assistant",
        confidence: "LOW",
        dataFreshness: "UNKNOWN",
        simulatedNote: null,
        suggestedActions: [
          "Summarize my fleet health",
          "Show critical alerts",
          "Show vehicles needing maintenance",
        ],
        entities: {},
      },
    };
  }
}

/**
 * Process user message with streaming response
 */
export async function processChatMessageStream(userId, message, vehicleId = null, chatHistory = [], onChunk) {
  logger.info('AI_SERVICE_STREAM_START', { userId, message: message?.substring(0, 50) });
  
  try {
    // For streaming, use the same logic but stream the response
    // This is a simplified version - full streaming would require provider-specific handling
    const result = await processChatMessage(userId, message, vehicleId, chatHistory);
    
    // Simulate streaming by sending chunks
    const chunks = result.response.split(' ');
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
 * Get user chats
 */
export async function getUserChats(userId) {
  try {
    const chats = await prisma.aiChat.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { messages: true },
        },
      },
    });
    
    return chats.map(chat => ({
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messageCount: chat._count.messages,
    }));
  } catch (error) {
    console.error('Error getting user chats', error);
    return [];
  }
}

/**
 * Get chat with messages
 */
export async function getChatWithMessages(chatId, userId) {
  try {
    const chat = await prisma.aiChat.findFirst({
      where: { id: chatId, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    
    if (!chat) {
      throw new Error('Chat not found');
    }
    
    return chat;
  } catch (error) {
    console.error('Error getting chat with messages', error);
    throw error;
  }
}

/**
 * Save message to chat
 */
export async function saveMessage(chatId, role, content, metadata = {}) {
  try {
    const message = await prisma.aiMessage.create({
      data: {
        chatId,
        role,
        content,
        metadata,
      },
    });
    
    // Update chat timestamp
    await prisma.aiChat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });
    
    return message;
  } catch (error) {
    console.error('Error saving message', error);
    throw error;
  }
}

/**
 * Create new chat
 */
export async function createChat(userId, title) {
  try {
    const chat = await prisma.aiChat.create({
      data: {
        userId,
        title,
      },
    });
    
    return chat;
  } catch (error) {
    console.error('Error creating chat', error);
    throw error;
  }
}

/**
 * Delete chat
 */
export async function deleteChat(chatId, userId) {
  try {
    // Delete messages first
    await prisma.aiMessage.deleteMany({
      where: { chatId },
    });
    
    // Delete chat
    await prisma.aiChat.deleteMany({
      where: { id: chatId, userId },
    });
    
    return true;
  } catch (error) {
    console.error('Error deleting chat', error);
    throw error;
  }
}

/**
 * Generate title for chat
 */
export async function generateTitle(chatId) {
  try {
    const chat = await prisma.aiChat.findUnique({
      where: { id: chatId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    
    if (!chat || chat.messages.length === 0) {
      return 'New Chat';
    }
    
    const firstMessage = chat.messages[0].content;
    return firstMessage.substring(0, 50) + (firstMessage.length > 50 ? '...' : '');
  } catch (error) {
    console.error('Error generating title', error);
    return 'New Chat';
  }
}

/**
 * Summarize conversation
 */
export async function summarizeConversation(chatId) {
  try {
    const chat = await prisma.aiChat.findUnique({
      where: { id: chatId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 10,
        },
      },
    });
    
    if (!chat || chat.messages.length === 0) {
      return 'No messages to summarize';
    }
    
    const messageCount = chat.messages.length;
    const userMessages = chat.messages.filter(m => m.role === 'user').length;
    const assistantMessages = chat.messages.filter(m => m.role === 'assistant').length;
    
    return `Chat with ${messageCount} messages (${userMessages} user, ${assistantMessages} assistant).`;
  } catch (error) {
    console.error('Error summarizing conversation', error);
    return 'Unable to summarize conversation';
  }
}

/**
 * Get user vehicles for entity extraction
 */
async function getUserVehicles(userId) {
  return prisma.vehicle.findMany({
    where: { userId, deletedAt: null },
    select: { id: true, vehicleName: true, registrationNumber: true, vin: true },
  });
}

/**
 * Verify AI service startup
 */
export function verifyAIServiceStartup() {
  logger.info('AI_SERVICE_STARTUP_VERIFICATION');
  logger.info('✓ Intent Detector Loaded');
  logger.info('✓ Context Builder Loaded');
  logger.info('✓ AI Provider Loaded');
  logger.info('✓ Deterministic Fallback Loaded');
  logger.info('✓ AI Response Formatter Loaded');
  logger.info('✓ FleetNimble AI Ready');
  
  const providerInfo = getProviderInfo();
  logger.info('AI_PROVIDER_INFO', providerInfo);
  
  return true;
}
