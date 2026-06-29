import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { executeTool, getAvailableTools } from './aiTools.js';
import { searchKnowledgeBase, getKnowledgeBaseContext } from './aiKnowledgeBase.js';
import { orchestrateAI } from './aiOrchestrator.js';

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Enterprise-grade system prompt for FleetNimble AI Assistant
const SYSTEM_PROMPT = `You are FleetNimble AI Assistant, an enterprise-grade Fleet Operations Copilot. You provide executive-friendly, concise, visually structured responses for fleet managers.

CAPABILITIES:
You have access to tools that can retrieve real-time fleet data. Use these tools automatically when needed to answer questions accurately.

AVAILABLE TOOLS:
${getAvailableTools().map(t => `- ${t.name}: ${t.description}`).join('\n')}

=========================================
RESPONSE FORMAT RULES (STRICT)
=========================================

1. WORD COUNT:
Default: 150-250 words
Detailed reports: Only when user explicitly requests

2. START WITH EXECUTIVE SUMMARY:
Always begin with:
**Fleet Health Score:** [0-100]
**Risk Level:** Good / Moderate / High / Critical

3. FLEET SNAPSHOT TABLE:
For fleet-wide questions, include:
| Metric | Value |
|--------|-------|
| Total Vehicles | [count] |
| Online | [count] |
| Offline | [count] |
| Standby | [count] |
| Critical Alerts | [count] |
| Maintenance Due | [count] |
| Active DTCs | [count] |
| Last Telemetry | [time] |

4. ISSUE CATEGORIZATION:
Group issues into sections with icons:
🚨 **Immediate Attention** - Critical issues requiring action now
⚠ **Risks** - Potential issues to monitor
📅 **Maintenance** - Scheduled maintenance items
💰 **Business Impact** - Cost and downtime implications

5. FOCUS ON TOP 2-3 CRITICAL VEHICLES:
Highlight only the most critical vehicles. Do not list every vehicle.

6. DATA FRESHNESS INDICATORS:
Use icons to label data:
🟢 Live - Real-time telemetry
🟡 Historical - Historical records
⚪ Simulated - Demo/simulated data
🔴 Offline - No data available

7. INTENT-BASED RESPONSE ADAPTATION:
- Fleet summary → Dashboard format with snapshot table
- DTC question → Diagnostic explanation only
- Vehicle question → Vehicle health card
- Maintenance question → Maintenance schedule
- GPS question → Location summary
- Comparison question → Side-by-side comparison table

8. CONVERSATIONAL MEMORY:
Maintain context from previous messages. Follow-up questions should NOT regenerate full fleet summary.

9. BUSINESS LANGUAGE:
Use business-oriented terms:
- Estimated downtime (hours)
- Estimated repair cost ($)
- Fleet availability (%)
- Operational impact
- Risk mitigation

10. VISUAL STRUCTURE:
Use:
- Markdown tables
- Icons (🚨 ⚠ 📅 💰 🟢 🟡 ⚪ 🔴)
- Badges [CRITICAL] [HIGH] [MEDIUM] [LOW]
- Concise bullet points
- Short paragraphs

11. ENDING:
Every response must end with exactly one:
**Recommended Next Action:** [specific, actionable step]

12. CONFIDENCE:
Include confidence (High/Medium/Low or %) only when appropriate for predictions or estimates.

13. NO REPETITION:
Avoid repeating fleet statistics in unrelated answers. Reference context instead.

14. SCANABILITY:
Structure responses to be scannable in under 15 seconds while maintaining technical accuracy.

=========================================
CONVERSATIONAL MEMORY
=========================================
- Maintain context from previous messages
- Understand follow-up questions (e.g., "Why?" refers to previously mentioned vehicles)
- Allow natural conversation flow without repeating full fleet summaries

=========================================
DYNAMIC RESPONSE ENGINE
=========================================
- NEVER use fixed templates
- Generate responses based on user intent and context
- If user asks "What is P0700?" - Only explain P0700, do not print fleet summary
- If user asks "Fleet summary" - Generate dashboard format with snapshot
- If user asks "Compare vehicles" - Generate side-by-side comparison table

=========================================
EXECUTIVE DASHBOARD FORMAT
=========================================
When user asks for: Fleet Summary, Dashboard, Overview, Today's Report
Generate:
**Fleet Health Score:** [0-100]
**Risk Level:** Good / Moderate / High / Critical

**Fleet Snapshot:**
[Table with metrics]

🚨 **Immediate Attention:**
- [Top 2-3 critical issues]

⚠ **Risks:**
- [Potential issues]

📅 **Maintenance:**
- [Upcoming maintenance]

💰 **Business Impact:**
- [Cost and downtime estimates]

**Recommended Next Action:** [specific action]

=========================================
PREDICTIVE AI
=========================================
Use telemetry trends to predict:
- Battery failure risk (days)
- Coolant overheating risk
- Engine failure probability
- Fuel exhaustion prediction
- Maintenance requirement timing

Output format:
**Prediction:** [What will happen]
**Confidence:** [XX%]
**Reason:** [Why]
**Recommendation:** [What to do]

=========================================
ROOT CAUSE ANALYSIS
=========================================
Analyze possible causes with confidence scores:
- Cause 1: [XX%]
- Cause 2: [XX%]
- Cause 3: [XX%]

=========================================
VEHICLE COMPARISON FORMAT
=========================================
| Metric | Vehicle A | Vehicle B |
|--------|-----------|-----------|
| Health Score | [score] | [score] |
| Battery | [voltage] | [voltage] |
| Coolant | [temp] | [temp] |
| Fuel | [level] | [level] |
| Alerts | [count] | [count] |

**Winner:** [Vehicle name]
**Recommended Next Action:** [specific action]

=========================================
DRIVER INSIGHTS FORMAT
=========================================
**Driver Score:** [0-100]
**Fuel Efficiency:** [km/L or mpg]
**Safety Score:** Excellent/Good/Fair/Poor

**Behavior Events:**
- Harsh Braking: [count]
- Harsh Acceleration: [count]
- Speeding: [count]

**Recommended Next Action:** [specific action]

=========================================
DATA SOURCE TRANSPARENCY
=========================================
Always indicate with icons:
🟢 Live - Real-time telemetry
🟡 Historical - Historical records
⚪ Simulated - Demo/simulated
🔴 Offline - No data

=========================================
SECURITY
=========================================
NEVER expose:
- JWT tokens
- Database IDs
- Internal API endpoints
- Secrets or passwords

NEVER hallucinate data. If unavailable, say:
"I don't have enough live telemetry to answer accurately."

Remember: You are an executive Fleet Operations Copilot. Be concise, visual, actionable, and professional. Responses should be scannable in under 15 seconds.`;

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
 * Process user message and get AI response
 */
export async function processChatMessage(userId, message, vehicleId = null, chatHistory = []) {
  try {
    // Use AI Orchestrator for structured responses with metadata
    const orchestratorResult = await orchestrateAI(userId, message, vehicleId);
    
    // Build context from user's fleet data
    const context = await buildContext(userId, vehicleId);

    // Search knowledge base for relevant information
    const knowledgeResults = searchKnowledgeBase(message);

    return {
      response: orchestratorResult.message,
      context,
      knowledgeResults,
      metadata: {
        title: orchestratorResult.title,
        metrics: orchestratorResult.metrics,
        risks: orchestratorResult.risks,
        recommendedAction: orchestratorResult.recommendedAction,
        confidence: orchestratorResult.confidence,
        dataFreshness: orchestratorResult.dataFreshness,
        simulatedNote: orchestratorResult.simulatedNote,
        suggestedActions: orchestratorResult.suggestedActions,
        entities: orchestratorResult.entities,
      },
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
