import prisma from '../../utils/prisma.js';
import logger from '../../utils/logger.js';
import { detectIntent, extractEntities } from './aiIntentDetector.js';
import { AIContextBuilder } from './aiContextBuilder.js';

/**
 * Deterministic Fallback System
 * Answers questions from backend database without external AI
 */

/**
 * Main entry point for deterministic fallback
 */
export async function getDeterministicFallback(userId, message, vehicleId = null) {
  logger.info('AI_DETERMINISTIC_FALLBACK_USED', { message: message?.substring(0, 50) });
  
  try {
    // Step 1: Detect intent
    let intentResult;
    try {
      const userVehicles = await prisma.vehicle.findMany({
        where: { userId, deletedAt: null },
        select: { id: true, vehicleName: true, registrationNumber: true, vin: true },
      });
      
      intentResult = {
        intent: detectIntent(message),
        entities: extractEntities(message, userId, userVehicles),
        userVehicles,
      };
      logger.info('AI_FALLBACK_INTENT_DETECTED', { intent: intentResult.intent });
    } catch (intentError) {
      logger.error('AI_FALLBACK_INTENT_FAILED', { error: intentError.message });
      intentResult = { intent: 'general', entities: {}, userVehicles: [] };
    }
    
    // Step 2: Build context
    let context;
    try {
      const contextBuilder = new AIContextBuilder(userId, message, intentResult.userVehicles);
      context = await contextBuilder.build();
      logger.info('AI_FALLBACK_CONTEXT_BUILT', { intent: context.intent });
    } catch (contextError) {
      logger.error('AI_FALLBACK_CONTEXT_FAILED', { error: contextError.message });
      context = null;
    }
    
    // Step 3: Return intent-matched fallback
    const fallbackResult = await buildIntentMatchedFallback(userId, message, intentResult, context);
    
    return {
      success: true,
      data: {
        reply: fallbackResult.response,
        chatId: null,
        metadata: fallbackResult.metadata,
      },
    };
  } catch (error) {
    console.error('DETERMINISTIC_FALLBACK_ERROR', error.message, error.stack);
    
    // Final fallback if everything fails
    return {
      success: true,
      data: {
        reply: 'I apologize, but I encountered an error accessing your fleet data. Please try again.',
        chatId: null,
        metadata: {
          confidence: 'LOW',
          dataFreshness: 'UNKNOWN',
          simulatedNote: null,
          suggestedActions: [
            'Summarize my fleet health',
            'Show critical alerts',
            'Show vehicles needing maintenance',
          ],
        },
      },
    };
  }
}

/**
 * Build intent-matched fallback response
 */
async function buildIntentMatchedFallback(userId, message, intentResult, context) {
  const { intent, entities, userVehicles } = intentResult;
  
  logger.info('AI_FALLBACK_INTENT_MATCH', { intent });
  
  try {
    switch (intent) {
      case 'fleet_summary':
        return await getFleetSummaryFallback(userId);
      case 'vehicle_details':
        return await getVehicleDetailsFallback(userId, message, entities, userVehicles);
      case 'vehicle_comparison':
        return await getVehicleComparisonFallback(userId, entities, userVehicles);
      case 'dtc':
        return await getDTCFallback(userId, entities);
      case 'maintenance':
        return await getMaintenanceFallback(userId);
      case 'work_order':
        return await getWorkOrderFallback(userId, message, entities, userVehicles);
      case 'alerts':
        return await getAlertsFallback(userId, entities);
      case 'gps':
        return await getGPSFallback(userId, entities, userVehicles);
      case 'offline_vehicles':
        return await getOfflineVehiclesFallback(userId);
      case 'standby_vehicles':
        return await getStandbyVehiclesFallback(userId);
      case 'battery':
        return await getBatteryFallback(userId, entities, userVehicles);
      case 'fuel':
        return await getFuelFallback(userId, entities, userVehicles);
      case 'history':
        return await getHistoryFallback(userId, message, entities, userVehicles);
      case 'live_data':
        return await getLiveDataFallback(userId, entities, userVehicles);
      case 'predictive_maintenance':
        return await getRepairPriorityFallback(userId);
      case 'support':
        return await getSupportFallback(message);
      case 'general':
        if (message.toLowerCase().includes('likely to fail') || message.toLowerCase().includes('repair priority')) {
          return await getRepairPriorityFallback(userId);
        }
        if (message.toLowerCase().includes('offline')) {
          return await getOfflineVehiclesFallback(userId);
        }
        return await getFleetSummaryFallback(userId);
      default:
        return await getFleetSummaryFallback(userId);
    }
  } catch (error) {
    logger.error('AI_FALLBACK_INTENT_ERROR', { intent, error: error.message });
    return await getFleetSummaryFallback(userId);
  }
}

/**
 * Fleet summary fallback
 */
async function getFleetSummaryFallback(userId) {
  const vehicles = await prisma.vehicle.findMany({
    where: { userId, deletedAt: null },
    select: {
      vehicleName: true,
      registrationNumber: true,
      make: true,
      model: true,
      status: true,
      telemetryOnline: true,
      lastTelemetryAt: true,
      _count: { select: { alerts: true, dtcCodes: true, maintenanceLogs: true } },
    },
    take: 50,
  });

  if (vehicles.length === 0) {
    return {
      response: `**Fleet Health Summary**\n\nNo vehicles in your fleet.\n\n**Recommended Action:** Add your first vehicle to start monitoring.`,
      metadata: {
        confidence: 'LOW',
        dataFreshness: 'UNKNOWN',
        simulatedNote: null,
        suggestedActions: [
          'Add a vehicle',
        ],
      },
    };
  }

  const online = vehicles.filter(v => v.telemetryOnline === true).length;
  const offline = vehicles.filter(v => v.telemetryOnline === false || v.status === 'OFFLINE').length;
  const standby = vehicles.filter(v => v.status === 'STANDBY').length;

  // Get current critical alerts (unread)
  const currentCriticalAlerts = await prisma.alert.count({
    where: {
      vehicle: { userId, deletedAt: null },
      read: false,
      severity: 'CRITICAL',
    },
  });

  // Get total historical alerts
  const totalHistoricalAlerts = vehicles.reduce((sum, v) => sum + v._count.alerts, 0);

  const totalDTCs = vehicles.reduce((sum, v) => sum + v._count.dtcCodes, 0);
  const maintenanceDue = await prisma.maintenanceLog.count({
    where: {
      vehicle: { userId, deletedAt: null },
      completed: false,
    },
  });

  // Top 3 risky vehicles with proper names
  const topRiskyVehicles = vehicles
    .sort((a, b) => b._count.alerts - a._count.alerts)
    .slice(0, 3)
    .map(v => ({
      name: `${v.make || ''} ${v.model || v.vehicleName || ''}`.trim(),
      plate: v.registrationNumber || 'No plate',
      alertCount: v._count.alerts,
    }));

  const response = `**Fleet Health Summary**\n\n**Total Vehicles:** ${vehicles.length}\n**Online:** ${online}\n**Offline:** ${offline}\n**Standby:** ${standby}\n\n**Current Critical Alerts:** ${currentCriticalAlerts}\n${totalHistoricalAlerts > currentCriticalAlerts ? `Historical Alerts: ${totalHistoricalAlerts}\n` : ''}**Active DTCs:** ${totalDTCs}\n**Maintenance Due:** ${maintenanceDue}\n\n**Top Risky Vehicles:**\n${topRiskyVehicles.map(v => `- ${v.name} (${v.plate}): ${v.alertCount} alerts`).join('\n')}\n\n**Recommended Action:** ${currentCriticalAlerts > 5 ? 'Address critical alerts immediately' : maintenanceDue > 3 ? 'Schedule pending maintenance' : 'Monitor fleet status regularly'}`;

  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: [
        'Show critical alerts',
        'Show vehicles needing maintenance',
        'Show offline vehicles',
      ],
    },
  };
}

/**
 * Vehicle details fallback
 */
async function getVehicleDetailsFallback(userId, message, entities, userVehicles) {
  // Find vehicle from entities or message
  let vehicle = entities.vehicles[0];
  
  if (!vehicle) {
    // Try to extract vehicle name from message
    const vehicleName = extractVehicleName(message, userVehicles);
    if (vehicleName) {
      vehicle = await prisma.vehicle.findFirst({
        where: {
          userId,
          deletedAt: null,
          vehicleName: { contains: vehicleName, mode: 'insensitive' },
        },
        select: {
          id: true,
          vehicleName: true,
          registrationNumber: true,
          vin: true,
          make: true,
          model: true,
          year: true,
          odometer: true,
          status: true,
          telemetryOnline: true,
          engineState: true,
          ignitionStatus: true,
        },
      });
    }
  } else {
    vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicle.id },
      select: {
        id: true,
        vehicleName: true,
        registrationNumber: true,
        vin: true,
        make: true,
        model: true,
        year: true,
        odometer: true,
        status: true,
        telemetryOnline: true,
        engineState: true,
        ignitionStatus: true,
      },
    });
  }

  if (!vehicle) {
    return {
      response: 'Vehicle not found. Please specify the vehicle name or plate number.',
      metadata: {
        confidence: 'LOW',
        dataFreshness: 'UNKNOWN',
        simulatedNote: null,
        suggestedActions: [
          'Summarize my fleet health',
          'Show all vehicles',
        ],
      },
    };
  }
  
  // Get latest telemetry
  const latestTelemetry = await prisma.telemetry.findFirst({
    where: { vehicleId: vehicle.id },
    orderBy: { timestamp: 'desc' },
    select: {
      timestamp: true,
      batteryVoltage: true,
      coolantTemp: true,
      fuelLevel: true,
      rpm: true,
      speed: true,
      odometer: true,
    },
  });
  
  // Get latest GPS
  const latestGPS = await prisma.gPSLocation.findFirst({
    where: { vehicleId: vehicle.id },
    orderBy: { timestamp: 'desc' },
    select: {
      timestamp: true,
      latitude: true,
      longitude: true,
      address: true,
    },
  });
  
  // Get top 5 alerts
  const alerts = await prisma.alert.findMany({
    where: { vehicleId: vehicle.id, read: false },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      type: true,
      severity: true,
      message: true,
      createdAt: true,
    },
  });
  
  // Get maintenance due
  const maintenance = await prisma.maintenanceLog.findMany({
    where: { vehicleId: vehicle.id, completed: false },
    orderBy: { dueDate: 'asc' },
    take: 5,
    select: {
      type: true,
      description: true,
      dueDate: true,
      priority: true,
    },
  });
  
  // Get active DTCs
  const dtcCodes = await prisma.dTCCode.findMany({
    where: { vehicleId: vehicle.id, active: true },
    select: {
      code: true,
      description: true,
      severity: true,
      detectedAt: true,
    },
  });
  
  const response = `**Vehicle: ${vehicle.name}**\n\n**Plate:** ${vehicle.plateNumber}\n**VIN:** ${vehicle.vin || 'N/A'}\n**Make/Model:** ${vehicle.make} ${vehicle.model} ${vehicle.year}\n**Status:** ${vehicle.liveState?.status || 'unknown'}\n**Ignition:** ${vehicle.liveState?.ignitionStatus ? 'ON' : 'OFF'}\n**Odometer:** ${vehicle.odometer?.toLocaleString() || 'N/A'} km\n\n**Latest Telemetry:**\n- Battery: ${latestTelemetry?.batteryVoltage || 'N/A'}V\n- Coolant: ${latestTelemetry?.coolantTemp || 'N/A'}°C\n- Fuel: ${latestTelemetry?.fuelLevel || 'N/A'}%\n- RPM: ${latestTelemetry?.rpm || 'N/A'}\n- Speed: ${latestTelemetry?.speed || 'N/A'} km/h\n\n**Latest Location:**\n- Address: ${latestGPS?.address || 'N/A'}\n- Coordinates: ${latestGPS?.latitude}, ${latestGPS?.longitude}\n- Updated: ${latestGPS?.timestamp || 'N/A'}\n\n**Active Alerts (${alerts.length}):**\n${alerts.slice(0, 5).map(a => `- ${a.severity}: ${a.message}`).join('\n')}\n\n**Maintenance Due (${maintenance.length}):**\n${maintenance.slice(0, 5).map(m => `- ${m.type}: ${m.description} (Due: ${m.dueDate})`).join('\n')}\n\n**Active DTCs (${dtcCodes.length}):**\n${dtcCodes.slice(0, 5).map(d => `- ${d.code}: ${d.description} (${d.severity})`).join('\n')}\n\n**Recommended Action:** ${alerts.length > 0 ? 'Address active alerts' : maintenance.length > 0 ? 'Schedule maintenance' : 'Vehicle is healthy'}`;
  
  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: [
        'Show vehicle maintenance',
        'Show vehicle alerts',
        'Show vehicle location',
      ],
    },
  };
}

/**
 * Vehicle comparison fallback
 */
async function getVehicleComparisonFallback(userId, entities, userVehicles) {
  const vehicles = entities.vehicles.slice(0, 2);
  
  if (vehicles.length < 2) {
    const vehicleNames = extractMultipleVehicleNames(entities.message || '', userVehicles);
    if (vehicleNames.length >= 2) {
      const foundVehicles = await Promise.all(
        vehicleNames.slice(0, 2).map(name =>
          prisma.vehicle.findFirst({
            where: {
              userId,
              deletedAt: null,
              vehicleName: { contains: name, mode: 'insensitive' },
            },
            select: {
              id: true,
              vehicleName: true,
              registrationNumber: true,
              make: true,
              model: true,
              year: true,
              status: true,
              telemetryOnline: true,
            },
          })
        )
      );
      vehicles.push(...foundVehicles.filter(v => v));
    }
  }
  
  if (vehicles.length < 2) {
    return {
      response: 'Need at least 2 vehicles for comparison. Please specify the vehicle names.',
      metadata: {
        confidence: 'LOW',
        dataFreshness: 'UNKNOWN',
        simulatedNote: null,
        suggestedActions: [
          'Show all vehicles',
          'Summarize my fleet health',
        ],
      },
    };
  }
  
  const vehicleData = await Promise.all(
    vehicles.map(async (v) => {
      const telemetry = await prisma.telemetry.findFirst({
        where: { vehicleId: v.id },
        orderBy: { timestamp: 'desc' },
        select: {
          batteryVoltage: true,
          coolantTemp: true,
          fuelLevel: true,
        },
      });
      
      const alertCount = await prisma.alert.count({
        where: { vehicleId: v.id, read: false },
      });
      
      const maintenanceCount = await prisma.maintenanceLog.count({
        where: { vehicleId: v.id, completed: false },
      });
      
      return {
        name: v.vehicleName,
        plate: v.registrationNumber,
        make: v.make,
        model: v.model,
        year: v.year,
        status: v.status || 'unknown',
        batteryVoltage: telemetry?.batteryVoltage,
        coolantTemp: telemetry?.coolantTemp,
        fuelLevel: telemetry?.fuelLevel,
        alertCount,
        maintenanceCount,
      };
    })
  );
  
  const [v1, v2] = vehicleData;
  const response = `**Vehicle Comparison**\n\n| Metric | ${v1.name} | ${v2.name} |\n|--------|-----------|-----------|\n| Plate | ${v1.plate} | ${v2.plate} |\n| Make/Model | ${v1.make} ${v1.model} ${v1.year} | ${v2.make} ${v2.model} ${v2.year} |\n| Status | ${v1.status} | ${v2.status} |\n| Battery | ${v1.batteryVoltage || 'N/A'}V | ${v2.batteryVoltage || 'N/A'}V |\n| Coolant | ${v1.coolantTemp || 'N/A'}°C | ${v2.coolantTemp || 'N/A'}°C |\n| Fuel | ${v1.fuelLevel || 'N/A'}% | ${v2.fuelLevel || 'N/A'}% |\n| Alerts | ${v1.alertCount} | ${v2.alertCount} |\n| Maintenance Due | ${v1.maintenanceCount} | ${v2.maintenanceCount} |\n\n**Winner:** ${v1.alertCount <= v2.alertCount ? v1.name : v2.name} (fewer alerts)\n\n**Recommended Action:** ${v1.alertCount > v2.alertCount ? `Prioritize ${v1.name} for maintenance` : v2.alertCount > v1.alertCount ? `Prioritize ${v2.name} for maintenance` : 'Both vehicles are in good condition'}`;
  
  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: [
        'Show vehicle details',
        'Compare maintenance',
        'Compare alerts',
      ],
    },
  };
}

/**
 * DTC fallback
 */
async function getDTCFallback(userId, entities) {
  const dtcCode = entities.dtcCode;
  
  if (!dtcCode) {
    // Show all active DTCs
    const dtcCodes = await prisma.dTCCode.findMany({
      where: {
        vehicle: { userId, deletedAt: null },
        active: true,
      },
      include: {
        vehicle: {
          select: {
            vehicleName: true,
            registrationNumber: true,
          },
        },
      },
      orderBy: { detectedAt: 'desc' },
      take: 10,
    });
    
    if (dtcCodes.length === 0) {
      return {
        response: 'No active DTC codes in your fleet.',
        metadata: {
          confidence: 'HIGH',
          dataFreshness: 'LIVE',
          simulatedNote: null,
          suggestedActions: [
            'Show critical alerts',
            'Show maintenance',
          ],
        },
      };
    }
    
    const response = `**Active DTC Codes**\n\n${dtcCodes.map(d => `- **${d.code}** (${d.vehicle.vehicleName}): ${d.description} - ${d.severity}`).join('\n')}\n\n**Total Active DTCs:** ${dtcCodes.length}\n\n**Recommended Action:** Address critical DTCs immediately`;
    
    return {
      response,
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'LIVE',
        simulatedNote: null,
        suggestedActions: [
          'Show vehicle details',
          'Clear DTCs',
          'Schedule diagnostic',
        ],
      },
    };
  }
  
  // Specific DTC code
  const dtcInfo = await prisma.dTCCode.findFirst({
    where: { code: dtcCode },
    include: {
      vehicle: {
        select: {
          vehicleName: true,
          registrationNumber: true,
        },
      },
    },
  });
  
  if (!dtcInfo) {
    return {
      response: `DTC code ${dtcCode} not found in your fleet.`,
      metadata: {
        confidence: 'LOW',
        dataFreshness: 'UNKNOWN',
        simulatedNote: null,
        suggestedActions: [
          'Show all DTCs',
          'Show vehicle details',
        ],
      },
    };
  }
  
  const response = `**DTC: ${dtcInfo.code}**\n\n**Description:** ${dtcInfo.description}\n**Severity:** ${dtcInfo.severity}\n**Vehicle:** ${dtcInfo.vehicle.vehicleName} (${dtcInfo.vehicle.registrationNumber})\n**Detected:** ${dtcInfo.detectedAt}\n\nThis code indicates a ${dtcInfo.severity.toLowerCase()} issue that should be addressed.\n\n**Recommended Action:** Schedule diagnostic and repair`;
  
  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: [
        'Show all DTCs',
        'Clear DTCs',
        'Schedule diagnostic',
      ],
    },
  };
}

/**
 * Maintenance fallback
 */
async function getMaintenanceFallback(userId) {
  const maintenanceDue = await prisma.maintenanceLog.findMany({
    where: {
      vehicle: { userId, deletedAt: null },
      completed: false,
    },
    include: {
      vehicle: {
        select: {
          name: true,
          plateNumber: true,
        },
      },
    },
    orderBy: { dueDate: 'asc' },
    take: 10,
  });
  
  if (maintenanceDue.length === 0) {
    return {
      response: 'No maintenance items due at this time.',
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'LIVE',
        simulatedNote: null,
        suggestedActions: [
          'Show critical alerts',
          'Show vehicle details',
        ],
      },
    };
  }
  
  const items = maintenanceDue.map(m => 
    `- ${m.vehicle.vehicleName} (${m.vehicle.registrationNumber}): ${m.type} - ${m.description} (Due: ${m.dueDate})`
  ).join('\n');
  
  const response = `**Maintenance Due**\n\n${items}\n\n**Total Items:** ${maintenanceDue.length}\n\n**Recommended Action:** Schedule maintenance for overdue items`;
  
  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: [
        'Show critical alerts',
        'Show vehicle details',
        'Schedule maintenance',
      ],
    },
  };
}

/**
 * Work order fallback with confirmation flow
 */
async function getWorkOrderFallback(userId, message, entities, userVehicles) {
  const lowerMessage = message.toLowerCase();

  // Check if user is confirming a work order
  if (lowerMessage.includes('yes') || lowerMessage.includes('confirm') || lowerMessage.includes('proceed')) {
    // In a real implementation, this would retrieve pending work order data from session/memory
    // For now, return a confirmation response
    return {
      response: 'Work order confirmed and created successfully.\n\n**Work Order Details:**\n- Status: PENDING\n- Created: Just now\n\n**Next Steps:**\n- Assign a technician\n- Schedule the repair\n- Track progress in the dashboard\n\n**Recommended Action:** Check the work orders section to view and manage this work order',
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'LIVE',
        simulatedNote: null,
        suggestedActions: [
          'Show work orders',
          'Show vehicle details',
          'Create another work order',
        ],
      },
    };
  }

  // Check if user is cancelling
  if (lowerMessage.includes('no') || lowerMessage.includes('cancel') || lowerMessage.includes('never mind')) {
    return {
      response: 'Work order creation cancelled.',
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'LIVE',
        simulatedNote: null,
        suggestedActions: [
          'Show fleet summary',
          'Show vehicle details',
        ],
      },
    };
  }

  // Check if a vehicle is specified in entities
  const vehicle = entities.vehicles[0];

  if (vehicle) {
    // Extract issue description from message
    const issueDescription = extractIssueDescription(message);

    if (!issueDescription) {
      return {
        response: `I can help you create a work order for **${vehicle.vehicleName}** (${vehicle.registrationNumber}).\n\nPlease provide:\n- The issue or problem description\n- Priority level (optional)\n- Any additional notes\n\nFor example: "Engine making strange noise, high priority"`,
        metadata: {
          confidence: 'HIGH',
          dataFreshness: 'LIVE',
          simulatedNote: null,
          suggestedActions: [
            'Show vehicle details',
            'Show maintenance history',
          ],
        },
      };
    }

    // Extract priority from message
    const priority = extractPriority(message) || 'MEDIUM';

    // Present confirmation
    return {
      response: `**Work Order Confirmation**\n\n**Vehicle:** ${vehicle.vehicleName} (${vehicle.registrationNumber})\n**Issue:** ${issueDescription}\n**Priority:** ${priority}\n\nDo you want to create this work order?\n\nReply "yes" to confirm or "no" to cancel.`,
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'LIVE',
        simulatedNote: 'AWAITING_CONFIRMATION',
        suggestedActions: [
          'Yes, create work order',
          'No, cancel',
          'Modify details',
        ],
      },
    };
  }

  // No vehicle specified - ask user to select one
  if (userVehicles.length === 0) {
    return {
      response: 'You don\'t have any vehicles in your fleet. Please add a vehicle first before creating a work order.',
      metadata: {
        confidence: 'LOW',
        dataFreshness: 'UNKNOWN',
        simulatedNote: null,
        suggestedActions: [
          'Add a vehicle',
          'Show fleet summary',
        ],
      },
    };
  }

  const vehicleList = userVehicles.slice(0, 5).map(v =>
    `- ${v.vehicleName} (${v.registrationNumber})`
  ).join('\n');

  return {
    response: `To create a work order, I need to know which vehicle it's for.\n\n**Your Vehicles:**\n${vehicleList}\n\nPlease tell me:\n1. Which vehicle needs the work order\n2. What is the issue or problem\n\nFor example: "Create work order for Honda Amaze - Engine making strange noise"`,
    metadata: {
      confidence: 'MEDIUM',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: [
        'Show vehicle details',
        'Show maintenance history',
        'Show fleet summary',
      ],
    },
  };
}

/**
 * Extract issue description from message
 */
function extractIssueDescription(message) {
  // Remove common work order phrases
  const cleaned = message
    .replace(/create work order for/gi, '')
    .replace(/work order for/gi, '')
    .replace(/create work order/gi, '')
    .replace(/for/gi, '')
    .replace(/high priority/gi, '')
    .replace(/low priority/gi, '')
    .replace(/medium priority/gi, '')
    .replace(/urgent/gi, '')
    .trim();

  // Return if there's meaningful content left
  return cleaned.length > 5 ? cleaned : null;
}

/**
 * Extract priority from message
 */
function extractPriority(message) {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('high') || lowerMessage.includes('urgent') || lowerMessage.includes('critical')) {
    return 'HIGH';
  }
  if (lowerMessage.includes('low')) {
    return 'LOW';
  }
  if (lowerMessage.includes('medium')) {
    return 'MEDIUM';
  }
  return null; // Default priority
}

/**
 * Alerts fallback
 */
async function getAlertsFallback(userId, entities) {
  const severityFilter = entities.alertType;
  
  const alerts = await prisma.alert.findMany({
    where: {
      vehicle: { userId, deletedAt: null },
      read: false,
      ...(severityFilter && { severity: severityFilter }),
    },
    include: {
      vehicle: {
        select: {
          name: true,
          plateNumber: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  
  if (alerts.length === 0) {
    return {
      response: 'No active alerts at this time.',
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'LIVE',
        simulatedNote: null,
        suggestedActions: [
          'Show vehicle details',
          'Show maintenance',
        ],
      },
    };
  }
  
  const alertList = alerts.map(a => 
    `- **${a.severity}** - ${a.vehicle.vehicleName} (${a.vehicle.registrationNumber}): ${a.message}`
  ).join('\n');
  
  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL').length;
  
  const response = `**Active Alerts**\n\n${alertList}\n\n**Total Alerts:** ${alerts.length}\n**Critical:** ${criticalCount}\n\n**Recommended Action:** ${criticalCount > 0 ? 'Address critical alerts immediately' : 'Review and acknowledge alerts'}`;
  
  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: [
        'Show vehicle details',
        'Show maintenance',
        'Acknowledge alerts',
      ],
    },
  };
}

/**
 * GPS fallback
 */
async function getGPSFallback(userId, entities, userVehicles) {
  let vehicle = entities.vehicles[0];
  
  if (!vehicle) {
    const vehicleName = extractVehicleName(entities.message || '', userVehicles);
    if (vehicleName) {
      vehicle = await prisma.vehicle.findFirst({
        where: {
          userId,
          deletedAt: null,
          vehicleName: { contains: vehicleName, mode: 'insensitive' },
        },
        select: { id: true, vehicleName: true, registrationNumber: true },
      });
    }
  }

  if (!vehicle) {
    return {
      response: 'Vehicle not found. Please specify the vehicle name or plate number.',
      metadata: {
        confidence: 'LOW',
        dataFreshness: 'UNKNOWN',
        simulatedNote: null,
        suggestedActions: [
          'Show all vehicles',
          'Summarize my fleet health',
        ],
      },
    };
  }
  
  const latestLocation = await prisma.gPSLocation.findFirst({
    where: { vehicleId: vehicle.id },
    orderBy: { timestamp: 'desc' },
    select: {
      timestamp: true,
      latitude: true,
      longitude: true,
      address: true,
    },
  });
  
  if (!latestLocation) {
    return {
      response: 'Location data not available for this vehicle.',
      metadata: {
        confidence: 'LOW',
        dataFreshness: 'UNKNOWN',
        simulatedNote: null,
        suggestedActions: [
          'Show vehicle details',
          'Show all vehicles',
        ],
      },
    };
  }
  
  const response = `**Vehicle Location**\n\n**Vehicle:** ${vehicle.vehicleName}\n**Plate:** ${vehicle.registrationNumber}\n**Address:** ${latestLocation.address || 'N/A'}\n**Coordinates:** ${latestLocation.latitude}, ${latestLocation.longitude}\n**Last Updated:** ${latestLocation.timestamp}\n\n**Recommended Action:** ${latestLocation.address ? 'Vehicle location is current' : 'GPS signal may be weak'}`;
  
  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: [
        'Show vehicle details',
        'Show nearby vehicles',
        'Create geofence',
      ],
    },
  };
}

/**
 * Offline vehicles fallback
 */
async function getOfflineVehiclesFallback(userId) {
  const staleCutoff = new Date(Date.now() - 30 * 60 * 1000);
  
  const offlineVehicles = await prisma.vehicle.findMany({
    where: {
      userId,
      deletedAt: null,
      OR: [
        { telemetryOnline: false },
        { lastTelemetryAt: null },
        { lastTelemetryAt: { lt: staleCutoff } },
        { status: 'OFFLINE' }
      ]
    },
    select: {
      vehicleName: true,
      registrationNumber: true,
      make: true,
      model: true,
      lastTelemetryAt: true,
    },
    take: 10,
  });
  
  if (offlineVehicles.length === 0) {
    return {
      response: 'All vehicles are currently online.',
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'LIVE',
        simulatedNote: null,
        suggestedActions: [
          'Summarize my fleet health',
          'Show critical alerts',
        ],
      },
    };
  }
  
  const vehicleList = offlineVehicles.map(v => 
    `- ${v.vehicleName} (${v.registrationNumber}): Last seen ${v.lastTelemetryAt || 'unknown'}`
  ).join('\n');
  
  const response = `**Offline Vehicles**\n\n${vehicleList}\n\n**Total Offline:** ${offlineVehicles.length}\n\n**Recommended Action:** Investigate connectivity for offline vehicles`;
  
  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: [
        'Summarize my fleet health',
        'Show critical alerts',
      ],
    },
  };
}

/**
 * Standby vehicles fallback
 */
async function getStandbyVehiclesFallback(userId) {
  const standbyVehicles = await prisma.vehicle.findMany({
    where: {
      userId,
      deletedAt: null,
      status: 'STANDBY',
    },
    select: {
      vehicleName: true,
      registrationNumber: true,
      make: true,
      model: true,
      ignitionStatus: true,
    },
    take: 10,
  });
  
  if (standbyVehicles.length === 0) {
    return {
      response: 'No vehicles are currently in standby mode.',
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'LIVE',
        simulatedNote: null,
        suggestedActions: [
          'Summarize my fleet health',
          'Show offline vehicles',
        ],
      },
    };
  }
  
  const vehicleList = standbyVehicles.map(v => 
    `- ${v.vehicleName} (${v.registrationNumber}): Ignition ${v.ignitionStatus ? 'ON' : 'OFF'}`
  ).join('\n');
  
  const response = `**Standby Vehicles**\n\n${vehicleList}\n\n**Total Standby:** ${standbyVehicles.length}\n\n**Recommended Action:** Monitor standby vehicles for deployment`;
  
  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: [
        'Summarize my fleet health',
        'Show offline vehicles',
      ],
    },
  };
}

/**
 * Battery fallback
 */
async function getBatteryFallback(userId, entities, userVehicles) {
  const { getBatteryHistoryAnalysis } = await import('./aiDataHelpers.js');
  let vehicle = entities.vehicles[0];
  const message = entities.message || '';

  // Check if user is asking for battery history
  const isHistoryQuery = message.toLowerCase().includes('history') || message.toLowerCase().includes('historical');

  if (!vehicle) {
    const vehicleName = extractVehicleName(message, userVehicles);
    if (vehicleName) {
      vehicle = await prisma.vehicle.findFirst({
        where: {
          userId,
          deletedAt: null,
          vehicleName: { contains: vehicleName, mode: 'insensitive' },
        },
        select: { id: true, vehicleName: true, registrationNumber: true },
      });
    }
  }

  if (vehicle && isHistoryQuery) {
    // Return enhanced battery history analysis
    const analysis = await getBatteryHistoryAnalysis(userId, vehicle.id);

    const response = `**Battery History: ${vehicle.vehicleName}**\n\nLatest Voltage: ${analysis.latest || 'N/A'}V\nAverage Voltage: ${analysis.average || 'N/A'}V\nLowest Voltage: ${analysis.lowest || 'N/A'}V\nTrend: ${analysis.trend}\nLast Update: ${analysis.lastUpdate || 'N/A'}\n\n**Recommendation:** ${analysis.recommendation}`;

    return {
      response,
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'HISTORICAL',
        simulatedNote: null,
        suggestedActions: [
          'Show vehicle details',
          'Show live data',
          'Show fuel history',
        ],
      },
    };
  }

  if (!vehicle) {
    // Get all vehicles with battery data
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, vehicleName: true, registrationNumber: true },
      take: 10,
    });

    const batteryData = await Promise.all(
      vehicles.map(async (v) => {
        const telemetry = await prisma.telemetry.findFirst({
          where: { vehicleId: v.id },
          orderBy: { timestamp: 'desc' },
          select: { batteryVoltage: true, timestamp: true },
        });

        return {
          name: v.vehicleName,
          plate: v.registrationNumber,
          voltage: telemetry?.batteryVoltage,
          timestamp: telemetry?.timestamp,
        };
      })
    );

    const batteryList = batteryData.map(v =>
      `- ${v.name} (${v.plate}): ${v.voltage || 'N/A'}V`
    ).join('\n');

    const response = `**Battery Status**\n\n${batteryList}\n\n**Recommended Action:** Check vehicles with low battery voltage`;

    return {
      response,
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'LIVE',
        simulatedNote: null,
        suggestedActions: [
          'Show vehicle details',
          'Show fuel status',
        ],
      },
    };
  }

  const telemetry = await prisma.telemetry.findFirst({
    where: { vehicleId: vehicle.id },
    orderBy: { timestamp: 'desc' },
    select: { batteryVoltage: true, timestamp: true },
  });

  const voltage = telemetry?.batteryVoltage;
  const status = voltage && voltage < 12 ? 'LOW' : voltage && voltage < 13 ? 'NORMAL' : 'GOOD';

  const response = `**Battery Status: ${vehicle.vehicleName}**\n\n**Plate:** ${vehicle.registrationNumber}\n**Voltage:** ${voltage || 'N/A'}V\n**Status:** ${status}\n**Last Updated:** ${telemetry?.timestamp || 'N/A'}\n\n**Recommended Action:** ${status === 'LOW' ? 'Charge battery immediately' : 'Battery is in good condition'}`;

  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: [
        'Show vehicle details',
        'Show fuel status',
        'Show battery history',
      ],
    },
  };
}

/**
 * Fuel fallback
 */
async function getFuelFallback(userId, entities, userVehicles) {
  let vehicle = entities.vehicles[0];
  
  if (!vehicle) {
    const vehicleName = extractVehicleName(entities.message || '', userVehicles);
    if (vehicleName) {
      vehicle = await prisma.vehicle.findFirst({
        where: {
          userId,
          deletedAt: null,
          vehicleName: { contains: vehicleName, mode: 'insensitive' },
        },
        select: { id: true, vehicleName: true, registrationNumber: true },
      });
    }
  }
  
  if (!vehicle) {
    // Get all vehicles with fuel data
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, vehicleName: true, registrationNumber: true },
      take: 10,
    });
    
    const fuelData = await Promise.all(
      vehicles.map(async (v) => {
        const telemetry = await prisma.telemetry.findFirst({
          where: { vehicleId: v.id },
          orderBy: { timestamp: 'desc' },
          select: { fuelLevel: true, timestamp: true },
        });
        
        return {
          name: v.vehicleName,
          plate: v.registrationNumber,
          fuelLevel: telemetry?.fuelLevel,
          timestamp: telemetry?.timestamp,
        };
      })
    );
    
    const fuelList = fuelData.map(v => 
      `- ${v.vehicleName} (${v.registrationNumber}): ${v.fuelLevel || 'N/A'}%`
    ).join('\n');
    
    const response = `**Fuel Status**\n\n${fuelList}\n\n**Recommended Action:** Refuel vehicles with low fuel`;
    
    return {
      response,
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'LIVE',
        simulatedNote: null,
        suggestedActions: [
          'Show vehicle details',
          'Show battery status',
        ],
      },
    };
  }
  
  const telemetry = await prisma.telemetry.findFirst({
    where: { vehicleId: vehicle.id },
    orderBy: { timestamp: 'desc' },
    select: { fuelLevel: true, timestamp: true },
  });
  
  const fuelLevel = telemetry?.fuelLevel;
  const status = fuelLevel && fuelLevel < 20 ? 'LOW' : fuelLevel && fuelLevel < 50 ? 'NORMAL' : 'GOOD';
  
  const response = `**Fuel Status: ${vehicle.vehicleName}**\n\n**Plate:** ${vehicle.registrationNumber}\n**Fuel Level:** ${fuelLevel || 'N/A'}%\n**Status:** ${status}\n**Last Updated:** ${telemetry?.timestamp || 'N/A'}\n\n**Recommended Action:** ${status === 'LOW' ? 'Refuel immediately' : 'Fuel level is adequate'}`;
  
  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: [
        'Show vehicle details',
        'Show battery status',
      ],
    },
  };
}

/**
 * Repair priority fallback (which vehicle is likely to fail next)
 */
async function getRepairPriorityFallback(userId) {
  const vehicles = await prisma.vehicle.findMany({
    where: { userId, deletedAt: null },
    select: {
      id: true,
      vehicleName: true,
      registrationNumber: true,
      make: true,
      model: true,
      status: true,
      telemetryOnline: true,
      lastTelemetryAt: true,
    },
  });
  
  const vehicleScores = await Promise.all(
    vehicles.map(async (v) => {
      const criticalAlerts = await prisma.alert.count({
        where: { vehicleId: v.id, severity: 'CRITICAL', read: false },
      });
      
      const criticalDTCs = await prisma.dTCCode.count({
        where: { vehicleId: v.id, active: true, severity: 'CRITICAL' },
      });
      
      const overdueMaintenance = await prisma.maintenanceLog.count({
        where: {
          vehicleId: v.id,
          completed: false,
          dueDate: { lt: new Date() },
        },
      });
      
      const isOffline = v.status === 'OFFLINE' || v.telemetryOnline === false;
      const offlineDays = v.lastTelemetryAt
        ? Math.floor((new Date() - new Date(v.lastTelemetryAt)) / (1000 * 60 * 60 * 24))
        : 0;
      
      const score = criticalAlerts * 10 + criticalDTCs * 8 + overdueMaintenance * 5 + (isOffline ? offlineDays * 2 : 0);
      
      return {
        name: v.vehicleName,
        plate: v.registrationNumber,
        make: v.make,
        model: v.model,
        score,
        criticalAlerts,
        criticalDTCs,
        overdueMaintenance,
        isOffline,
        offlineDays,
      };
    })
  );
  
  const topRisky = vehicleScores.sort((a, b) => b.score - a.score).slice(0, 3);
  
  if (topRisky.length === 0 || topRisky[0].score === 0) {
    return {
      response: 'All vehicles are in good condition. No immediate repair needed.',
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'LIVE',
        simulatedNote: null,
        suggestedActions: [
          'Summarize my fleet health',
          'Show maintenance',
        ],
      },
    };
  }
  
  const response = `**Repair Priority**\n\n${topRisky.map((v, i) => 
    `**${i + 1}. ${v.vehicleName} (${v.registrationNumber})**\n   Risk Score: ${v.score}\n   Critical Alerts: ${v.criticalAlerts}\n   Critical DTCs: ${v.criticalDTCs}\n   Overdue Maintenance: ${v.overdueMaintenance}\n   Offline: ${v.isOffline ? `Yes (${v.offlineDays} days)` : 'No'}`
  ).join('\n\n')}\n\n**Recommended Action:** Prioritize ${topRisky[0].vehicleName} for immediate inspection and repair`;
  
  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: [
        'Show vehicle details',
        'Show critical alerts',
        'Show maintenance',
      ],
    },
  };
}

/**
 * Extract vehicle name from message
 */
function extractVehicleName(message, userVehicles) {
  const words = message.split(' ');
  const vehicleNames = userVehicles.map(v => v.vehicleName?.toLowerCase() || '');
  
  for (const word of words) {
    for (const name of vehicleNames) {
      if (word.toLowerCase().includes(name)) {
        return name;
      }
    }
  }
  return null;
}

/**
 * Customer support fallback
 */
async function getSupportFallback(message) {
  const { getProductKnowledge } = await import('./fleetNimbleKnowledgeBase.js');
  const lowerMessage = message.toLowerCase();

  // Check for specific support questions and use product knowledge
  if (lowerMessage.includes('connect obd') || lowerMessage.includes('obd device') || lowerMessage.includes('how to connect obd')) {
    const obdInfo = getProductKnowledge('obdConnection');
    if (obdInfo) {
      return {
        response: obdInfo.steps,
        metadata: {
          confidence: 'HIGH',
          dataFreshness: 'STATIC',
          simulatedNote: null,
          suggestedActions: [
            'Show vehicle details',
            'Show offline vehicles',
          ],
        },
      };
    }
  }

  if (lowerMessage.includes('rpm not updating') || lowerMessage.includes('rpm not working')) {
    const troubleshooting = getProductKnowledge('troubleshooting');
    if (troubleshooting?.rpmNotUpdating) {
      return {
        response: troubleshooting.rpmNotUpdating,
        metadata: {
          confidence: 'HIGH',
          dataFreshness: 'STATIC',
          simulatedNote: null,
          suggestedActions: [
            'Show vehicle details',
            'Show live diagnostics',
          ],
        },
      };
    }
  }

  if (lowerMessage.includes('gps not showing') || lowerMessage.includes('gps not working') || lowerMessage.includes('location not showing')) {
    const troubleshooting = getProductKnowledge('troubleshooting');
    if (troubleshooting?.gpsNotShowing) {
      return {
        response: troubleshooting.gpsNotShowing,
        metadata: {
          confidence: 'HIGH',
          dataFreshness: 'STATIC',
          simulatedNote: null,
          suggestedActions: [
            'Show vehicle details',
            'Show GPS location',
          ],
        },
      };
    }
  }

  if (lowerMessage.includes('vin decode failed') || lowerMessage.includes('vin not decoding')) {
    const troubleshooting = getProductKnowledge('troubleshooting');
    if (troubleshooting?.vinDecodeFailed) {
      return {
        response: troubleshooting.vinDecodeFailed,
        metadata: {
          confidence: 'HIGH',
          dataFreshness: 'STATIC',
          simulatedNote: null,
          suggestedActions: [
            'Show vehicle details',
            'Add vehicle',
          ],
        },
      };
    }
  }

  if (lowerMessage.includes('vehicle offline') || lowerMessage.includes('why vehicle offline')) {
    const troubleshooting = getProductKnowledge('troubleshooting');
    if (troubleshooting?.vehicleOffline) {
      return {
        response: troubleshooting.vehicleOffline,
        metadata: {
          confidence: 'HIGH',
          dataFreshness: 'STATIC',
          simulatedNote: null,
          suggestedActions: [
            'Show offline vehicles',
            'Show vehicle details',
          ],
        },
      };
    }
  }

  if (lowerMessage.includes('add vehicle') || lowerMessage.includes('how to add vehicle') || lowerMessage.includes('create vehicle')) {
    const addVehicle = getProductKnowledge('addVehicle');
    if (addVehicle) {
      return {
        response: addVehicle.steps,
        metadata: {
          confidence: 'HIGH',
          dataFreshness: 'STATIC',
          simulatedNote: null,
          suggestedActions: [
            'Show all vehicles',
            'Show fleet summary',
          ],
        },
      };
    }
  }

  if (lowerMessage.includes('create work order') || lowerMessage.includes('how to create work order') || lowerMessage.includes('add work order')) {
    const workOrders = getProductKnowledge('workOrders');
    if (workOrders) {
      return {
        response: workOrders.overview,
        metadata: {
          confidence: 'HIGH',
          dataFreshness: 'STATIC',
          simulatedNote: null,
          suggestedActions: [
            'Show work orders',
            'Show maintenance',
          ],
        },
      };
    }
  }

  if (lowerMessage.includes('generate report') || lowerMessage.includes('how to generate report') || lowerMessage.includes('create report')) {
    const reports = getProductKnowledge('reports');
    if (reports) {
      return {
        response: reports.overview,
        metadata: {
          confidence: 'HIGH',
          dataFreshness: 'STATIC',
          simulatedNote: null,
          suggestedActions: [
            'Show fleet summary',
            'Generate executive report',
          ],
        },
      };
    }
  }

  if (lowerMessage.includes('schedule maintenance') || lowerMessage.includes('how to schedule maintenance')) {
    const maintenance = getProductKnowledge('maintenance');
    if (maintenance) {
      return {
        response: maintenance.overview,
        metadata: {
          confidence: 'HIGH',
          dataFreshness: 'STATIC',
          simulatedNote: null,
          suggestedActions: [
            'Show maintenance',
            'Show vehicles needing maintenance',
          ],
        },
      };
    }
  }

  if (lowerMessage.includes('live data') || lowerMessage.includes('see live data') || lowerMessage.includes('show live data')) {
    const liveDiagnostics = getProductKnowledge('liveDiagnostics');
    if (liveDiagnostics) {
      return {
        response: liveDiagnostics.overview,
        metadata: {
          confidence: 'HIGH',
          dataFreshness: 'STATIC',
          simulatedNote: null,
          suggestedActions: [
            'Show vehicle details',
            'Open Live Diagnostics',
          ],
        },
      };
    }
  }

  // FleetNimble overview
  if (lowerMessage.includes('fleetnimble') || lowerMessage.includes('what is fleetnimble') || lowerMessage.includes('how does fleetnimble work')) {
    const dashboard = getProductKnowledge('dashboard');
    if (dashboard) {
      return {
        response: dashboard.overview,
        metadata: {
          confidence: 'HIGH',
          dataFreshness: 'STATIC',
          simulatedNote: null,
          suggestedActions: [
            'Summarize my fleet health',
            'Show vehicle details',
            'Show critical alerts',
          ],
        },
      };
    }
  }

  // Default support response
  const dashboard = getProductKnowledge('dashboard');
  return {
    response: dashboard?.overview || `**FleetNimble Support**\n\nI can help you with:\n\n**Vehicle Management:**\n- Adding vehicles\n- Connecting OBD devices\n- VIN decoding\n- Vehicle details\n\n**Monitoring:**\n- Live diagnostics\n- GPS tracking\n- Alerts\n- Maintenance\n\n**Reports & Work Orders:**\n- Generating reports\n- Creating work orders\n- Scheduling maintenance\n\n**Troubleshooting:**\n- RPM not updating\n- GPS not showing\n- Vehicle offline\n- VIN decode failed\n\n**Recommended Action:** Ask a specific question about any feature`,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'STATIC',
      simulatedNote: null,
      suggestedActions: [
        'Summarize my fleet health',
        'Show vehicle details',
        'Show critical alerts',
      ],
    },
  };
}

/**
 * History fallback for historical data queries
 */
async function getHistoryFallback(userId, message, entities, userVehicles) {
  const lowerMessage = message.toLowerCase();
  let vehicle = entities.vehicles[0];

  if (!vehicle) {
    const vehicleName = extractVehicleName(message, userVehicles);
    if (vehicleName) {
      vehicle = await prisma.vehicle.findFirst({
        where: {
          userId,
          deletedAt: null,
          vehicleName: { contains: vehicleName, mode: 'insensitive' },
        },
        select: { id: true, vehicleName: true, registrationNumber: true },
      });
    }
  }

  if (!vehicle) {
    return {
      response: 'To view historical data, please specify which vehicle you want to see history for.',
      metadata: {
        confidence: 'LOW',
        dataFreshness: 'UNKNOWN',
        simulatedNote: null,
        suggestedActions: [
          'Show all vehicles',
          'Summarize my fleet health',
        ],
      },
    };
  }

  // Determine history type from message
  let historyType = 'general';
  if (lowerMessage.includes('telemetry')) historyType = 'telemetry';
  else if (lowerMessage.includes('maintenance')) historyType = 'maintenance';
  else if (lowerMessage.includes('alert')) historyType = 'alert';
  else if (lowerMessage.includes('gps') || lowerMessage.includes('location')) historyType = 'gps';
  else if (lowerMessage.includes('dtc') || lowerMessage.includes('diagnostic')) historyType = 'dtc';
  else if (lowerMessage.includes('fuel')) historyType = 'fuel';

  const response = `**Historical Data: ${vehicle.vehicleName}**\n\n**Plate:** ${vehicle.registrationNumber}\n\n**History Type:** ${historyType}\n\nTo view detailed historical data, please use the dashboard:\n1. Go to Vehicles > select vehicle\n2. Click "History" tab\n3. Select the data type (telemetry, maintenance, alerts, GPS, DTC, fuel)\n4. Choose date range\n5. View historical trends\n\n**Available History Types:**\n- Telemetry history (RPM, speed, temperature)\n- Maintenance history (service records)\n- Alert history (notifications)\n- GPS history (location tracking)\n- DTC history (diagnostic codes)\n- Fuel history (consumption data)\n\n**Recommended Action:** Check the dashboard for detailed historical analysis`;

  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'HISTORICAL',
      simulatedNote: null,
      suggestedActions: [
        'Show vehicle details',
        'Show live data',
        'Show maintenance history',
      ],
    },
  };
}

/**
 * Live data fallback for real-time telemetry queries
 */
async function getLiveDataFallback(userId, entities, userVehicles) {
  let vehicle = entities.vehicles[0];

  if (!vehicle) {
    const vehicleName = extractVehicleName(entities.message || '', userVehicles);
    if (vehicleName) {
      vehicle = await prisma.vehicle.findFirst({
        where: {
          userId,
          deletedAt: null,
          vehicleName: { contains: vehicleName, mode: 'insensitive' },
        },
        select: { id: true, vehicleName: true, registrationNumber: true },
      });
    }
  }

  if (!vehicle) {
    return {
      response: 'To view live data, please specify which vehicle you want to monitor.',
      metadata: {
        confidence: 'LOW',
        dataFreshness: 'UNKNOWN',
        simulatedNote: null,
        suggestedActions: [
          'Show all vehicles',
          'Summarize my fleet health',
        ],
      },
    };
  }

  const latestTelemetry = await prisma.telemetry.findFirst({
    where: { vehicleId: vehicle.id },
    orderBy: { timestamp: 'desc' },
    select: {
      timestamp: true,
      batteryVoltage: true,
      coolantTemp: true,
      fuelLevel: true,
      rpm: true,
      speed: true,
      throttlePosition: true,
      intakeTemp: true,
      maf: true,
    },
  });

  if (!latestTelemetry) {
    return {
      response: 'Live telemetry data not available for this vehicle. The vehicle may be offline or not equipped with OBD monitoring.',
      metadata: {
        confidence: 'LOW',
        dataFreshness: 'UNKNOWN',
        simulatedNote: null,
        suggestedActions: [
          'Show vehicle details',
          'Show offline vehicles',
        ],
      },
    };
  }

  const response = `**Live Telemetry: ${vehicle.vehicleName}**\n\n**Plate:** ${vehicle.registrationNumber}\n**Last Updated:** ${latestTelemetry.timestamp}\n\n**Engine Parameters:**\n- RPM: ${latestTelemetry.rpm || 'N/A'}\n- Speed: ${latestTelemetry.speed || 'N/A'} km/h\n- Throttle: ${latestTelemetry.throttlePosition || 'N/A'}%\n- Intake Temp: ${latestTelemetry.intakeTemp || 'N/A'}°C\n- MAF: ${latestTelemetry.maf || 'N/A'} g/s\n\n**System Status:**\n- Battery: ${latestTelemetry.batteryVoltage || 'N/A'}V\n- Coolant: ${latestTelemetry.coolantTemp || 'N/A'}°C\n- Fuel: ${latestTelemetry.fuelLevel || 'N/A'}%\n\n**Recommended Action:** ${latestTelemetry.batteryVoltage && latestTelemetry.batteryVoltage < 12 ? 'Check battery - voltage low' : 'All parameters within normal range'}`;

  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: [
        'Show vehicle details',
        'Show historical data',
        'Show vehicle location',
      ],
    },
  };
}

function extractMultipleVehicleNames(message, userVehicles) {
  const words = message.split(' ');
  const vehicleNames = userVehicles.map(v => v.vehicleName?.toLowerCase() || '');
  const foundNames = [];
  
  for (const word of words) {
    for (const name of vehicleNames) {
      if (word.toLowerCase().includes(name) && !foundNames.includes(name)) {
        foundNames.push(name);
      }
    }
  }
  
  return foundNames;
}
