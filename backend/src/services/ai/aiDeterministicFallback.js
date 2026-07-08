import prisma from '../../utils/prisma.js';
import logger from '../../utils/logger.js';
import { detectIntent, extractEntities, INTENTS } from './aiIntentDetector.js';
import { AIContextBuilder } from './aiContextBuilder.js';

function getVehicleDisplayName(vehicle) {
  if (!vehicle) return 'Unknown Vehicle';
  return vehicle.vehicleName ||
         [vehicle.make, vehicle.model].filter(Boolean).join(' ') ||
         vehicle.displayName ||
         'Unknown Vehicle';
}

function getVehiclePlate(vehicle) {
  if (!vehicle) return 'No plate';
  return vehicle.registrationNumber ||
         vehicle.plateNumber ||
         vehicle.vin ||
         'No plate';
}

function formatLastSeen(timestamp) {
  if (!timestamp) return 'Never';
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTimeago(date) {
  return date ? formatLastSeen(date) : 'Unknown';
}

export async function getDeterministicFallback(userId, message, vehicleId = null) {
  logger.info('AI_DETERMINISTIC_FALLBACK_USED', { message: message?.substring(0, 50) });

  try {
    let intentResult;
    try {
      const userVehicles = await prisma.vehicle.findMany({
        where: { userId, deletedAt: null },
        select: { id: true, vehicleName: true, registrationNumber: true, vin: true, make: true, model: true },
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

    const fallbackResult = await buildIntentMatchedFallback(userId, message, intentResult, null);

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
            'Show all vehicles',
            'Show vehicle details',
            'Show critical alerts',
          ],
        },
      },
    };
  }
}

async function buildIntentMatchedFallback(userId, message, intentResult, context) {
  const { intent, entities, userVehicles } = intentResult;

  logger.info('AI_FALLBACK_INTENT_MATCH', { intent });

  try {
    switch (intent) {
      case INTENTS.FLEET_SUMMARY:
        return await getFleetSummaryFallback(userId);
      case INTENTS.VEHICLE_DETAILS:
      case INTENTS.VEHICLE_SEARCH:
        return await getVehicleDetailsFallback(userId, message, entities, userVehicles);
      case INTENTS.LIST_VEHICLES:
        return await getListVehiclesFallback(userId);
      case INTENTS.VEHICLE_COMPARISON:
        return await getVehicleComparisonFallback(userId, entities, userVehicles);
      case INTENTS.DTC:
      case INTENTS.DTC_CODES:
        return await getDTCFallback(userId, entities);
      case INTENTS.MAINTENANCE:
      case INTENTS.MAINTENANCE_DUE:
        return await getMaintenanceFallback(userId);
      case INTENTS.WORK_ORDER:
        return await getWorkOrderFallback(userId, message, entities, userVehicles);
      case INTENTS.ALERTS:
      case INTENTS.CRITICAL_ALERTS:
        return await getAlertsFallback(userId, entities);
      case INTENTS.GPS:
      case INTENTS.GPS_TRACKING:
        return await getGPSFallback(userId, entities, userVehicles);
      case INTENTS.OFFLINE_VEHICLES:
        return await getOfflineVehiclesFallback(userId);
      case INTENTS.ONLINE_VEHICLES:
        return await getOnlineVehiclesFallback(userId);
      case INTENTS.STANDBY_VEHICLES:
        return await getStandbyVehiclesFallback(userId);
      case INTENTS.BATTERY:
        return await getBatteryFallback(userId, entities, userVehicles);
      case INTENTS.FUEL:
        return await getFuelFallback(userId, entities, userVehicles);
      case INTENTS.HISTORY:
        return await getHistoryFallback(userId, message, entities, userVehicles);
      case INTENTS.LIVE_DATA:
      case INTENTS.LIVE_DIAGNOSTICS:
        return await getLiveDataFallback(userId, entities, userVehicles);
      case INTENTS.PREDICTIVE_MAINTENANCE:
        return await getRepairPriorityFallback(userId);
      case INTENTS.SUPPORT:
        return await getSupportFallback(message, userVehicles);
      default:
        return await getGeneralFallback(userId, message);
    }
  } catch (error) {
    logger.error('AI_FALLBACK_INTENT_ERROR', { intent, error: error.message });
    return await getGeneralFallback(userId, message);
  }
}

async function getGeneralFallback(userId, message) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('offline')) {
    return await getOfflineVehiclesFallback(userId);
  }
  if (lowerMessage.includes('fleet') || lowerMessage.includes('summary') || lowerMessage.includes('health')) {
    return await getFleetSummaryFallback(userId);
  }

  const userVehicles = await prisma.vehicle.findMany({
    where: { userId, deletedAt: null },
    select: { vehicleName: true, registrationNumber: true, make: true, model: true },
    take: 5,
  });

  if (userVehicles.length > 0) {
    const vehicleList = userVehicles.map(v =>
      `- ${getVehicleDisplayName(v)} (${getVehiclePlate(v)})`
    ).join('\n');

    return {
      response: `I can help you with the following:\n\n**Your Vehicles:**\n${vehicleList}\n\n**What I can do:**\n- Summarize fleet health\n- Show vehicle details\n- List all vehicles\n- Show critical alerts\n- Show offline vehicles\n- Diagnose DTC codes\n- Maintenance status\n- GPS tracking\n- Live diagnostics\n\nWhat would you like to know about your fleet?`,
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'LIVE',
        simulatedNote: null,
        suggestedActions: [
          'Summarize my fleet health',
          'Show all vehicles',
          'Show critical alerts',
          'Show offline vehicles',
        ],
      },
    };
  }

  return {
    response: 'I can help you with fleet management, vehicle details, alerts, diagnostics, maintenance, GPS, and reports. What would you like to inspect?',
    metadata: {
      confidence: 'MEDIUM',
      dataFreshness: 'UNKNOWN',
      simulatedNote: null,
      suggestedActions: [
        'Summarize my fleet health',
        'Show all vehicles',
        'Show critical alerts',
      ],
    },
  };
}

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
        suggestedActions: ['Add a vehicle'],
      },
    };
  }

  const online = vehicles.filter(v => v.telemetryOnline === true).length;
  const offline = vehicles.filter(v => v.telemetryOnline === false || v.status === 'OFFLINE').length;
  const standby = vehicles.filter(v => v.status === 'STANDBY').length;

  const currentCriticalAlerts = await prisma.alert.count({
    where: {
      vehicle: { userId, deletedAt: null },
      read: false,
      severity: 'CRITICAL',
    },
  });

  const totalHistoricalAlerts = vehicles.reduce((sum, v) => sum + v._count.alerts, 0);
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
    .map(v => ({
      name: getVehicleDisplayName(v),
      plate: getVehiclePlate(v),
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

async function getListVehiclesFallback(userId) {
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
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  if (vehicles.length === 0) {
    return {
      response: 'No vehicles found in your fleet.',
      metadata: {
        confidence: 'LOW',
        dataFreshness: 'UNKNOWN',
        simulatedNote: null,
        suggestedActions: ['Add a vehicle'],
      },
    };
  }

  const vehicleList = vehicles.map(v => {
    const name = getVehicleDisplayName(v);
    const plate = getVehiclePlate(v);
    const status = v.telemetryOnline ? 'Online' : 'Offline';
    return `- **${name}** (${plate}) — ${status}`;
  }).join('\n');

  const online = vehicles.filter(v => v.telemetryOnline).length;
  const offline = vehicles.length - online;

  const response = `**All Vehicles (${vehicles.length})**\n\n${vehicleList}\n\n**Summary:** ${online} online, ${offline} offline`;

  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: [
        'Summarize my fleet health',
        'Show offline vehicles',
        'Show critical alerts',
      ],
    },
  };
}

async function getVehicleDetailsFallback(userId, message, entities, userVehicles) {
  let vehicle = entities.vehicles[0];

  if (!vehicle) {
    const searchTerms = message.toLowerCase();
    const brandNames = [
      'honda', 'toyota', 'ford', 'mazda', 'bmw', 'mercedes', 'audi',
      'volkswagen', 'hyundai', 'kia', 'nissan', 'chevrolet', 'suzuki',
      'maruti', 'tata', 'mahindra', 'isuzu', 'man', 'scania', 'volvo',
      'renault', 'fiat', 'jeep', 'dodge', 'subaru', 'mitsubishi',
      'lexus', 'acura', 'jaguar', 'land rover', 'mg', 'skoda',
    ];

    let matches = [];
    for (const brand of brandNames) {
      if (searchTerms.includes(brand)) {
        const brandVehicles = await prisma.vehicle.findMany({
          where: {
            userId,
            deletedAt: null,
            OR: [
              { make: { contains: brand, mode: 'insensitive' } },
              { vehicleName: { contains: brand, mode: 'insensitive' } },
            ],
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
            lastTelemetryAt: true,
          },
        });
        matches = brandVehicles;
        break;
      }
    }

    if (matches.length > 1) {
      const vehicleList = matches.map(v =>
        `- **${getVehicleDisplayName(v)}** (${getVehiclePlate(v)}) — ${v.telemetryOnline ? 'Online' : 'Offline'}`
      ).join('\n');

      return {
        response: `Found **${matches.length}** ${matches[0].make || ''} vehicles:\n\n${vehicleList}\n\nWhich vehicle do you want to inspect in detail?`,
        metadata: {
          confidence: 'HIGH',
          dataFreshness: 'LIVE',
          simulatedNote: null,
          suggestedActions: [
            'Show details for ' + matches[0]?.vehicleName,
            'Show all vehicles',
            'Summarize my fleet health',
          ],
        },
      };
    }

    if (matches.length === 1) {
      vehicle = matches[0];
    }
  }

  if (!vehicle) {
    vehicle = await prisma.vehicle.findFirst({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { vehicleName: { contains: message, mode: 'insensitive' } },
          { registrationNumber: { contains: message, mode: 'insensitive' } },
          { vin: { contains: message, mode: 'insensitive' } },
          { make: { contains: message, mode: 'insensitive' } },
          { model: { contains: message, mode: 'insensitive' } },
        ]
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
        lastTelemetryAt: true,
      },
    });
  }

  if (!vehicle) {
    const userVehicleList = userVehicles.slice(0, 5).map(v =>
      `- **${getVehicleDisplayName(v)}** (${getVehiclePlate(v)})`
    ).join('\n');

    if (userVehicleList) {
      return {
        response: `Vehicle not found. Please specify a vehicle name or plate number.\n\n**Your vehicles:**\n${userVehicleList}`,
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

    return {
      response: 'No vehicles found in your fleet. Add a vehicle to get started.',
      metadata: {
        confidence: 'LOW',
        dataFreshness: 'UNKNOWN',
        simulatedNote: null,
        suggestedActions: ['Add a vehicle'],
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
      odometer: true,
    },
  });

  const latestGPS = await prisma.gPSLocation.findFirst({
    where: { vehicleId: vehicle.id },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true, latitude: true, longitude: true, address: true },
  });

  const alerts = await prisma.alert.findMany({
    where: { vehicleId: vehicle.id, read: false },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { type: true, severity: true, message: true, createdAt: true },
  });

  const maintenance = await prisma.maintenanceLog.findMany({
    where: { vehicleId: vehicle.id, completed: false },
    orderBy: { dueDate: 'asc' },
    take: 5,
    select: { type: true, description: true, dueDate: true, priority: true },
  });

  const dtcCodes = await prisma.dTCCode.findMany({
    where: { vehicleId: vehicle.id, active: true },
    select: { code: true, description: true, severity: true, detectedAt: true },
  });

  const displayName = getVehicleDisplayName(vehicle);
  const plate = getVehiclePlate(vehicle);
  const lastSeen = formatLastSeen(vehicle.lastTelemetryAt);

  const response = `**Vehicle: ${displayName}**\n\n**Plate:** ${plate}\n**VIN:** ${vehicle.vin || 'N/A'}\n**Make/Model:** ${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.year || ''}\n**Status:** ${vehicle.telemetryOnline ? 'Online' : 'Offline'}\n**Last Seen:** ${lastSeen}\n**Odometer:** ${vehicle.odometer?.toLocaleString() || 'N/A'} km\n\n**Latest Telemetry:**\n- Battery: ${latestTelemetry?.batteryVoltage || 'N/A'}V\n- Coolant: ${latestTelemetry?.coolantTemp || 'N/A'}°C\n- Fuel: ${latestTelemetry?.fuelLevel || 'N/A'}%\n- RPM: ${latestTelemetry?.rpm || 'N/A'}\n- Speed: ${latestTelemetry?.speed || 'N/A'} km/h\n\n**Active Alerts (${alerts.length}):**\n${alerts.slice(0, 5).map(a => `- ${a.severity}: ${a.message}`).join('\n') || 'None'}\n\n**Maintenance Due (${maintenance.length}):**\n${maintenance.slice(0, 5).map(m => `- ${m.type || m.description || 'Service'}: Due ${m.dueDate ? new Date(m.dueDate).toLocaleDateString() : 'N/A'}`).join('\n') || 'None'}\n\n**Active DTCs (${dtcCodes.length}):**\n${dtcCodes.slice(0, 5).map(d => `- ${d.code}: ${d.description || ''} (${d.severity})`).join('\n') || 'None'}\n\n**Recommended Action:** ${alerts.length > 0 ? 'Address active alerts' : maintenance.length > 0 ? 'Schedule maintenance' : dtcCodes.length > 0 ? 'Check diagnostic codes' : 'Vehicle is healthy'}`;

  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: vehicle.telemetryOnline ? 'LIVE' : 'HISTORICAL',
      simulatedNote: null,
      suggestedActions: [
        'Show vehicle maintenance',
        'Show vehicle alerts',
        'Show vehicle location',
        'Check live diagnostics',
      ],
    },
  };
}

async function getVehicleComparisonFallback(userId, entities, userVehicles) {
  const vehicles = entities.vehicles.slice(0, 2);

  if (vehicles.length < 2) {
    const vehicleNames = extractMultipleVehicleNames(entities.message || '', userVehicles);
    if (vehicleNames.length >= 2) {
      const foundVehicles = await Promise.all(
        vehicleNames.slice(0, 2).map(name =>
          prisma.vehicle.findFirst({
            where: { userId, deletedAt: null, vehicleName: { contains: name, mode: 'insensitive' } },
            select: {
              id: true, vehicleName: true, registrationNumber: true,
              make: true, model: true, year: true, status: true, telemetryOnline: true,
            },
          })
        )
      );
      vehicles.push(...foundVehicles.filter(v => v));
    }
  }

  if (vehicles.length < 2) {
    return {
      response: 'Need at least 2 vehicles for comparison. Please specify the vehicle names.\n\nExample: "Compare Honda Amaze with Mazda 3"',
      metadata: {
        confidence: 'LOW',
        dataFreshness: 'UNKNOWN',
        simulatedNote: null,
        suggestedActions: ['Show all vehicles', 'Summarize my fleet health'],
      },
    };
  }

  const vehicleData = await Promise.all(
    vehicles.map(async (v) => {
      const telemetry = await prisma.telemetry.findFirst({
        where: { vehicleId: v.id },
        orderBy: { timestamp: 'desc' },
        select: { batteryVoltage: true, coolantTemp: true, fuelLevel: true },
      });

      const alertCount = await prisma.alert.count({
        where: { vehicleId: v.id, read: false },
      });

      const maintenanceCount = await prisma.maintenanceLog.count({
        where: { vehicleId: v.id, completed: false },
      });

      return {
        name: getVehicleDisplayName(v),
        plate: getVehiclePlate(v),
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
  const response = `**Vehicle Comparison**\n\n| Metric | ${v1.name} | ${v2.name} |\n|--------|-----------|-----------|\n| Plate | ${v1.plate} | ${v2.plate} |\n| Make/Model | ${v1.make} ${v1.model} ${v1.year || ''} | ${v2.make} ${v2.model} ${v2.year || ''} |\n| Status | ${v1.status} | ${v2.status} |\n| Battery | ${v1.batteryVoltage || 'N/A'}V | ${v2.batteryVoltage || 'N/A'}V |\n| Coolant | ${v1.coolantTemp || 'N/A'}°C | ${v2.coolantTemp || 'N/A'}°C |\n| Fuel | ${v1.fuelLevel || 'N/A'}% | ${v2.fuelLevel || 'N/A'}% |\n| Alerts | ${v1.alertCount} | ${v2.alertCount} |\n| Maintenance Due | ${v1.maintenanceCount} | ${v2.maintenanceCount} |\n\n**Recommended Action:** ${v1.alertCount > v2.alertCount ? `Prioritize ${v1.name} for maintenance` : v2.alertCount > v1.alertCount ? `Prioritize ${v2.name} for maintenance` : 'Both vehicles are in good condition'}`;

  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: ['Show vehicle details', 'Compare maintenance', 'Compare alerts'],
    },
  };
}

async function getDTCFallback(userId, entities) {
  const dtcCode = entities.dtcCode;

  if (!dtcCode) {
    const dtcCodes = await prisma.dTCCode.findMany({
      where: { vehicle: { userId, deletedAt: null }, active: true },
      include: {
        vehicle: { select: { vehicleName: true, registrationNumber: true } },
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
          suggestedActions: ['Show critical alerts', 'Show maintenance'],
        },
      };
    }

    const response = `**Active DTC Codes**\n\n${dtcCodes.map(d => `- **${d.code}** (${getVehicleDisplayName(d.vehicle)}): ${d.description || ''} — ${d.severity}`).join('\n')}\n\n**Total Active DTCs:** ${dtcCodes.length}\n\n**Recommended Action:** Address critical DTCs immediately`;

    return {
      response,
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'LIVE',
        simulatedNote: null,
        suggestedActions: ['Show vehicle details', 'Clear DTCs', 'Schedule diagnostic'],
      },
    };
  }

  const dtcInfo = await prisma.dTCCode.findFirst({
    where: { code: dtcCode },
    include: {
      vehicle: { select: { vehicleName: true, registrationNumber: true } },
    },
  });

  if (!dtcInfo) {
    return {
      response: `DTC code ${dtcCode} not found in your fleet.`,
      metadata: {
        confidence: 'LOW',
        dataFreshness: 'UNKNOWN',
        simulatedNote: null,
        suggestedActions: ['Show all DTCs', 'Show vehicle details'],
      },
    };
  }

  const response = `**DTC: ${dtcInfo.code}**\n\n**Description:** ${dtcInfo.description || 'N/A'}\n**Severity:** ${dtcInfo.severity}\n**Vehicle:** ${getVehicleDisplayName(dtcInfo.vehicle)} (${getVehiclePlate(dtcInfo.vehicle)})\n**Detected:** ${dtcInfo.detectedAt ? new Date(dtcInfo.detectedAt).toLocaleString() : 'N/A'}\n\n**Recommended Action:** Schedule diagnostic and repair`;

  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: ['Show all DTCs', 'Clear DTCs', 'Schedule diagnostic'],
    },
  };
}

async function getMaintenanceFallback(userId) {
  const maintenanceDue = await prisma.maintenanceLog.findMany({
    where: { vehicle: { userId, deletedAt: null }, completed: false },
    include: {
      vehicle: { select: { vehicleName: true, registrationNumber: true, make: true, model: true } },
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
        suggestedActions: ['Show critical alerts', 'Show vehicle details'],
      },
    };
  }

  const overdue = maintenanceDue.filter(m => m.dueDate && new Date(m.dueDate) < new Date());
  const items = maintenanceDue.map(m => {
    const status = m.dueDate && new Date(m.dueDate) < new Date() ? 'OVERDUE' : 'Due';
    return `- **${getVehicleDisplayName(m.vehicle)}** (${getVehiclePlate(m.vehicle)}): ${m.serviceType || m.type || 'Service'} — ${status} ${m.dueDate ? new Date(m.dueDate).toLocaleDateString() : 'No date'}`;
  }).join('\n');

  const response = `**${overdue.length > 0 ? 'Overdue & ' : ''}Maintenance Due**\n\n${items}\n\n**Total Items:** ${maintenanceDue.length}\n${overdue.length > 0 ? `**Overdue:** ${overdue.length}\n` : ''}**Recommended Action:** ${overdue.length > 0 ? 'Schedule overdue maintenance immediately' : 'Plan upcoming maintenance'}`;

  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: ['Show critical alerts', 'Show vehicle details', 'Schedule maintenance'],
    },
  };
}

async function getWorkOrderFallback(userId, message, entities, userVehicles) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('yes') || lowerMessage.includes('confirm') || lowerMessage.includes('proceed')) {
    return {
      response: 'Work order confirmed and created successfully.\n\n**Next Steps:**\n- Assign a technician\n- Schedule the repair\n- Track progress in the dashboard',
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'LIVE',
        simulatedNote: null,
        suggestedActions: ['Show work orders', 'Show vehicle details', 'Create another work order'],
      },
    };
  }

  if (lowerMessage.includes('no') || lowerMessage.includes('cancel') || lowerMessage.includes('never mind')) {
    return {
      response: 'Work order creation cancelled.',
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'LIVE',
        simulatedNote: null,
        suggestedActions: ['Show fleet summary', 'Show vehicle details'],
      },
    };
  }

  const vehicle = entities.vehicles[0];
  if (vehicle) {
    return {
      response: `I can help you create a work order for **${getVehicleDisplayName(vehicle)}** (${getVehiclePlate(vehicle)}).\n\nPlease describe the issue. Example:\n"Engine making strange noise, high priority"`,
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'LIVE',
        simulatedNote: null,
        suggestedActions: ['Show vehicle details', 'Show maintenance history'],
      },
    };
  }

  if (userVehicles.length === 0) {
    return {
      response: 'You don\'t have any vehicles. Please add a vehicle first.',
      metadata: {
        confidence: 'LOW',
        dataFreshness: 'UNKNOWN',
        simulatedNote: null,
        suggestedActions: ['Add a vehicle', 'Show fleet summary'],
      },
    };
  }

  const vehicleList = userVehicles.slice(0, 5).map(v =>
    `- ${getVehicleDisplayName(v)} (${getVehiclePlate(v)})`
  ).join('\n');

  return {
    response: `To create a work order, I need to know which vehicle it's for.\n\n**Your Vehicles:**\n${vehicleList}\n\nExample: "Create work order for ${getVehicleDisplayName(userVehicles[0])} — Engine noise"`,
    metadata: {
      confidence: 'MEDIUM',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: ['Show vehicle details', 'Show maintenance history', 'Show fleet summary'],
    },
  };
}

async function getAlertsFallback(userId, entities) {
  const severityFilter = entities.alertType;

  const whereClause = {
    vehicle: { userId, deletedAt: null },
    read: false,
  };
  if (severityFilter) {
    whereClause.severity = severityFilter;
  }

  const alerts = await prisma.alert.findMany({
    where: whereClause,
    include: {
      vehicle: { select: { vehicleName: true, registrationNumber: true, make: true, model: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  if (alerts.length === 0) {
    return {
      response: severityFilter === 'CRITICAL'
        ? 'No critical alerts at this time.'
        : 'No active alerts at this time.',
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'LIVE',
        simulatedNote: null,
        suggestedActions: ['Show vehicle details', 'Show maintenance', 'Show offline vehicles'],
      },
    };
  }

  const alertList = alerts.map(a =>
    `- **${a.severity}** — ${getVehicleDisplayName(a.vehicle)} (${getVehiclePlate(a.vehicle)}): ${a.message}`
  ).join('\n');

  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL').length;
  const alertTypeLabel = severityFilter === 'CRITICAL' ? 'Critical' : 'Active';

  const response = `**${alertTypeLabel} Alerts (${alerts.length})**\n\n${alertList}\n\n**Total:** ${alerts.length}\n**Critical:** ${criticalCount}\n\n**Recommended Action:** ${criticalCount > 0 ? 'Address critical alerts immediately' : 'Review and acknowledge alerts'}`;

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

async function getGPSFallback(userId, entities, userVehicles) {
  let vehicle = entities.vehicles[0];

  if (!vehicle) {
    const vehicleName = extractVehicleName(entities.message || '', userVehicles);
    if (vehicleName) {
      vehicle = await prisma.vehicle.findFirst({
        where: { userId, deletedAt: null, vehicleName: { contains: vehicleName, mode: 'insensitive' } },
        select: { id: true, vehicleName: true, registrationNumber: true },
      });
    }
  }

  if (!vehicle) {
    const recentGPS = await prisma.gPSLocation.findFirst({
      where: { vehicle: { userId, deletedAt: null } },
      orderBy: { recordedAt: 'desc' },
      select: {
        vehicle: { select: { vehicleName: true, registrationNumber: true } },
        recordedAt: true,
      },
    });

    if (recentGPS) {
      return {
        response: `To see GPS location, please specify which vehicle.\n\nLatest GPS update from: ${getVehicleDisplayName(recentGPS.vehicle)} at ${formatLastSeen(recentGPS.recordedAt)}`,
        metadata: {
          confidence: 'MEDIUM',
          dataFreshness: 'LIVE',
          simulatedNote: null,
          suggestedActions: ['Show all vehicles', 'Show vehicle details'],
        },
      };
    }

    return {
      response: 'Please specify which vehicle you want GPS location for.',
      metadata: {
        confidence: 'LOW',
        dataFreshness: 'UNKNOWN',
        simulatedNote: null,
        suggestedActions: ['Show all vehicles', 'Summarize my fleet health'],
      },
    };
  }

  const latestLocation = await prisma.gPSLocation.findFirst({
    where: { vehicleId: vehicle.id },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true, latitude: true, longitude: true, address: true },
  });

  if (!latestLocation) {
    return {
      response: `GPS data not available for ${getVehicleDisplayName(vehicle)}.`,
      metadata: {
        confidence: 'LOW',
        dataFreshness: 'UNKNOWN',
        simulatedNote: null,
        suggestedActions: ['Show vehicle details', 'Show all vehicles'],
      },
    };
  }

  const response = `**Vehicle Location**\n\n**Vehicle:** ${getVehicleDisplayName(vehicle)}\n**Plate:** ${getVehiclePlate(vehicle)}\n**Address:** ${latestLocation.address || 'N/A'}\n**Coordinates:** ${latestLocation.latitude?.toFixed(4) || 'N/A'}, ${latestLocation.longitude?.toFixed(4) || 'N/A'}\n**Last Updated:** ${formatLastSeen(latestLocation.timestamp)}`;

  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: ['Show vehicle details', 'Create geofence', 'Show nearby vehicles'],
    },
  };
}

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
        { status: 'OFFLINE' },
      ],
    },
    select: {
      vehicleName: true,
      registrationNumber: true,
      make: true,
      model: true,
      status: true,
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
        suggestedActions: ['Summarize my fleet health', 'Show critical alerts'],
      },
    };
  }

  const vehicleList = offlineVehicles.map(v =>
    `- **${getVehicleDisplayName(v)}** (${getVehiclePlate(v)}) — Offline — Last seen: ${formatLastSeen(v.lastTelemetryAt)}`
  ).join('\n');

  const response = `**Offline Vehicles (${offlineVehicles.length})**\n\n${vehicleList}\n\n**Recommended Action:** Investigate connectivity for offline vehicles`;

  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: ['Summarize my fleet health', 'Show critical alerts', 'Show online vehicles'],
    },
  };
}

async function getOnlineVehiclesFallback(userId) {
  const onlineVehicles = await prisma.vehicle.findMany({
    where: {
      userId,
      deletedAt: null,
      telemetryOnline: true,
    },
    select: {
      vehicleName: true,
      registrationNumber: true,
      make: true,
      model: true,
      status: true,
      lastTelemetryAt: true,
    },
    take: 10,
  });

  if (onlineVehicles.length === 0) {
    return {
      response: 'No vehicles are currently online.',
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'LIVE',
        simulatedNote: null,
        suggestedActions: ['Show offline vehicles', 'Show all vehicles'],
      },
    };
  }

  const vehicleList = onlineVehicles.map(v =>
    `- **${getVehicleDisplayName(v)}** (${getVehiclePlate(v)}) — Online — Last seen: ${formatLastSeen(v.lastTelemetryAt)}`
  ).join('\n');

  const response = `**Online Vehicles (${onlineVehicles.length})**\n\n${vehicleList}`;

  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: ['Summarize my fleet health', 'Show offline vehicles', 'Show critical alerts'],
    },
  };
}

async function getStandbyVehiclesFallback(userId) {
  const standbyVehicles = await prisma.vehicle.findMany({
    where: { userId, deletedAt: null, status: 'STANDBY' },
    select: {
      vehicleName: true, registrationNumber: true, make: true, model: true, lastTelemetryAt: true,
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
        suggestedActions: ['Summarize my fleet health', 'Show offline vehicles'],
      },
    };
  }

  const vehicleList = standbyVehicles.map(v =>
    `- **${getVehicleDisplayName(v)}** (${getVehiclePlate(v)}) — Last seen: ${formatLastSeen(v.lastTelemetryAt)}`
  ).join('\n');

  const response = `**Standby Vehicles**\n\n${vehicleList}\n\n**Total Standby:** ${standbyVehicles.length}`;

  return {
    response,
    metadata: {
      confidence: 'HIGH',
      dataFreshness: 'LIVE',
      simulatedNote: null,
      suggestedActions: ['Summarize my fleet health', 'Show offline vehicles'],
    },
  };
}

async function getBatteryFallback(userId, entities, userVehicles) {
  const { getBatteryHistoryAnalysis } = await import('./aiDataHelpers.js');
  let vehicle = entities.vehicles[0];
  const message = entities.message || '';

  const isHistoryQuery = message.toLowerCase().includes('history') || message.toLowerCase().includes('historical');

  if (!vehicle) {
    const vehicleName = extractVehicleName(message, userVehicles);
    if (vehicleName) {
      vehicle = await prisma.vehicle.findFirst({
        where: { userId, deletedAt: null, vehicleName: { contains: vehicleName, mode: 'insensitive' } },
        select: { id: true, vehicleName: true, registrationNumber: true },
      });
    }
  }

  if (vehicle && isHistoryQuery) {
    const analysis = await getBatteryHistoryAnalysis(userId, vehicle.id);
    const response = `**Battery History: ${getVehicleDisplayName(vehicle)}**\n\nLatest Voltage: ${analysis.latest || 'N/A'}V\nAverage Voltage: ${analysis.average || 'N/A'}V\nLowest Voltage: ${analysis.lowest || 'N/A'}V\nTrend: ${analysis.trend}\nLast Update: ${analysis.lastUpdate ? formatLastSeen(analysis.lastUpdate) : 'N/A'}\n\n**Recommendation:** ${analysis.recommendation}`;

    return {
      response,
      metadata: {
        confidence: 'HIGH',
        dataFreshness: 'HISTORICAL',
        simulatedNote: null,
        suggestedActions: ['Show vehicle details', 'Show live data', 'Show fuel history'],
      },
    };
  }

  if (!vehicle) {
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
        return { name: getVehicleDisplayName(v), plate: getVehiclePlate(v), voltage: telemetry?.batteryVoltage, timestamp: telemetry?.timestamp };
      })
    );

    const batteryList = batteryData.map(v =>
      `- **${v.name}** (${v.plate}): ${v.voltage || 'N/A'}V`
    ).join('\n');

    const response = `**Battery Status Across Fleet**\n\n${batteryList}\n\n**Recommended Action:** Check vehicles with low battery voltage`;
    return { response, metadata: { confidence: 'HIGH', dataFreshness: 'LIVE', simulatedNote: null, suggestedActions: ['Show vehicle details', 'Show fuel status'] } };
  }

  const telemetry = await prisma.telemetry.findFirst({
    where: { vehicleId: vehicle.id },
    orderBy: { timestamp: 'desc' },
    select: { batteryVoltage: true, timestamp: true },
  });

  const voltage = telemetry?.batteryVoltage;
  const status = voltage && voltage < 12 ? 'LOW' : voltage && voltage < 13 ? 'NORMAL' : 'GOOD';
  const response = `**Battery Status: ${getVehicleDisplayName(vehicle)}**\n\n**Plate:** ${getVehiclePlate(vehicle)}\n**Voltage:** ${voltage || 'N/A'}V\n**Status:** ${status}\n**Last Updated:** ${telemetry?.timestamp ? formatLastSeen(telemetry.timestamp) : 'N/A'}\n\n**Recommended Action:** ${status === 'LOW' ? 'Charge battery or check alternator' : 'Battery is in good condition'}`;

  return { response, metadata: { confidence: 'HIGH', dataFreshness: 'LIVE', simulatedNote: null, suggestedActions: ['Show vehicle details', 'Show fuel status', 'Show battery history'] } };
}

async function getFuelFallback(userId, entities, userVehicles) {
  let vehicle = entities.vehicles[0];

  if (!vehicle) {
    const vehicleName = extractVehicleName(entities.message || '', userVehicles);
    if (vehicleName) {
      vehicle = await prisma.vehicle.findFirst({
        where: { userId, deletedAt: null, vehicleName: { contains: vehicleName, mode: 'insensitive' } },
        select: { id: true, vehicleName: true, registrationNumber: true },
      });
    }
  }

  if (!vehicle) {
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
        return { name: getVehicleDisplayName(v), plate: getVehiclePlate(v), fuelLevel: telemetry?.fuelLevel, timestamp: telemetry?.timestamp };
      })
    );

    const fuelList = fuelData.map(v =>
      `- **${v.name}** (${v.plate}): ${v.fuelLevel || 'N/A'}%`
    ).join('\n');

    return { response: `**Fuel Status Across Fleet**\n\n${fuelList}\n\n**Recommended Action:** Refuel vehicles with low fuel`, metadata: { confidence: 'HIGH', dataFreshness: 'LIVE', simulatedNote: null, suggestedActions: ['Show vehicle details', 'Show battery status'] } };
  }

  const telemetry = await prisma.telemetry.findFirst({
    where: { vehicleId: vehicle.id },
    orderBy: { timestamp: 'desc' },
    select: { fuelLevel: true, timestamp: true },
  });

  const fuelLevel = telemetry?.fuelLevel;
  const status = fuelLevel && fuelLevel < 20 ? 'LOW' : fuelLevel && fuelLevel < 50 ? 'NORMAL' : 'GOOD';
  const response = `**Fuel Status: ${getVehicleDisplayName(vehicle)}**\n\n**Plate:** ${getVehiclePlate(vehicle)}\n**Fuel Level:** ${fuelLevel || 'N/A'}%\n**Status:** ${status}\n**Last Updated:** ${telemetry?.timestamp ? formatLastSeen(telemetry.timestamp) : 'N/A'}\n\n**Recommended Action:** ${status === 'LOW' ? 'Refuel soon' : 'Fuel level is adequate'}`;

  return { response, metadata: { confidence: 'HIGH', dataFreshness: 'LIVE', simulatedNote: null, suggestedActions: ['Show vehicle details', 'Show battery status'] } };
}

async function getRepairPriorityFallback(userId) {
  const vehicles = await prisma.vehicle.findMany({
    where: { userId, deletedAt: null },
    select: {
      id: true, vehicleName: true, registrationNumber: true,
      make: true, model: true, status: true, telemetryOnline: true, lastTelemetryAt: true,
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
        where: { vehicleId: v.id, completed: false, dueDate: { lt: new Date() } },
      });
      const isOffline = v.status === 'OFFLINE' || v.telemetryOnline === false;
      const offlineDays = v.lastTelemetryAt
        ? Math.floor((new Date() - new Date(v.lastTelemetryAt)) / (1000 * 60 * 60 * 24))
        : 0;
      const score = criticalAlerts * 10 + criticalDTCs * 8 + overdueMaintenance * 5 + (isOffline ? offlineDays * 2 : 0);

      return {
        name: getVehicleDisplayName(v),
        plate: getVehiclePlate(v),
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
      metadata: { confidence: 'HIGH', dataFreshness: 'LIVE', simulatedNote: null, suggestedActions: ['Summarize my fleet health', 'Show maintenance'] },
    };
  }

  const response = `**Repair Priority**\n\n${topRisky.map((v, i) =>
    `**${i + 1}. ${v.name} (${v.plate})**\n   Risk Score: ${v.score}\n   Critical Alerts: ${v.criticalAlerts}\n   Critical DTCs: ${v.criticalDTCs}\n   Overdue Maintenance: ${v.overdueMaintenance}\n   Offline: ${v.isOffline ? `Yes (${v.offlineDays} days)` : 'No'}`
  ).join('\n\n')}\n\n**Recommended Action:** Prioritize ${topRisky[0].name} for immediate inspection and repair`;

  return { response, metadata: { confidence: 'HIGH', dataFreshness: 'LIVE', simulatedNote: null, suggestedActions: ['Show vehicle details', 'Show critical alerts', 'Show maintenance'] } };
}

async function getSupportFallback(message, userVehicles) {
  const { getProductKnowledge } = await import('./fleetNimbleKnowledgeBase.js');
  const lowerMessage = message.toLowerCase();

  const knowledgeMap = [
    { keywords: ['connect obd', 'obd device', 'how to connect obd'], topic: 'obdConnection', format: (info) => info.steps },
    { keywords: ['rpm not updating', 'rpm not working'], topic: 'troubleshooting', format: (info) => info.rpmNotUpdating },
    { keywords: ['gps not showing', 'gps not working', 'location not showing'], topic: 'troubleshooting', format: (info) => info.gpsNotShowing },
    { keywords: ['vin decode failed', 'vin not decoding'], topic: 'troubleshooting', format: (info) => info.vinDecodeFailed },
    { keywords: ['vehicle offline', 'why vehicle offline'], topic: 'troubleshooting', format: (info) => info.vehicleOffline },
    { keywords: ['add vehicle', 'how to add vehicle', 'create vehicle'], topic: 'addVehicle', format: (info) => info.steps },
    { keywords: ['create work order', 'how to create work order', 'add work order'], topic: 'workOrders', format: (info) => info.overview },
    { keywords: ['generate report', 'how to generate report', 'create report'], topic: 'reports', format: (info) => info.overview },
    { keywords: ['schedule maintenance', 'how to schedule maintenance'], topic: 'maintenance', format: (info) => info.overview },
    { keywords: ['live data', 'where can i see', 'live diagnostics', 'live speed', 'live rpm'], topic: 'liveDiagnostics', format: (info) => info.overview },
  ];

  for (const mapping of knowledgeMap) {
    if (mapping.keywords.some(k => lowerMessage.includes(k))) {
      const info = getProductKnowledge(mapping.topic);
      if (info) {
        return {
          response: mapping.format(info),
          metadata: { confidence: 'HIGH', dataFreshness: 'STATIC', simulatedNote: null, suggestedActions: ['Show vehicle details', 'Show live diagnostics', 'View dashboard'] },
        };
      }
    }
  }

  if (lowerMessage.includes('fleetnimble') || lowerMessage.includes('what is fleetnimble')) {
    const dashboard = getProductKnowledge('dashboard');
    return {
      response: dashboard?.overview || 'FleetNimble is your fleet management platform.',
      metadata: { confidence: 'HIGH', dataFreshness: 'STATIC', simulatedNote: null, suggestedActions: ['Summarize my fleet health', 'Show vehicle details', 'Show critical alerts'] },
    };
  }

  if (lowerMessage.includes('where') && (lowerMessage.includes('speed') || lowerMessage.includes('rpm') || lowerMessage.includes('diagnostic'))) {
    const liveDiag = getProductKnowledge('liveDiagnostics');
    if (liveDiag) {
      return {
        response: liveDiag.overview,
        metadata: { confidence: 'HIGH', dataFreshness: 'STATIC', simulatedNote: null, suggestedActions: ['Open Live Diagnostics', 'Check OBD connection', 'Show vehicle details'] },
      };
    }
  }

  return {
    response: `**FleetNimble Support**\n\nI can help you with:\n\n**Vehicle Management:**\n- Adding vehicles\n- Connecting OBD devices\n- VIN decoding\n- Vehicle details\n\n**Monitoring:**\n- Live diagnostics\n- GPS tracking\n- Alerts\n- Maintenance\n\n**Reports & Work Orders:**\n- Generating reports\n- Creating work orders\n- Scheduling maintenance\n\n**Troubleshooting:**\n- RPM not updating\n- GPS not showing\n- Vehicle offline\n- VIN decode failed\n\n**Recommended Action:** Ask a specific question about any feature`,
    metadata: { confidence: 'HIGH', dataFreshness: 'STATIC', simulatedNote: null, suggestedActions: ['Summarize my fleet health', 'Show vehicle details', 'Show critical alerts'] },
  };
}

async function getHistoryFallback(userId, message, entities, userVehicles) {
  const lowerMessage = message.toLowerCase();
  let vehicle = entities.vehicles[0];

  if (!vehicle) {
    const vehicleName = extractVehicleName(message, userVehicles);
    if (vehicleName) {
      vehicle = await prisma.vehicle.findFirst({
        where: { userId, deletedAt: null, vehicleName: { contains: vehicleName, mode: 'insensitive' } },
        select: { id: true, vehicleName: true, registrationNumber: true },
      });
    }
  }

  if (!vehicle) {
    return {
      response: 'To view historical data, please specify which vehicle.',
      metadata: { confidence: 'LOW', dataFreshness: 'UNKNOWN', simulatedNote: null, suggestedActions: ['Show all vehicles', 'Summarize my fleet health'] },
    };
  }

  let historyType = 'general';
  if (lowerMessage.includes('telemetry')) historyType = 'telemetry';
  else if (lowerMessage.includes('maintenance')) historyType = 'maintenance';
  else if (lowerMessage.includes('alert')) historyType = 'alert';
  else if (lowerMessage.includes('gps') || lowerMessage.includes('location')) historyType = 'gps';
  else if (lowerMessage.includes('dtc') || lowerMessage.includes('diagnostic')) historyType = 'dtc';
  else if (lowerMessage.includes('fuel')) historyType = 'fuel';

  const response = `**Historical Data: ${getVehicleDisplayName(vehicle)}**\n\n**Plate:** ${getVehiclePlate(vehicle)}\n**History Type:** ${historyType}\n\nTo view detailed historical data, use the dashboard:\n1. Go to Vehicles > select vehicle\n2. Click "History" tab\n3. Select the data type\n4. Choose date range\n\n**Available History Types:**\n- Telemetry history (RPM, speed, temperature)\n- Maintenance history (service records)\n- Alert history (notifications)\n- GPS history (location tracking)\n- DTC history (diagnostic codes)\n- Fuel history (consumption data)`;

  return { response, metadata: { confidence: 'HIGH', dataFreshness: 'HISTORICAL', simulatedNote: null, suggestedActions: ['Show vehicle details', 'Show live data', 'Show maintenance history'] } };
}

async function getLiveDataFallback(userId, entities, userVehicles) {
  let vehicle = entities.vehicles[0];

  if (!vehicle) {
    const vehicleName = extractVehicleName(entities.message || '', userVehicles);
    if (vehicleName) {
      vehicle = await prisma.vehicle.findFirst({
        where: { userId, deletedAt: null, vehicleName: { contains: vehicleName, mode: 'insensitive' } },
        select: { id: true, vehicleName: true, registrationNumber: true },
      });
    }
  }

  if (!vehicle) {
    return {
      response: 'To view live data, please specify which vehicle.',
      metadata: { confidence: 'LOW', dataFreshness: 'UNKNOWN', simulatedNote: null, suggestedActions: ['Show all vehicles', 'Show vehicle details'] },
    };
  }

  const latestTelemetry = await prisma.telemetry.findFirst({
    where: { vehicleId: vehicle.id },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true, batteryVoltage: true, coolantTemp: true, fuelLevel: true, rpm: true, speed: true, throttlePosition: true, intakeTemp: true, maf: true },
  });

  if (!latestTelemetry) {
    return {
      response: `Live telemetry not available for ${getVehicleDisplayName(vehicle)}. Vehicle may be offline.`,
      metadata: { confidence: 'LOW', dataFreshness: 'UNKNOWN', simulatedNote: null, suggestedActions: ['Show vehicle details', 'Show offline vehicles'] },
    };
  }

  const response = `**Live Telemetry: ${getVehicleDisplayName(vehicle)}**\n\n**Plate:** ${getVehiclePlate(vehicle)}\n**Last Updated:** ${formatLastSeen(latestTelemetry.timestamp)}\n\n**Engine Parameters:**\n- RPM: ${latestTelemetry.rpm || 'N/A'}\n- Speed: ${latestTelemetry.speed || 'N/A'} km/h\n- Throttle: ${latestTelemetry.throttlePosition || 'N/A'}%\n- Intake Temp: ${latestTelemetry.intakeTemp || 'N/A'}°C\n- MAF: ${latestTelemetry.maf || 'N/A'} g/s\n\n**System Status:**\n- Battery: ${latestTelemetry.batteryVoltage || 'N/A'}V\n- Coolant: ${latestTelemetry.coolantTemp || 'N/A'}°C\n- Fuel: ${latestTelemetry.fuelLevel || 'N/A'}%\n\n**Recommended Action:** ${latestTelemetry.batteryVoltage && latestTelemetry.batteryVoltage < 12 ? 'Check battery - voltage low' : 'All parameters within normal range'}`;

  return { response, metadata: { confidence: 'HIGH', dataFreshness: 'LIVE', simulatedNote: null, suggestedActions: ['Show vehicle details', 'Show historical data', 'Show vehicle location'] } };
}

function extractVehicleName(message, userVehicles) {
  if (!message) return null;
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

function extractMultipleVehicleNames(message, userVehicles) {
  if (!message) return [];
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
