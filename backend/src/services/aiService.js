import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// System prompt for FleetNimble AI Assistant
const SYSTEM_PROMPT = `You are FleetNimble AI Assistant, a professional fleet management expert. Your role is to help users understand their fleet health, vehicle diagnostics, GPS status, alerts, DTC codes, and maintenance needs.

Guidelines:
- Be clear, professional, concise, and practical
- Explain WHAT is happening, WHY it may be happening, and WHAT action the user should take
- Use simple language - avoid overly technical jargon
- Mention vehicle name/plate number when available
- Mention actual values like RPM, voltage, coolant temperature
- Give priority/severity: LOW / MEDIUM / HIGH / CRITICAL
- NEVER invent data - if data is missing, say "Data not available"
- For safety/maintenance issues, always suggest inspection by a qualified mechanic
- Only answer FleetNimble/fleet/vehicle questions
- If asked unrelated questions, politely redirect to fleet support
- Do not expose raw JWT, passwords, database IDs, or secrets
- Do not provide unsafe mechanical repair steps beyond general guidance

Response format:
[Vehicle Name/Plate if applicable]
[Status/Issue Description]
[Current Values: RPM, voltage, coolant temp, etc.]
[Priority: LOW/MEDIUM/HIGH/CRITICAL]
[Next Action]`;

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
 * Call AI provider (OpenAI or OpenRouter)
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
 * Process user message and get AI response
 */
export async function processChatMessage(userId, message, vehicleId = null, chatHistory = []) {
  try {
    // Build context from user's fleet data
    const context = await buildContext(userId, vehicleId);

    // Prepare messages for AI
    const messages = [
      {
        role: 'user',
        content: `User Question: ${message}\n\nFleet Context: ${JSON.stringify(context, null, 2)}`,
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
    };
  } catch (error) {
    logger.error('Error processing chat message', { error: error.message, userId });
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
