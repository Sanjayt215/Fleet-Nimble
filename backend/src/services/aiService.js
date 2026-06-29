import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { executeTool, getAvailableTools } from './aiTools.js';
import { searchKnowledgeBase, getKnowledgeBaseContext } from './aiKnowledgeBase.js';
import { orchestrateAI } from './aiOrchestrator.js';
import { buildCompactContext } from './aiCompactContext.js';

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const AI_ORCHESTRATOR_ENABLED = process.env.AI_ORCHESTRATOR_ENABLED === 'true';

// Compact system prompt for FleetNimble AI Assistant
const SYSTEM_PROMPT = `You are FleetNimble AI Assistant. Answer using only provided fleet context. Be concise, professional, and actionable. If data is unavailable, say so. Do not invent data.`;

const MAX_PROMPT_CHARS = 12000;

/**
 * Build context from user's fleet data with conversational memory support
 */
async function buildContext(userId, vehicleId = null) {
  try {
    // Get user's vehicles
    const vehicles = await prisma.vehicle.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(vehicleId ? { id: vehicleId } : {}),
      },
      include: {
        liveState: true,
        telematicsDevice: true,
        gpsLocation: true,
        dtcCodes: {
          where: { active: true },
          orderBy: { detectedAt: 'desc' },
        },
        alerts: {
          where: { read: false },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        maintenanceLogs: {
          where: { completed: false },
          orderBy: { dueDate: 'asc' },
          take: 10,
        },
        _count: {
          select: { trips: true },
        },
      },
    });

    if (vehicles.length === 0) {
      return {
        hasVehicles: false,
        message: 'No vehicles found for this user',
      };
    }

    // Get latest telemetry for each vehicle
    const vehiclesWithTelemetry = await Promise.all(
      vehicles.map(async (vehicle) => {
        const latestTelemetry = await prisma.obdLiveData.findFirst({
          where: { vehicleId: vehicle.id },
          orderBy: { recordedAt: 'desc' },
        });

        return {
          ...vehicle,
          latestTelemetry,
        };
      })
    );

    // Build context object with enhanced conversational memory support
    const context = {
      hasVehicles: true,
      vehicleCount: vehicles.length,
      selectedVehicleId: vehicleId,
      vehicles: vehiclesWithTelemetry.map((v) => ({
        id: v.id,
        name: `${v.make} ${v.model}`,
        plate: v.plateNumber || v.vin || 'Unknown',
        year: v.year,
        odometer: v.odometer,
        status: v.liveState?.vehicleStatus || 'UNKNOWN',
        ignition: v.liveState?.ignitionStatus ? 'ON' : 'OFF',
        telemetrySource: v.liveState?.telemetrySource || 'UNKNOWN',
        lastTelemetryUpdate: v.liveState?.lastUpdate || v.lastObdAt,
        telemetryOnline: v.telemetryOnline,
        latestTelemetry: v.latestTelemetry ? {
          rpm: v.latestTelemetry.rpm,
          speed: v.latestTelemetry.speed,
          coolantTemp: v.latestTelemetry.coolantTemp,
          fuelLevel: v.latestTelemetry.fuelLevel,
          batteryVoltage: v.latestTelemetry.batteryVoltage,
          engineLoad: v.latestTelemetry.engineLoad,
          throttle: v.latestTelemetry.throttle,
          maf: v.latestTelemetry.maf,
          intakeTemp: v.latestTelemetry.intakeTemp,
          recordedAt: v.latestTelemetry.recordedAt,
        } : null,
        gps: v.gpsLocation ? {
          lat: v.gpsLocation.lat,
          lng: v.gpsLocation.lng,
          recordedAt: v.gpsLocation.recordedAt,
        } : null,
        activeDtcCodes: v.dtcCodes.map((dtc) => ({
          code: dtc.code,
          description: dtc.description,
          severity: dtc.severity,
          detectedAt: dtc.detectedAt,
        })),
        unreadAlerts: v.alerts.map((alert) => ({
          type: alert.alertType,
          message: alert.message,
          severity: alert.severity,
          createdAt: alert.createdAt,
        })),
        pendingMaintenance: v.maintenanceLogs.map((log) => ({
          type: log.serviceType,
          dueKm: log.dueKm,
          dueDate: log.dueDate,
          notes: log.notes,
        })),
        tripCount: v._count.trips,
      })),
    };

    return context;
  } catch (error) {
    logger.error('Error building AI context', { error: error.message, userId, vehicleId });
    throw error;
  }
}

/**
 * Call AI provider (OpenAI or OpenRouter) - non-streaming
 */
async function callAI(messages) {
  try {
    let apiUrl, headers, body;

    if (AI_PROVIDER === 'openai') {
      if (!OPENAI_API_KEY) {
        return 'AI provider is not configured. Please add OPENAI_API_KEY in environment variables to enable the FleetNimble AI Assistant.';
      }
      apiUrl = 'https://api.openai.com/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      };
    } else if (AI_PROVIDER === 'openrouter') {
      if (!OPENROUTER_API_KEY) {
        return 'AI provider is not configured. Please add OPENROUTER_API_KEY in environment variables to enable the FleetNimble AI Assistant.';
      }
      apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      };
    } else {
      return `Unsupported AI provider: ${AI_PROVIDER}. Please set AI_PROVIDER to 'openai' or 'openrouter' in environment variables.`;
    }

    body = {
      model: AI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ],
      temperature: 0.7,
      max_tokens: 1000,
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    logger.error('Error calling AI provider', { error: error.message, provider: AI_PROVIDER });
    throw error;
  }
}

/**
 * Call AI provider with streaming response
 */
async function callAIStream(messages, onChunk) {
  try {
    let apiUrl, headers, body;

    if (AI_PROVIDER === 'openai') {
      if (!OPENAI_API_KEY) {
        onChunk('AI provider is not configured. Please add OPENAI_API_KEY in environment variables to enable the FleetNimble AI Assistant.');
        return;
      }
      apiUrl = 'https://api.openai.com/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      };
    } else if (AI_PROVIDER === 'openrouter') {
      if (!OPENROUTER_API_KEY) {
        onChunk('AI provider is not configured. Please add OPENROUTER_API_KEY in environment variables to enable the FleetNimble AI Assistant.');
        return;
      }
      apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      };
    } else {
      onChunk(`Unsupported AI provider: ${AI_PROVIDER}. Please set AI_PROVIDER to 'openai' or 'openrouter' in environment variables.`);
      return;
    }

    body = {
      model: AI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ],
      temperature: 0.7,
      max_tokens: 1000,
      stream: true,
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line === 'data: [DONE]') continue;
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              onChunk(content);
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  } catch (error) {
    logger.error('Error calling AI provider stream', { error: error.message, provider: AI_PROVIDER });
    throw error;
  }
}

/**
 * Stable fallback chatbot implementation (without orchestrator)
 * Uses direct OpenAI/OpenRouter call with compact fleet context
 */
async function processChatMessageStable(userId, message, vehicleId = null, chatHistory = []) {
  console.log('AI STABLE FALLBACK START', { userId, message: message?.substring(0, 50) });
  
  try {
    // Build compact context based on intent
    let context;
    try {
      context = await buildCompactContext(userId, message, vehicleId);
    } catch (contextError) {
      console.error('AI FAILED AT BUILD COMPACT CONTEXT', contextError);
      console.error(contextError.stack);
      context = { intent: 'error', dataSource: 'none', recordCounts: {} };
    }

    // Search knowledge base for relevant information
    let knowledgeResults;
    try {
      knowledgeResults = searchKnowledgeBase(message);
    } catch (kbError) {
      console.error('AI FAILED AT KNOWLEDGE BASE', kbError);
      console.error(kbError.stack);
      knowledgeResults = [];
    }

    // Limit conversation history to last 4 messages (2 user, 2 assistant)
    const limitedHistory = chatHistory.slice(-4);
    console.log('AI_HISTORY_LIMITED', { original: chatHistory.length, limited: limitedHistory.length });

    // Build messages for OpenAI/OpenRouter
    const contextString = JSON.stringify(context, null, 2);
    const messages = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\nFleet Context:\n${contextString}` },
      ...limitedHistory,
      { role: 'user', content: message }
    ];

    // Token guard - check prompt size
    const promptSize = JSON.stringify(messages).length;
    console.log('AI_CONTEXT_SIZE_CHARS', promptSize);
    
    if (promptSize > MAX_PROMPT_CHARS) {
      console.log('AI_TOKEN_LIMIT_EXCEEDED', { promptSize, max: MAX_PROMPT_CHARS });
      // Truncate context - remove conversation history
      const truncatedMessages = [
        { role: 'system', content: `${SYSTEM_PROMPT}\n\nFleet Context:\n${JSON.stringify({ intent: context.intent, dataSource: context.dataSource, recordCounts: context.recordCounts }, null, 2)}` },
        { role: 'user', content: message }
      ];
      
      const truncatedSize = JSON.stringify(truncatedMessages).length;
      console.log('AI_CONTEXT_TRUNCATED', { original: promptSize, truncated: truncatedSize });
      
      // Try with truncated context
      return await callAIWithFallback(userId, truncatedMessages, context, knowledgeResults);
    }

    // Call AI provider
    return await callAIWithFallback(userId, messages, context, knowledgeResults);
  } catch (error) {
    console.error('AI FAILED AT STABLE FALLBACK', error);
    console.error(error.stack);
    // Return deterministic fallback
    return await getDeterministicFallback(userId, message, vehicleId, context);
  }
}

/**
 * Call AI provider with fallback on error
 */
async function callAIWithFallback(userId, messages, context, knowledgeResults) {
  console.log('AI_PROVIDER_CALL_START', { provider: AI_PROVIDER });
  
  try {
    let response;
    if (AI_PROVIDER === 'openrouter') {
      response = await callOpenRouter(messages);
    } else {
      response = await callOpenAI(messages);
    }
    
    console.log('AI_PROVIDER_CALL_SUCCESS');
    
    return {
      response: response || 'No response generated',
      context,
      knowledgeResults,
      metadata: {
        title: "FleetNimble AI Assistant",
        confidence: "MEDIUM",
        dataFreshness: "LIVE",
        simulatedNote: null,
        suggestedActions: [
          "Summarize my fleet health",
          "Show critical alerts",
          "Show vehicles needing maintenance",
          "Show offline vehicles"
        ],
        entities: {},
      },
    };
  } catch (aiError) {
    console.error('AI_PROVIDER_CALL_FAILED', aiError);
    console.error(aiError.stack);
    
    // Check for token limit or provider errors
    const errorMessage = aiError.message?.toLowerCase() || '';
    if (errorMessage.includes('402') || errorMessage.includes('token limit') || errorMessage.includes('insufficient credits') || errorMessage.includes('rate limit')) {
      console.log('AI_PROVIDER_TOKEN_LIMIT_FALLBACK');
      return {
        response: 'FleetNimble AI could not use the external AI provider because the request exceeded the model limit. I generated a compact fleet summary from backend data instead.',
        context,
        knowledgeResults,
        metadata: {
          title: "FleetNimble AI Assistant",
          confidence: "MEDIUM",
          dataFreshness: "HISTORICAL",
          simulatedNote: null,
          suggestedActions: [
            "Show critical alerts",
            "Show vehicles needing maintenance",
            "Show offline vehicles"
          ],
          entities: {},
        },
      };
    }
    
    // For other errors, try deterministic fallback
    console.log('AI_DETERMINISTIC_FALLBACK_USED');
    return await getDeterministicFallback(userId, messages[messages.length - 1]?.content || '', null, context);
  }
}

/**
 * Deterministic fallback for common questions without LLM
 */
async function getDeterministicFallback(userId, message, vehicleId, context) {
  console.log('AI_DETERMINISTIC_FALLBACK_START', { message: message?.substring(0, 50) });
  
  const lowerMessage = message.toLowerCase();
  
  try {
    // Common fleet questions
    if (lowerMessage.includes('summary') || lowerMessage.includes('fleet health')) {
      const vehicles = await prisma.vehicle.findMany({
        where: { userId, deletedAt: null },
        select: {
          name: true,
          liveState: { select: { status: true } },
          _count: { select: { alerts: true, dtcCodes: true, maintenanceLogs: true } },
        },
      });
      
      const online = vehicles.filter(v => v.liveState?.status === 'online').length;
      const offline = vehicles.filter(v => v.liveState?.status === 'offline').length;
      const totalAlerts = vehicles.reduce((sum, v) => sum + v._count.alerts, 0);
      
      return {
        response: `**Fleet Summary**\n\nTotal Vehicles: ${vehicles.length}\nOnline: ${online}\nOffline: ${offline}\nCritical Alerts: ${totalAlerts}\n\nThis is a summary from backend data. Ask a specific question for more details.`,
        context,
        knowledgeResults: [],
        metadata: {
          title: "FleetNimble AI Assistant",
          confidence: "HIGH",
          dataFreshness: "LIVE",
          simulatedNote: null,
          suggestedActions: [
            "Show critical alerts",
            "Show vehicles needing maintenance",
            "Show offline vehicles"
          ],
          entities: {},
        },
      };
    }
    
    if (lowerMessage.includes('how many') && lowerMessage.includes('online')) {
      const onlineCount = await prisma.vehicle.count({
        where: { userId, deletedAt: null, liveState: { status: 'online' } },
      });
      
      return {
        response: `There are ${onlineCount} vehicles currently online.`,
        context,
        knowledgeResults: [],
        metadata: {
          title: "FleetNimble AI Assistant",
          confidence: "HIGH",
          dataFreshness: "LIVE",
          simulatedNote: null,
          suggestedActions: [
            "Show offline vehicles",
            "Summarize my fleet health"
          ],
          entities: {},
        },
      };
    }
    
    if (lowerMessage.includes('offline')) {
      const offlineVehicles = await prisma.vehicle.findMany({
        where: { userId, deletedAt: null, liveState: { status: 'offline' } },
        select: { name: true, plateNumber: true },
        take: 10,
      });
      
      const vehicleList = offlineVehicles.map(v => `- ${v.name} (${v.plateNumber})`).join('\n');
      
      return {
        response: `**Offline Vehicles**\n\n${vehicleList || 'No offline vehicles.'}`,
        context,
        knowledgeResults: [],
        metadata: {
          title: "FleetNimble AI Assistant",
          confidence: "HIGH",
          dataFreshness: "LIVE",
          simulatedNote: null,
          suggestedActions: [
            "Summarize my fleet health",
            "Show critical alerts"
          ],
          entities: {},
        },
      };
    }
    
    if (lowerMessage.includes('maintenance') || lowerMessage.includes('repair')) {
      const maintenanceDue = await prisma.maintenanceLog.findMany({
        where: {
          vehicle: { userId, deletedAt: null },
          completed: false,
        },
        include: {
          vehicle: { select: { name: true, plateNumber: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
      });
      
      const maintenanceList = maintenanceDue.map(m => `- ${m.vehicle.name}: ${m.description} (Due: ${m.dueDate})`).join('\n');
      
      return {
        response: `**Vehicles Needing Maintenance**\n\n${maintenanceList || 'No maintenance due.'}`,
        context,
        knowledgeResults: [],
        metadata: {
          title: "FleetNimble AI Assistant",
          confidence: "HIGH",
          dataFreshness: "LIVE",
          simulatedNote: null,
          suggestedActions: [
            "Show critical alerts",
            "Summarize my fleet health"
          ],
          entities: {},
        },
      };
    }
    
    if (lowerMessage.includes('critical alert') || lowerMessage.includes('alert')) {
      const alerts = await prisma.alert.findMany({
        where: {
          vehicle: { userId, deletedAt: null },
          read: false,
          severity: 'CRITICAL',
        },
        include: {
          vehicle: { select: { name: true, plateNumber: true } },
        },
        take: 10,
      });
      
      const alertList = alerts.map(a => `- ${a.vehicle.name}: ${a.message}`).join('\n');
      
      return {
        response: `**Critical Alerts**\n\n${alertList || 'No critical alerts.'}`,
        context,
        knowledgeResults: [],
        metadata: {
          title: "FleetNimble AI Assistant",
          confidence: "HIGH",
          dataFreshness: "LIVE",
          simulatedNote: null,
          suggestedActions: [
            "Show vehicles needing maintenance",
            "Summarize my fleet health"
          ],
          entities: {},
        },
      };
    }
    
    // Generic fallback
    return {
      response: 'I apologize, but I encountered an error processing your request. Please try again or ask about fleet summary, online vehicles, offline vehicles, maintenance, or critical alerts.',
      context,
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
          "Show offline vehicles"
        ],
        entities: {},
      },
    };
  } catch (error) {
    console.error('AI_DETERMINISTIC_FALLBACK_ERROR', error);
    console.error(error.stack);
    return {
      response: 'FleetNimble AI is online but encountered an error. Please try again.',
      context: { intent: 'error', dataSource: 'none', recordCounts: {} },
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
          "Show offline vehicles"
        ],
        entities: {},
      },
    };
  }
}

/**
 * Call OpenAI API
 */
async function callOpenAI(messages) {
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
async function callOpenRouter(messages) {
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
 * Process user message and get AI response
 */
export async function processChatMessage(userId, message, vehicleId = null, chatHistory = []) {
  console.log('AI SERVICE PROCESS START', { userId, message: message?.substring(0, 50) });
  
  try {
    // Check if orchestrator is enabled
    if (AI_ORCHESTRATOR_ENABLED) {
      console.log('AI_CHAT_MODE=ORCHESTRATOR');
      
      // Use AI Orchestrator for structured responses with metadata
      let orchestratorResult;
      try {
        orchestratorResult = await orchestrateAI(userId, message, vehicleId);
        console.log('AI ORCHESTRATOR COMPLETE');
      } catch (orchestratorError) {
        console.error('AI_ORCHESTRATOR_FAILED_USING_FALLBACK', orchestratorError);
        console.error(orchestratorError.stack);
        // Automatically fallback to stable chatbot
        return await processChatMessageStable(userId, message, vehicleId, chatHistory);
      }
      
      // Build context from user's fleet data
      let context;
      try {
        context = await buildContext(userId, vehicleId);
      } catch (contextError) {
        console.error('AI FAILED AT BUILD CONTEXT', contextError);
        console.error(contextError.stack);
        context = { vehicleCount: 0, hasVehicles: false };
      }

      // Search knowledge base for relevant information
      let knowledgeResults;
      try {
        knowledgeResults = searchKnowledgeBase(message);
      } catch (kbError) {
        console.error('AI FAILED AT KNOWLEDGE BASE', kbError);
        console.error(kbError.stack);
        knowledgeResults = [];
      }

      // Validate orchestrator result
      if (!orchestratorResult) {
        console.error('AI FAILED AT ORCHESTRATOR RESULT VALIDATION - result is null');
        return await processChatMessageStable(userId, message, vehicleId, chatHistory);
      }

      return {
        response: orchestratorResult.message || 'No response generated',
        context,
        knowledgeResults,
        metadata: {
          title: orchestratorResult.title || "FleetNimble AI Assistant",
          metrics: orchestratorResult.metrics || {},
          risks: orchestratorResult.risks || [],
          recommendedAction: orchestratorResult.recommendedAction || null,
          confidence: orchestratorResult.confidence || "MEDIUM",
          dataFreshness: orchestratorResult.dataFreshness || "UNKNOWN",
          simulatedNote: orchestratorResult.simulatedNote || null,
          suggestedActions: orchestratorResult.suggestedActions || [],
          entities: orchestratorResult.entities || {},
        },
      };
    } else {
      console.log('AI_CHAT_MODE=STABLE_FALLBACK');
      // Use stable fallback chatbot
      return await processChatMessageStable(userId, message, vehicleId, chatHistory);
    }
  } catch (error) {
    console.error('AI FAILED AT SERVICE', error);
    console.error(error.stack);
    // Return fallback instead of throwing
    return {
      response: 'FleetNimble AI is online, but the advanced analysis failed temporarily. Please try again or ask a simpler fleet question.',
      context: { vehicleCount: 0, hasVehicles: false },
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
          "Show offline vehicles"
        ],
        entities: {},
      },
    };
  }
}

/**
 * Process user message with streaming AI response
 */
export async function processChatMessageStream(userId, message, vehicleId = null, chatHistory = [], onChunk) {
  try {
    // Build context from user's fleet data
    const context = await buildContext(userId, vehicleId);

    // Search knowledge base for relevant information
    const knowledgeResults = searchKnowledgeBase(message);
    const knowledgeContext = knowledgeResults.length > 0
      ? `\n\nKnowledge Base Results:\n${knowledgeResults.map(r => `${r.type}: ${r.question || r.section || r.issue}\n${r.answer || r.content || r.solution}`).join('\n\n')}`
      : '';

    // Prepare messages for AI
    const messages = [
      {
        role: 'user',
        content: `User Question: ${message}\n\nFleet Context: ${JSON.stringify(context, null, 2)}${knowledgeContext}`,
      },
    ];

    // Add chat history if available
    if (chatHistory && chatHistory.length > 0) {
      messages.unshift(...chatHistory.slice(-10)); // Keep last 10 messages for context
    }

    // Call AI with streaming
    await callAIStream(messages, onChunk);
  } catch (error) {
    logger.error('Error processing chat message stream', { error: error.message, userId });
    throw error;
  }
}

/**
 * Create a new chat session
 */
export async function createChat(userId, title) {
  try {
    const chat = await prisma.aiChat.create({
      data: {
        userId,
        title: title || 'New Chat',
      },
    });
    return chat;
  } catch (error) {
    logger.error('Error creating chat', { error: error.message, userId });
    throw error;
  }
}

/**
 * Get all chats for a user
 */
export async function getUserChats(userId) {
  try {
    const chats = await prisma.aiChat.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 1, // Get first message as preview
        },
      },
    });
    return chats;
  } catch (error) {
    logger.error('Error getting user chats', { error: error.message, userId });
    throw error;
  }
}

/**
 * Get chat with messages
 */
export async function getChatWithMessages(chatId, userId) {
  try {
    const chat = await prisma.aiChat.findFirst({
      where: {
        id: chatId,
        userId,
      },
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
    logger.error('Error getting chat with messages', { error: error.message, chatId, userId });
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
    return message;
  } catch (error) {
    logger.error('Error saving message', { error: error.message, chatId });
    throw error;
  }
}

/**
 * Delete chat
 */
export async function deleteChat(chatId, userId) {
  try {
    await prisma.aiChat.deleteMany({
      where: {
        id: chatId,
        userId,
      },
    });
  } catch (error) {
    logger.error('Error deleting chat', { error: error.message, chatId, userId });
    throw error;
  }
}

export {
  buildContext,
  SYSTEM_PROMPT,
};
