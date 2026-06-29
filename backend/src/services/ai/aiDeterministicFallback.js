import prisma from '../../utils/prisma.js';
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
  console.log('AI_DETERMINISTIC_FALLBACK_USED', { message: message?.substring(0, 50) });
  
  try {
    // Step 1: Detect intent
    let intentResult;
    try {
      const userVehicles = await prisma.vehicle.findMany({
        where: { userId, deletedAt: null },
        select: { id: true, name: true, plateNumber: true, vin: true },
      });
      
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
  
  console.log('AI_FALLBACK_INTENT', { intent });
  
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
    console.error('INTENT_MATCHED_FALLBACK_ERROR', { intent, error: error.message });
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
      name: true,
      plateNumber: true,
      liveState: { select: { status: true } },
      _count: { select: { alerts: true, dtcCodes: true, maintenanceLogs: true } },
    },
  });
  
  const online = vehicles.filter(v => v.liveState?.status === 'online').length;
  const offline = vehicles.filter(v => v.liveState?.status === 'offline').length;
  const standby = vehicles.filter(v => v.liveState?.status === 'standby').length;
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
    .map(v => ({ name: v.name, plate: v.plateNumber, alertCount: v._count.alerts }));
  
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
          name: { contains: vehicleName, mode: 'insensitive' },
        },
        select: {
          id: true,
          name: true,
          plateNumber: true,
          vin: true,
          make: true,
          model: true,
          year: true,
          odometer: true,
          liveState: { select: { status: true, ignitionStatus: true } },
        },
      });
    }
  } else {
    vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicle.id },
      select: {
        id: true,
        name: true,
        plateNumber: true,
        vin: true,
        make: true,
        model: true,
        year: true,
        odometer: true,
        liveState: { select: { status: true, ignitionStatus: true } },
      },
    });
  }
  
  if (!vehicle) {
    return {
      response: 'Vehicle not found. Please specify the vehicle name.',
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
              name: { contains: name, mode: 'insensitive' },
            },
            select: {
              id: true,
              name: true,
              plateNumber: true,
              make: true,
              model: true,
              year: true,
              liveState: { select: { status: true } },
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
        name: v.name,
        plate: v.plateNumber,
        make: v.make,
        model: v.model,
        year: v.year,
        status: v.liveState?.status || 'unknown',
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
            name: true,
            plateNumber: true,
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
          name: { contains: vehicleName, mode: 'insensitive' },
        },
        select: { id: true, name: true, plateNumber: true },
      });
    }
  }
  
  if (!vehicle) {
    return {
      response: 'Vehicle not found. Please specify the vehicle name.',
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
  const offlineVehicles = await prisma.vehicle.findMany({
    where: {
      userId,
      deletedAt: null,
      liveState: { status: 'offline' },
    },
    select: {
      name: true,
      plateNumber: true,
      make: true,
      model: true,
      lastObdAt: true,
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
    `- ${v.name} (${v.plateNumber}): Last seen ${v.lastObdAt || 'unknown'}`
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
 * Repair priority fallback (which vehicle is likely to fail next)
 */
async function getRepairPriorityFallback(userId) {
  const vehicles = await prisma.vehicle.findMany({
    where: { userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      plateNumber: true,
      make: true,
      model: true,
      liveState: { select: { status: true } },
      lastObdAt: true,
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
      
      const isOffline = v.liveState?.status === 'offline';
      const offlineDays = v.lastObdAt
        ? Math.floor((new Date() - new Date(v.lastObdAt)) / (1000 * 60 * 60 * 24))
        : 0;
      
      const score = criticalAlerts * 10 + criticalDTCs * 8 + overdueMaintenance * 5 + (isOffline ? offlineDays * 2 : 0);
      
      return {
        name: v.name,
        plate: v.plateNumber,
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
 * Extract multiple vehicle names from message
 */
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
