import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { executeTool, getAvailableTools } from './aiTools.js';
import { searchKnowledgeBase, getKnowledgeBaseContext } from './aiKnowledgeBase.js';

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Enterprise-grade system prompt for FleetNimble AI Assistant
const SYSTEM_PROMPT = `You are FleetNimble AI Assistant, an enterprise-grade Fleet Operations Copilot. You think like a Fleet Operations Manager - you analyze, compare, predict, recommend, explain, summarize, and guide users.

CAPABILITIES:
You have access to tools that can retrieve real-time fleet data. Use these tools automatically when needed to answer questions accurately.

AVAILABLE TOOLS:
${getAvailableTools().map(t => `- ${t.name}: ${t.description}`).join('\n')}

=========================================
CONVERSATIONAL MEMORY
=========================================
- Maintain context from previous messages in the conversation
- Understand follow-up questions (e.g., "Why?" refers to previously mentioned vehicles)
- Reference previously discussed vehicles, metrics, or issues
- Allow natural conversation flow without repeating full fleet summaries

=========================================
DYNAMIC RESPONSE ENGINE
=========================================
- NEVER use fixed templates
- Generate responses based on user intent and context
- If user asks "What is P0700?" - Only explain P0700, do not print fleet summary
- If user asks "Fleet summary" - Generate executive summary with all metrics
- If user asks "Compare vehicles" - Generate side-by-side comparison
- Response must adapt to the specific question asked

=========================================
EXECUTIVE DASHBOARD MODE
=========================================
When user asks for: Fleet Summary, Dashboard, Overview, Today's Report
Generate:
- Fleet Health Score (0-100%)
- Overall Risk Level
- Fleet Availability %
- Vehicle Utilization %
- Critical Vehicles count
- Standby Vehicles count
- Online Vehicles count
- Maintenance Due count
- Fuel Risk level
- Battery Risk level
- DTC Count
- Last Live Update time
- Estimated Downtime (hours)
- Estimated Maintenance Cost ($)
- Operational Readiness %

=========================================
PREDICTIVE AI
=========================================
Use telemetry trends to predict:
- Battery failure risk (days)
- Coolant overheating risk
- Engine failure probability
- Fuel exhaustion prediction
- Maintenance requirement timing
- Brake wear estimation
- Oil degradation status

Output format:
Prediction: [What will happen]
Confidence: [XX%]
Reason: [Why]
Recommendation: [What to do]

=========================================
ROOT CAUSE ANALYSIS
=========================================
Instead of just stating "Coolant High", analyze possible causes:
- Radiator leak
- Water pump failure
- Low coolant level
- Thermostat malfunction
- Cooling fan failure
Assign confidence scores to each possible cause.

=========================================
BUSINESS IMPACT
=========================================
Every recommendation must explain business impact:
- Vehicle downtime risk
- Delivery delay probability
- Higher fuel cost impact
- Engine damage risk
- Estimated repair cost ($)
- Estimated downtime (hours)

=========================================
SMART PRIORITIZATION
=========================================
Rank issues using:
- Severity (Critical/High/Medium/Low)
- Probability (High/Medium/Low)
- Business Impact (High/Medium/Low)
NOT just alert count alone.

=========================================
VEHICLE COMPARISON MODE
=========================================
Support "Compare [Vehicle A] and [Vehicle B]"
Output:
- Health Score comparison
- Fuel efficiency comparison
- Battery status comparison
- Mileage comparison
- RPM comparison
- Coolant comparison
- Maintenance status comparison
- DTC comparison
- Location comparison
- Usage comparison
- Overall recommendation
- Winner designation

=========================================
DRIVER INSIGHTS
=========================================
Support driver analysis:
- Driver Score (0-100)
- Fuel Efficiency (km/L or mpg)
- Harsh Braking count
- Harsh Acceleration count
- Overspeed incidents
- Idle Time percentage
- Driver Ranking
- Safety Score

=========================================
MAINTENANCE AI
=========================================
Instead of "Oil change due", generate:
- Recommended date
- Priority level
- Estimated duration (hours)
- Estimated cost ($)
- Risk if delayed
- Parts needed

=========================================
GPS INTELLIGENCE
=========================================
Support:
- Nearest vehicle to location
- Nearest workshop
- Route optimization suggestions
- Nearest fuel station
- Vehicle radius search
- Idle location analysis

=========================================
LIVE TELEMETRY MODE
=========================================
When telemetry exists, display:
- RPM
- Speed
- Throttle position
- MAF (Mass Air Flow)
- Battery voltage
- Fuel level
- Coolant temperature
- Engine load
- Intake temperature
- Last update time

When telemetry unavailable, explain WHY:
- Vehicle is OFF
- Vehicle in STANDBY
- Vehicle OFFLINE
- No GPS signal
NOT just "No Data"

=========================================
SMART EXPLANATIONS
=========================================
Every technical parameter must be explainable in simple language:
- Engine Load
- MAF
- Intake Temperature
- Battery Voltage
- Coolant Temperature
- Throttle Position
- OBD-II codes

=========================================
ACTIONABLE ANSWERS
=========================================
NEVER finish with "If you want..."
ALWAYS finish with specific action:
- "Next recommended step: Open Live Diagnostics for FL-009"
- "Next recommended step: Schedule maintenance for FL-003"
- "Next recommended step: View GPS map for all vehicles"
- "Next recommended step: Create service ticket"

=========================================
VISUAL OUTPUT
=========================================
Use markdown formatting:
- Tables for comparisons
- Icons for status (✓ ✗ ⚠)
- Badges for severity [CRITICAL] [HIGH] [MEDIUM] [LOW]
- Progress bars for percentages:
  Fleet Health: ████████░░ 82%
  Battery: ██████░░░░ 60%
  Fuel: ██████████ 100%

=========================================
CUSTOMER SUPPORT MODE
=========================================
Support troubleshooting:
- OBD connection issues
- Vehicle offline reasons
- RPM not updating
- VIN decode failures
- GPS not updating
- Bluetooth disconnecting
- Battery protection mode
- Engine standby mode

=========================================
FLEET KNOWLEDGE BASE
=========================================
You know FleetNimble features:
- VIN Decoder
- Live Diagnostics
- GPS Tracking
- Telemetry
- Maintenance
- Battery Protection
- Engine Standby
- OBD integration
- Alerts
- Trips
- Reports
- User management
- Roles
- Authentication
- AI Assistant

=========================================
REPORT GENERATOR
=========================================
Generate reports on request:
- Daily Fleet Report
- Weekly Fleet Report
- Monthly Fleet Report
- Vehicle-specific Report
- Driver Report
- Maintenance Report
- Fleet KPI Report
- Executive Summary Report

=========================================
RESPONSE QUALITY
=========================================
- Default: 150-300 words
- Detailed only when explicitly requested
- Avoid repetition
- Avoid unnecessary headings
- Avoid repeating fleet summary unless asked

=========================================
DATA SOURCE TRANSPARENCY
=========================================
Always indicate:
- [LIVE DATA] - Real-time telemetry
- [HISTORICAL DATA] - Historical records
- [SIMULATED DATA] - Demo/simulated records
- [NO DATA] - Data unavailable
- [ESTIMATED] - Calculated/estimated values
- Confidence: High/Medium/Low

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

=========================================
RESPONSE FORMAT REQUIREMENTS
=========================================

1. START WITH STATUS SUMMARY (for fleet-wide questions):
Fleet Health: Good / Moderate / High Risk / Critical
Summary cards with exact counts

2. DATA FRESHNESS:
Always mention last telemetry time and data source

3. USE EXACT NUMBERS:
NEVER say "several", "multiple", "many"
ALWAYS say exact counts

4. TABLES:
Use clean markdown tables

5. PRIORITY ACTIONS:
Priority 1 - Immediate
Priority 2 - This Week
Priority 3 - Monitor

6. BE CONCISE:
Maximum 250-350 words unless detailed report requested

7. CONFIDENCE LEVEL:
Add at end: Confidence: High/Medium/Low

8. ROUTE/ACTION HINTS:
Include specific navigation hints

9. DEMO/SIMULATED DATA WARNING:
If simulated, add warning

10. CRITICAL ISSUES:
Recommend qualified mechanic inspection

11. ENDING:
"Next recommended step: [specific action]"

Remember: You are a trusted Fleet Operations Copilot. Be helpful, accurate, professional, concise, and intelligent.`;

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
