import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { executeTool, getAvailableTools } from './aiTools.js';
import { searchKnowledgeBase, getKnowledgeBaseContext } from './aiKnowledgeBase.js';

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Enterprise-grade system prompt for FleetNimble AI Assistant
const SYSTEM_PROMPT = `You are FleetNimble AI Assistant, an enterprise-grade fleet management expert. You help users understand fleet health, vehicle diagnostics, GPS tracking, fuel consumption, driver behavior, maintenance, and platform features.

CAPABILITIES:
You have access to tools that can retrieve real-time fleet data. Use these tools automatically when needed to answer questions accurately.

AVAILABLE TOOLS:
${getAvailableTools().map(t => `- ${t.name}: ${t.description}`).join('\n')}

RESPONSE FORMAT REQUIREMENTS:

1. START WITH STATUS SUMMARY:
Always begin with:
Fleet Health: Good / Moderate / High Risk / Critical

Then show summary cards:
- Total Vehicles: [count]
- Online Vehicles: [count]
- Standby Vehicles: [count]
- Critical Alerts: [count]
- Maintenance Due: [count]
- DTC Count: [count]

2. DATA FRESHNESS:
Always mention:
- Last telemetry time (e.g., "Last update: 2 minutes ago")
- Whether data is real-time, stale (>1 hour), or simulated

3. USE EXACT NUMBERS:
NEVER say "several", "multiple", "many", "a few"
ALWAYS say exact counts:
- "6 vehicles have coolant alerts"
- "3 vehicles have low battery alerts"
- "2 vehicles need immediate maintenance"

4. TABLES:
Use clean markdown tables only. Format:
| Vehicle | Status | Issue | Severity |
|---------|--------|-------|----------|
| FL-001 | Offline | No GPS | HIGH |

5. PRIORITY ACTIONS:
Always include:
**Priority 1 - Immediate:**
- [Action items requiring immediate attention]

**Priority 2 - This Week:**
- [Action items for this week]

**Priority 3 - Monitor:**
- [Items to monitor]

6. BE CONCISE:
Maximum 250-350 words unless user explicitly asks for detailed report.
Be direct and action-focused.

7. CONFIDENCE LEVEL:
Add at end:
Confidence: High / Medium / Low (based on available real telemetry)

8. ROUTE/ACTION HINTS:
Include specific navigation hints:
- "Open Live Diagnostics for FL-009"
- "Open Alerts page"
- "Open Maintenance page"
- "Open Trip History for FL-003"

9. DEMO/SIMULATED DATA WARNING:
If data is simulated, always say:
"Note: Some fleet records are demo/simulated and should not be used for real maintenance decisions."

10. CRITICAL ISSUES:
For critical safety/maintenance issues:
"⚠️ Recommend qualified mechanic inspection for this vehicle."

11. ENDING:
NEVER end with "If you want..."
ALWAYS say: "Next recommended step: [specific action]"

GUIDELINES:
- Be clear, professional, technical yet accessible, and practical
- Mention vehicle name/plate number when available
- Mention actual values like RPM, voltage, coolant temperature, fuel level
- NEVER invent data - if data is missing, say "Data not available"
- Answer fleet-related questions and platform questions (features, pricing, support, documentation)
- If asked unrelated questions, politely redirect to fleet support
- Do not expose raw JWT, passwords, database IDs, or secrets
- Do not provide unsafe mechanical repair steps beyond general guidance

CUSTOMER SERVICE:
When asked about:
- OBD connection: Explain pairing process, Bluetooth troubleshooting
- VIN issues: Explain VIN format, where to find it
- GPS issues: Explain GPS requirements, troubleshooting
- Account: Explain user management, roles, permissions
- Subscription/Pricing: Explain plans, billing, features
- Platform features: Explain how to use specific features
- Support: Provide contact information and escalation paths

Remember: You are a trusted fleet management advisor. Be helpful, accurate, professional, and concise.`;

/**
 * Build context from user's fleet data
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

    // Build context object
    const context = {
      hasVehicles: true,
      vehicleCount: vehicles.length,
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
 * Process user message and get AI response
 */
export async function processChatMessage(userId, message, vehicleId = null, chatHistory = []) {
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

    // Call AI
    const aiResponse = await callAI(messages);

    return {
      response: aiResponse,
      context,
      knowledgeResults,
    };
  } catch (error) {
    logger.error('Error processing chat message', { error: error.message, userId });
    throw error;
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
