/**
 * AI Conversation Memory Service
 * Enhanced conversation memory with historical data comparison and user preferences
 */

import { config } from '../config/index.js';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

const MEMORY_ENABLED = config.ai.memoryEnabled;

/**
 * Limit conversation history to prevent token overflow
 */
export function limitChatHistory(chatHistory, maxMessages = 8) {
  return chatHistory.slice(-maxMessages);
}

/**
 * Save conversation message
 */
export async function saveConversationMessage(userId, chatId, role, content, metadata = {}) {
  try {
    // Find or create chat
    let chat;
    if (chatId) {
      chat = await prisma.aiChat.findUnique({
        where: { id: chatId },
      });
    }

    if (!chat) {
      chat = await prisma.aiChat.create({
        data: {
          userId,
          title: content.substring(0, 50),
        },
      });
    }

    // Save message
    const message = await prisma.aiMessage.create({
      data: {
        chatId: chat.id,
        role,
        content,
        metadata,
      },
    });

    return {
      chatId: chat.id,
      messageId: message.id,
    };
  } catch (error) {
    console.error('Error saving conversation message', error);
    return null;
  }
}

/**
 * Clear conversation history
 */
export async function clearConversationHistory(userId, chatId) {
  try {
    await prisma.aiMessage.deleteMany({
      where: {
        chat: { id: chatId, userId },
      },
    });

    await prisma.aiChat.delete({
      where: { id: chatId },
    });

    return true;
  } catch (error) {
    console.error('Error clearing conversation history', error);
    return false;
  }
}

/**
 * Store conversation context for historical comparison
 */
export async function storeConversationContext(userId, vehicleId, contextData) {
  try {
    const context = await prisma.aiConversationContext.create({
      data: {
        userId,
        vehicleId,
        batteryVoltage: contextData.batteryVoltage,
        coolantTemp: contextData.coolantTemp,
        fuelLevel: contextData.fuelLevel,
        odometer: contextData.odometer,
        rpm: contextData.rpm,
        speed: contextData.speed,
        timestamp: new Date(),
      },
    });

    logger.info('Conversation context stored', { userId, vehicleId, contextId: context.id });

    return context;
  } catch (error) {
    logger.error('Error storing conversation context', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Get historical context for comparison
 */
export async function getHistoricalContext(userId, vehicleId, hoursBack = 24) {
  try {
    const cutoffDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const contexts = await prisma.aiConversationContext.findMany({
      where: {
        userId,
        vehicleId,
        timestamp: { gte: cutoffDate },
      },
      orderBy: { timestamp: 'desc' },
      take: 10,
    });

    return contexts;
  } catch (error) {
    logger.error('Error getting historical context', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Compare current data with historical data
 */
export async function compareWithHistorical(userId, vehicleId, currentData) {
  try {
    const historicalContexts = await getHistoricalContext(userId, vehicleId, 24);

    if (historicalContexts.length === 0) {
      return {
        hasHistoricalData: false,
        message: 'No historical data available for comparison',
      };
    }

    const latestHistorical = historicalContexts[0];
    const comparisons = [];

    // Battery voltage comparison
    if (currentData.batteryVoltage && latestHistorical.batteryVoltage) {
      const voltageDiff = currentData.batteryVoltage - latestHistorical.batteryVoltage;
      comparisons.push({
        metric: 'Battery Voltage',
        current: currentData.batteryVoltage.toFixed(2),
        previous: latestHistorical.batteryVoltage.toFixed(2),
        difference: voltageDiff.toFixed(2),
        trend: voltageDiff > 0 ? 'Increased' : voltageDiff < 0 ? 'Decreased' : 'Stable',
        significant: Math.abs(voltageDiff) > 0.5,
      });
    }

    // Coolant temperature comparison
    if (currentData.coolantTemp && latestHistorical.coolantTemp) {
      const tempDiff = currentData.coolantTemp - latestHistorical.coolantTemp;
      comparisons.push({
        metric: 'Coolant Temperature',
        current: currentData.coolantTemp.toFixed(1),
        previous: latestHistorical.coolantTemp.toFixed(1),
        difference: tempDiff.toFixed(1),
        trend: tempDiff > 0 ? 'Increased' : tempDiff < 0 ? 'Decreased' : 'Stable',
        significant: Math.abs(tempDiff) > 5,
      });
    }

    // Fuel level comparison
    if (currentData.fuelLevel && latestHistorical.fuelLevel) {
      const fuelDiff = currentData.fuelLevel - latestHistorical.fuelLevel;
      comparisons.push({
        metric: 'Fuel Level',
        current: currentData.fuelLevel.toFixed(1),
        previous: latestHistorical.fuelLevel.toFixed(1),
        difference: fuelDiff.toFixed(1),
        trend: fuelDiff > 0 ? 'Increased' : fuelDiff < 0 ? 'Decreased' : 'Stable',
        significant: Math.abs(fuelDiff) > 5,
      });
    }

    // Odometer comparison
    if (currentData.odometer && latestHistorical.odometer) {
      const odometerDiff = currentData.odometer - latestHistorical.odometer;
      comparisons.push({
        metric: 'Odometer',
        current: currentData.odometer.toFixed(0),
        previous: latestHistorical.odometer.toFixed(0),
        difference: odometerDiff.toFixed(0),
        trend: 'Increased',
        significant: odometerDiff > 100,
      });
    }

    return {
      hasHistoricalData: true,
      previousTimestamp: latestHistorical.timestamp,
      comparisons,
      significantChanges: comparisons.filter(c => c.significant),
    };
  } catch (error) {
    logger.error('Error comparing with historical data', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Store user preference
 */
export async function setUserPreference(userId, preferenceKey, preferenceValue) {
  try {
    const preference = await prisma.aiUserPreference.upsert({
      where: {
        userId_key: {
          userId,
          key: preferenceKey,
        },
      },
      update: {
        value: preferenceValue,
        updatedAt: new Date(),
      },
      create: {
        userId,
        key: preferenceKey,
        value: preferenceValue,
      },
    });

    logger.info('User preference stored', { userId, preferenceKey });

    return preference;
  } catch (error) {
    logger.error('Error storing user preference', { userId, preferenceKey, error: error.message });
    throw error;
  }
}

/**
 * Get user preference
 */
export async function getUserPreference(userId, preferenceKey) {
  try {
    const preference = await prisma.aiUserPreference.findUnique({
      where: {
        userId_key: {
          userId,
          key: preferenceKey,
        },
      },
    });

    return preference ? preference.value : null;
  } catch (error) {
    logger.error('Error getting user preference', { userId, preferenceKey, error: error.message });
    throw error;
  }
}

/**
 * Get all user preferences
 */
export async function getAllUserPreferences(userId) {
  try {
    const preferences = await prisma.aiUserPreference.findMany({
      where: { userId },
    });

    const preferencesMap = {};
    preferences.forEach(pref => {
      preferencesMap[pref.key] = pref.value;
    });

    return preferencesMap;
  } catch (error) {
    logger.error('Error getting all user preferences', { userId, error: error.message });
    throw error;
  }
}

/**
 * Store conversation summary for context
 */
export async function storeConversationSummary(userId, chatId, summary, keyTopics) {
  try {
    const conversationSummary = await prisma.aiConversationSummary.create({
      data: {
        userId,
        chatId,
        summary,
        keyTopics,
        createdAt: new Date(),
      },
    });

    logger.info('Conversation summary stored', { userId, chatId });

    return conversationSummary;
  } catch (error) {
    logger.error('Error storing conversation summary', { userId, chatId, error: error.message });
    throw error;
  }
}

/**
 * Get relevant conversation summaries
 */
export async function getRelevantConversationSummaries(userId, query, limit = 5) {
  try {
    const summaries = await prisma.aiConversationSummary.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Simple keyword matching for relevance
    const queryLower = query.toLowerCase();
    const relevantSummaries = summaries.filter(summary => {
      const summaryText = summary.summary.toLowerCase();
      const topicsText = summary.keyTopics.join(' ').toLowerCase();
      return summaryText.includes(queryLower) || topicsText.includes(queryLower);
    });

    return relevantSummaries.slice(0, limit);
  } catch (error) {
    logger.error('Error getting relevant conversation summaries', { userId, query, error: error.message });
    throw error;
  }
}

/**
 * Build enhanced context with memory
 */
export async function buildEnhancedContext(userId, vehicleId, currentData) {
  try {
    const [historicalComparison, userPreferences, relevantSummaries] = await Promise.all([
      vehicleId ? compareWithHistorical(userId, vehicleId, currentData) : Promise.resolve({ hasHistoricalData: false }),
      getAllUserPreferences(userId),
      getRelevantConversationSummaries(userId, vehicleId ? `vehicle ${vehicleId}` : 'fleet', 3),
    ]);

    return {
      historicalComparison,
      userPreferences,
      relevantSummaries,
      hasMemory: historicalComparison.hasHistoricalData || relevantSummaries.length > 0,
    };
  } catch (error) {
    logger.error('Error building enhanced context', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Clean up old conversation contexts (older than 30 days)
 */
export async function cleanupOldConversationContexts() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const deleted = await prisma.aiConversationContext.deleteMany({
      where: {
        timestamp: { lt: thirtyDaysAgo },
      },
    });

    logger.info('Cleaned up old conversation contexts', { count: deleted.count });

    return deleted.count;
  } catch (error) {
    logger.error('Error cleaning up old conversation contexts', { error: error.message });
    throw error;
  }
}

/**
 * Clean up old conversation summaries (older than 90 days)
 */
export async function cleanupOldConversationSummaries() {
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const deleted = await prisma.aiConversationSummary.deleteMany({
      where: {
        createdAt: { lt: ninetyDaysAgo },
      },
    });

    logger.info('Cleaned up old conversation summaries', { count: deleted.count });

    return deleted.count;
  } catch (error) {
    logger.error('Error cleaning up old conversation summaries', { error: error.message });
    throw error;
  }
}

// Run cleanup daily
setInterval(() => {
  cleanupOldConversationContexts().catch(err => logger.error('Cleanup failed', { error: err.message }));
  cleanupOldConversationSummaries().catch(err => logger.error('Cleanup failed', { error: err.message }));
}, 24 * 60 * 60 * 1000);

/**
 * Save conversation context for follow-up support
 */
export async function saveConversationContext(userId, message, response, entities, vehicleContext) {
  if (!MEMORY_ENABLED) return null;
  try {
    const context = await prisma.aiConversationContext.create({
      data: {
        userId,
        vehicleId: vehicleContext?.vehicleId || null,
        lastMessage: message,
        lastResponse: typeof response === 'string' ? response : JSON.stringify(response),
        lastEntities: JSON.stringify(entities || {}),
        lastVehicleContext: JSON.stringify(vehicleContext || {}),
        timestamp: new Date(),
      },
    });

    logger.info('AI_CONVERSATION_CONTEXT_SAVED', { userId, contextId: context.id });

    return context;
  } catch (error) {
    logger.warn('AI_MEMORY_CONTEXT_FAILED', { error: error.message });
    return null;
  }
}

/**
 * Get conversation context for pronoun resolution
 */
export async function getConversationContext(userId, conversationId = null) {
  if (!MEMORY_ENABLED) {
    return { userId, lastEntities: null, lastVehicleContext: null, timestamp: null };
  }
  try {
    const where = conversationId 
      ? { userId, id: conversationId }
      : { userId };

    const context = await prisma.aiConversationContext.findFirst({
      where,
      orderBy: { timestamp: 'desc' },
    });

    if (!context) {
      return {
        userId,
        lastEntities: null,
        lastVehicleContext: null,
        timestamp: null,
      };
    }

    return {
      id: context.id,
      userId: context.userId,
      vehicleId: context.vehicleId,
      lastMessage: context.lastMessage,
      lastResponse: context.lastResponse ? JSON.parse(context.lastResponse) : null,
      lastEntities: context.lastEntities ? JSON.parse(context.lastEntities) : null,
      lastVehicleContext: context.lastVehicleContext ? JSON.parse(context.lastVehicleContext) : null,
      timestamp: context.timestamp,
    };
  } catch (error) {
    logger.warn('AI_MEMORY_CONTEXT_FAILED', { error: error.message, userId });
    return {
      userId,
      lastIntent: null,
      lastVehicle: null,
      lastTopic: null,
      lastVehicleCandidates: [],
    };
  }
}

/**
 * Resolve pronouns in user message using conversation context
 * Examples:
 * - "Show Honda Amaze" -> "What about its battery?" -> "What about Honda Amaze's battery?"
 * - "Compare Honda Amaze with Mazda 3" -> "Which is better?" -> "Which is better: Honda Amaze or Mazda 3?"
 */
export async function resolvePronouns(userId, message, vehicleContext = null) {
  try {
    const context = await getConversationContext(userId);
    
    if (!context) {
      return message;
    }

    let resolvedMessage = message;
    const entities = context.lastEntities;
    const lastVehicle = context.lastVehicleContext;

    const vehicleName = lastVehicle?.vehicleName ||
                        lastVehicle?.name ||
                        entities?.vehicles?.[0]?.vehicleName ||
                        entities?.vehicles?.[0]?.name ||
                        null;

    const vehicleMake = lastVehicle?.make || entities?.vehicles?.[0]?.make || null;
    const vehicleModel = lastVehicle?.model || entities?.vehicles?.[0]?.model || null;

    const hasVehicleRef = /(it|its|this|that)\b/i.test(message);

    if (hasVehicleRef && !vehicleName && (vehicleMake || vehicleModel)) {
      const displayName = [vehicleMake, vehicleModel].filter(Boolean).join(' ');
      const pronounPatterns = [
        { pattern: /\bit\b/gi, replacement: displayName || 'it' },
        { pattern: /\bits\b'?s?\b/gi, replacement: `${displayName || 'the vehicle'}'s` },
        { pattern: /\bthis\b/gi, replacement: displayName || 'this vehicle' },
        { pattern: /\bthat\b/gi, replacement: displayName || 'that vehicle' },
      ];
      pronounPatterns.forEach(({ pattern, replacement }) => {
        resolvedMessage = resolvedMessage.replace(pattern, replacement);
      });
    } else if (hasVehicleRef && vehicleName) {
      const pronounPatterns = [
        { pattern: /\bit\b/gi, replacement: vehicleName },
        { pattern: /\bits\b'?s?\b/gi, replacement: `${vehicleName}'s` },
        { pattern: /\bthis\b/gi, replacement: vehicleName },
        { pattern: /\bthat\b/gi, replacement: vehicleName },
      ];
      pronounPatterns.forEach(({ pattern, replacement }) => {
        resolvedMessage = resolvedMessage.replace(pattern, replacement);
      });
    }

    if (entities?.vehicles && entities.vehicles.length >= 2) {
      const names = entities.vehicles.map(v => v.vehicleName || v.name).filter(Boolean);
      if (names.length >= 2) {
        const vehicleNamesStr = names.join(' or ');
        resolvedMessage = resolvedMessage.replace(/\bwhich\b/gi, `which of ${vehicleNamesStr}`);
      }
    }

    if (resolvedMessage !== message) {
      logger.info('AI_PRONOUNS_RESOLVED', { userId, original: message, resolved: resolvedMessage });
    }

    return resolvedMessage;
  } catch (error) {
    console.error('AI FAILED AT RESOLVE PRONOUNS', error);
    console.error(error.stack);
    return message;
  }
}

/**
 * Get recent conversation history for context
 */
export async function getConversationHistory(userId, limit = 5) {
  try {
    const contexts = await prisma.aiConversationContext.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return contexts.map(ctx => ({
      message: ctx.lastMessage,
      vehicleId: ctx.vehicleId,
      timestamp: ctx.timestamp,
    }));
  } catch (error) {
    logger.error('Error getting conversation history', { userId, error: error.message });
    throw error;
  }
}

/**
 * Clear conversation context for a user
 */
export async function clearConversationContext(userId) {
  try {
    const deleted = await prisma.aiConversationContext.deleteMany({
      where: { userId },
    });

    logger.info('Conversation context cleared', { userId, count: deleted.count });

    return deleted.count;
  } catch (error) {
    logger.error('Error clearing conversation context', { userId, error: error.message });
    throw error;
  }
}
