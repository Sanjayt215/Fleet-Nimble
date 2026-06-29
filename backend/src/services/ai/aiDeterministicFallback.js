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
      status: true,
      telemetryOnline: true,
      lastTelemetryAt: true,
      _count: { select: { alerts: true, dtcCodes: true, maintenanceLogs: true } },
    },
  });
  
  const online = vehicles.filter(v => v.telemetryOnline === true).length;
  const offline = vehicles.filter(v => v.telemetryOnline === false || v.status === 'OFFLINE').length;
  const standby = vehicles.filter(v => v.status === 'STANDBY').length;
  const totalAlerts = vehicles.reduce((sum, v) => sum + v._count.alerts, 0);
  const totalDTCs = vehicles.reduce((sum, v) => sum + v._count.dtcCodes, 0);
  const maintenanceDue = await prisma.maintenanceLog.count({
    where: {
      vehicle: { userId, deletedAt: null },
      completed: false,
    },
  });
  
  const topRiskyVehicles = vehicles
    .sort((a, b) => b._count.alerts - a._count.alerts)
    .slice(0, 3)
    .map(v => ({ name: v.vehicleName, plate: v.registrationNumber, alertCount: v._count.alerts }));
  
  const response = `**Fleet Health Summary**\n\n**Total Vehicles:** ${vehicles.length}\n**Online:** ${online}\n**Offline:** ${offline}\n**Standby:** ${standby}\n**Critical Alerts:** ${totalAlerts}\n**Maintenance Due:** ${maintenanceDue}\n**Active DTCs:** ${totalDTCs}\n\n**Top Risky Vehicles:**\n${topRiskyVehicles.map(v => `- ${v.name} (${v.plate}): ${v.alertCount} alerts`).join('\n')}\n\n**Recommended Action:** ${totalAlerts > 5 ? 'Address critical alerts immediately' : 'Monitor fleet status regularly'}`;
  
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
      response: 'I could not find matching vehicle data for this request.',
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
    
    const response = `**Active DTC Codes**\n\n${dtcCodes.map(d => `- **${d.code}** (${d.vehicle.name}): ${d.description} - ${d.severity}`).join('\n')}\n\n**Total Active DTCs:** ${dtcCodes.length}\n\n**Recommended Action:** Address critical DTCs immediately`;
    
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
          name: true,
          plateNumber: true,
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
  
  const response = `**DTC: ${dtcInfo.code}**\n\n**Description:** ${dtcInfo.description}\n**Severity:** ${dtcInfo.severity}\n**Vehicle:** ${dtcInfo.vehicle.name} (${dtcInfo.vehicle.plate})\n**Detected:** ${dtcInfo.detectedAt}\n\nThis code indicates a ${dtcInfo.severity.toLowerCase()} issue that should be addressed.\n\n**Recommended Action:** Schedule diagnostic and repair`;
  
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
    `- ${m.vehicle.name} (${m.vehicle.plate}): ${m.type} - ${m.description} (Due: ${m.dueDate})`
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
    `- **${a.severity}** - ${a.vehicle.name} (${a.vehicle.plate}): ${a.message}`
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
      response: 'I could not find matching vehicle data for this request.',
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
  
  const response = `**Vehicle Location**\n\n**Vehicle:** ${vehicle.name}\n**Plate:** ${vehicle.plateNumber}\n**Address:** ${latestLocation.address || 'N/A'}\n**Coordinates:** ${latestLocation.latitude}, ${latestLocation.longitude}\n**Last Updated:** ${latestLocation.timestamp}\n\n**Recommended Action:** ${latestLocation.address ? 'Vehicle location is current' : 'GPS signal may be weak'}`;
  
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
          name: v.name,
          plate: v.plateNumber,
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
  
  const response = `**Battery Status: ${vehicle.name}**\n\n**Plate:** ${vehicle.plateNumber}\n**Voltage:** ${voltage || 'N/A'}V\n**Status:** ${status}\n**Last Updated:** ${telemetry?.timestamp || 'N/A'}\n\n**Recommended Action:** ${status === 'LOW' ? 'Charge battery immediately' : 'Battery is in good condition'}`;
  
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
          name: v.name,
          plate: v.plateNumber,
          fuelLevel: telemetry?.fuelLevel,
          timestamp: telemetry?.timestamp,
        };
      })
    );
    
    const fuelList = fuelData.map(v => 
      `- ${v.name} (${v.plate}): ${v.fuelLevel || 'N/A'}%`
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
  
  const response = `**Fuel Status: ${vehicle.name}**\n\n**Plate:** ${vehicle.plateNumber}\n**Fuel Level:** ${fuelLevel || 'N/A'}%\n**Status:** ${status}\n**Last Updated:** ${telemetry?.timestamp || 'N/A'}\n\n**Recommended Action:** ${status === 'LOW' ? 'Refuel immediately' : 'Fuel level is adequate'}`;
  
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
    `**${i + 1}. ${v.name} (${v.plate})**\n   Risk Score: ${v.score}\n   Critical Alerts: ${v.criticalAlerts}\n   Critical DTCs: ${v.criticalDTCs}\n   Overdue Maintenance: ${v.overdueMaintenance}\n   Offline: ${v.isOffline ? `Yes (${v.offlineDays} days)` : 'No'}`
  ).join('\n\n')}\n\n**Recommended Action:** Prioritize ${topRisky[0].name} for immediate inspection and repair`;
  
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
  const vehicleNames = userVehicles.map(v => v.name.toLowerCase());
  
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
  const lowerMessage = message.toLowerCase();
  
  // FleetNimble overview
  if (lowerMessage.includes('fleetnimble') || lowerMessage.includes('what is fleetnimble') || lowerMessage.includes('how does fleetnimble work')) {
    return {
      response: `**FleetNimble Overview**\n\nFleetNimble is a comprehensive fleet management platform that provides real-time vehicle tracking, diagnostics, maintenance scheduling, and AI-powered insights.\n\n**Key Features:**\n- Real-time GPS tracking\n- OBD device integration\n- Predictive maintenance\n- Digital twin technology\n- AI-powered analytics\n- Alert management\n- Geofencing\n\n**Recommended Action:** Explore the dashboard to see your fleet in action`,
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
  
  // OBD device
  if (lowerMessage.includes('obd') || lowerMessage.includes('device')) {
    return {
      response: `**OBD Device Information**\n\nFleetNimble uses OBD-II devices to connect to your vehicle's onboard computer and collect real-time data.\n\n**Installation:**\n1. Plug the OBD device into your vehicle's OBD-II port (usually under the dashboard)\n2. The device will automatically connect to our servers\n3. Data will start appearing in your dashboard\n\n**Supported Data:**\n- Engine diagnostics\n- Fuel consumption\n- Battery voltage\n- Temperature readings\n- Speed and RPM\n- Error codes (DTCs)\n\n**Troubleshooting:**\n- Ensure the device is properly plugged in\n- Check that the vehicle ignition is on\n- Verify the device has cellular signal\n\n**Recommended Action:** Check your vehicle's OBD port location`,
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
  
  // GPS tracking
  if (lowerMessage.includes('gps') || lowerMessage.includes('tracking') || lowerMessage.includes('location')) {
    return {
      response: `**GPS Tracking Information**\n\nFleetNimble provides real-time GPS tracking for all your vehicles.\n\n**Features:**\n- Live location updates\n- Historical route tracking\n- Geofencing capabilities\n- Speed monitoring\n- Distance traveled\n- Estimated arrival times\n\n**Accuracy:**\n- GPS accuracy: ~5-10 meters\n- Update frequency: Every 30-60 seconds\n- Works with cellular and satellite\n\n**Recommended Action:** Create a geofence for your vehicles`,
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'STATIC',
        simulatedNote: null,
        suggestedActions: [
          'Show vehicle location',
          'Create geofence',
          'Show offline vehicles',
        ],
      },
    };
  }
  
  // Subscriptions and pricing
  if (lowerMessage.includes('subscription') || lowerMessage.includes('pricing') || lowerMessage.includes('cost') || lowerMessage.includes('plan')) {
    return {
      response: `**Subscription Plans**\n\nFleetNimble offers flexible plans to fit your fleet size:\n\n**Starter Plan:**\n- Up to 5 vehicles\n- Basic tracking\n- Email alerts\n- $29/month\n\n**Professional Plan:**\n- Up to 20 vehicles\n- Advanced analytics\n- SMS alerts\n- Priority support\n- $79/month\n\n**Enterprise Plan:**\n- Unlimited vehicles\n- Custom integrations\n- Dedicated support\n- White-label options\n- Contact for pricing\n\n**Recommended Action:** Contact sales for enterprise pricing`,
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'STATIC',
        simulatedNote: null,
        suggestedActions: [
          'Summarize my fleet health',
          'Show vehicle details',
        ],
      },
    };
  }
  
  // Login and authentication
  if (lowerMessage.includes('login') || lowerMessage.includes('password') || lowerMessage.includes('auth')) {
    return {
      response: `**Login and Authentication**\n\n**How to Login:**\n1. Visit fleetnimble.com\n2. Click "Login" in the top right\n3. Enter your email and password\n4. Click "Sign In"\n\n**Troubleshooting:**\n- Forgot password? Click "Forgot Password" on login page\n- Account locked? Contact support\n- 2FA issues? Check your authenticator app\n\n**Security:**\n- Two-factor authentication available\n- Session timeout: 30 minutes\n- Password requirements: 8+ characters, mixed case, numbers\n\n**Recommended Action:** Reset your password if needed`,
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'STATIC',
        simulatedNote: null,
        suggestedActions: [
          'Contact support',
          'Reset password',
        ],
      },
    };
  }
  
  // Mobile app
  if (lowerMessage.includes('mobile') || lowerMessage.includes('app') || lowerMessage.includes('android') || lowerMessage.includes('ios')) {
    return {
      response: `**Mobile App Information**\n\nFleetNimble offers mobile apps for iOS and Android.\n\n**Features:**\n- Real-time tracking\n- Push notifications\n- Vehicle management\n- Alert management\n- Offline mode\n\n**Download:**\n- iOS: App Store\n- Android: Google Play Store\n\n**Requirements:**\n- iOS 12+\n- Android 8+\n- Internet connection\n\n**Recommended Action:** Download the app for on-the-go access`,
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'STATIC',
        simulatedNote: null,
        suggestedActions: [
          'Show vehicle details',
          'Show alerts',
        ],
      },
    };
  }
  
  // Digital twin
  if (lowerMessage.includes('digital twin') || lowerMessage.includes('twin')) {
    return {
      response: `**Digital Twin Technology**\n\nFleetNimble's Digital Twin creates a virtual replica of each vehicle in your fleet.\n\n**Capabilities:**\n- Real-time vehicle state simulation\n- Predictive maintenance modeling\n- What-if scenario analysis\n- Performance optimization\n- Fault prediction\n\n**Benefits:**\n- Reduce downtime\n- Optimize maintenance schedules\n- Improve safety\n- Lower operational costs\n\n**Recommended Action:** View your vehicle digital twins in the dashboard`,
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'STATIC',
        simulatedNote: null,
        suggestedActions: [
          'Show vehicle details',
          'Show maintenance',
        ],
      },
    };
  }
  
  // Geofence
  if (lowerMessage.includes('geofence') || lowerMessage.includes('geo fence')) {
    return {
      response: `**Geofencing Information**\n\nGeofencing allows you to create virtual boundaries for your vehicles.\n\n**Features:**\n- Entry/exit alerts\n- Speed limit enforcement\n- Route monitoring\n- Area restrictions\n- Time-based rules\n\n**Setup:**\n1. Go to Geofences in dashboard\n2. Click "Create Geofence"\n3. Draw boundary on map\n4. Set rules and alerts\n5. Assign vehicles\n\n**Use Cases:**\n- Monitor vehicle locations\n- Enforce route compliance\n- Prevent unauthorized areas\n- Track time on site\n\n**Recommended Action:** Create a geofence for your fleet`,
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'STATIC',
        simulatedNote: null,
        suggestedActions: [
          'Show vehicle location',
          'Create geofence',
        ],
      },
    };
  }
  
  // Battery protection
  if (lowerMessage.includes('battery protection') || lowerMessage.includes('battery drain')) {
    return {
      response: `**Battery Protection**\n\nFleetNimble helps prevent battery drain through intelligent monitoring.\n\n**Features:**\n- Voltage monitoring\n- Low battery alerts\n- Automatic shutdown prevention\n- Charging recommendations\n- Battery health tracking\n\n**Best Practices:**\n- Keep voltage above 12V\n- Monitor during long idle periods\n- Disconnect accessories when parked\n- Regular battery maintenance\n\n**Recommended Action:** Check your vehicle battery status`,
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'STATIC',
        simulatedNote: null,
        suggestedActions: [
          'Show battery status',
          'Show vehicle details',
        ],
      },
    };
  }
  
  // Engine standby
  if (lowerMessage.includes('engine standby') || lowerMessage.includes('ignition')) {
    return {
      response: `**Engine Standby Mode**\n\nFleetNimble's engine standby feature helps reduce fuel consumption and emissions.\n\n**How It Works:**\n- Monitors vehicle idle time\n- Automatically suggests engine shutdown\n- Tracks fuel savings\n- Reports environmental impact\n\n**Benefits:**\n- Reduced fuel costs\n- Lower emissions\n- Extended engine life\n- Compliance with regulations\n\n**Recommended Action:** Monitor your standby vehicles`,
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'STATIC',
        simulatedNote: null,
        suggestedActions: [
          'Show standby vehicles',
          'Show fuel status',
        ],
      },
    };
  }
  
  // VIN
  if (lowerMessage.includes('vin') || lowerMessage.includes('vehicle identification')) {
    return {
      response: `**VIN (Vehicle Identification Number)**\n\nThe VIN is a unique 17-character code that identifies your vehicle.\n\n**Uses in FleetNimble:**\n- Vehicle identification\n- Maintenance records\n- Insurance verification\n- Recall notifications\n- Parts ordering\n\n**Where to Find VIN:**\n- Dashboard (driver's side)\n- Vehicle registration\n- Insurance documents\n- Engine bay\n- Door frame\n\n**Recommended Action:** Add VIN to your vehicle profile`,
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'STATIC',
        simulatedNote: null,
        suggestedActions: [
          'Show vehicle details',
          'Add VIN to profile',
        ],
      },
    };
  }
  
  // General support
  return {
    response: `**FleetNimble Support**\n\nI can help you with:\n\n**Fleet Management:**\n- Vehicle tracking and monitoring\n- Maintenance scheduling\n- Alert management\n- GPS and location services\n\n**Technical Support:**\n- OBD device setup\n- Mobile app usage\n- Login and authentication\n- Digital twin features\n\n**Account Management:**\n- Subscription plans\n- Pricing information\n- User management\n- Settings configuration\n\n**Features:**\n- Geofencing\n- Battery protection\n- Engine standby\n- VIN management\n\n**Recommended Action:** Ask a specific question about any feature`,
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
function extractMultipleVehicleNames(message, userVehicles) {
  const words = message.split(' ');
  const vehicleNames = userVehicles.map(v => v.name.toLowerCase());
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
