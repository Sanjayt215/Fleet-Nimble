/**
 * AI Natural Language Query Service
 * Safe predefined Prisma query builders for natural language questions
 * - Show Tata vehicles with battery below 12V
 * - Which vehicle has highest fuel usage?
 * - Vehicles offline for more than 3 days
 * - Cars with coolant high and maintenance due
 * - Which vehicle should I repair first?
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

/**
 * Extract entities from natural language query
 */
export async function extractEntities(message, userId) {
  try {
    const entities = {
      vehicles: [],
      make: null,
      model: null,
      plate: null,
      vin: null,
      batteryThreshold: null,
      coolantThreshold: null,
      fuelThreshold: null,
      offlineDays: null,
      maintenanceDue: false,
      dtcCode: null,
      alertType: null,
      reportType: null,
      days: null,
      actionType: null,
      details: null,
    };

    const lowerMessage = message.toLowerCase();

    // Extract vehicle make
    const makes = ['tata', 'honda', 'toyota', 'ford', 'mazda', 'bmw', 'mercedes', 'audi', 'volkswagen', 'hyundai', 'kia', 'nissan', 'chevrolet', 'suzuki', 'maruti'];
    for (const make of makes) {
      if (lowerMessage.includes(make)) {
        entities.make = make.charAt(0).toUpperCase() + make.slice(1);
        break;
      }
    }

    // Extract vehicle model
    const models = ['amaze', 'camry', 'corolla', 'f-150', '3', 'civic', 'city', 'swift', 'baleno', 'alto', 'creta', 'seltos', 'brezza', 'ecosport', 'nexon'];
    for (const model of models) {
      if (lowerMessage.includes(model)) {
        entities.model = model.charAt(0).toUpperCase() + model.slice(1);
        break;
      }
    }

    // Extract battery threshold
    const batteryMatch = message.match(/battery\s*(below|under|less than|<)\s*(\d+\.?\d*)\s*v/i);
    if (batteryMatch) {
      entities.batteryThreshold = parseFloat(batteryMatch[2]);
    }

    // Extract coolant threshold
    const coolantMatch = message.match(/coolant\s*(above|over|greater than|>)\s*(\d+\.?\d*)\s*°?c/i);
    if (coolantMatch) {
      entities.coolantThreshold = parseFloat(coolantMatch[2]);
    }

    // Extract offline days
    const offlineMatch = message.match(/offline\s*(for|more than)\s*(\d+)\s*days?/i);
    if (offlineMatch) {
      entities.offlineDays = parseInt(offlineMatch[2]);
    }

    // Extract maintenance due
    if (lowerMessage.includes('maintenance') && (lowerMessage.includes('due') || lowerMessage.includes('overdue'))) {
      entities.maintenanceDue = true;
    }

    // Extract DTC code
    const dtcMatch = message.match(/[Pp]\d{4}/);
    if (dtcMatch) {
      entities.dtcCode = dtcMatch[0].toUpperCase();
    }

    // Extract report type
    const reportTypes = ['fleet', 'executive', 'board', 'cost', 'maintenance', 'driver', 'risk'];
    for (const reportType of reportTypes) {
      if (lowerMessage.includes(reportType) && lowerMessage.includes('report')) {
        entities.reportType = reportType.toUpperCase() + '_REPORT';
        break;
      }
    }

    // Extract days
    const daysMatch = message.match(/(\d+)\s*days?/i);
    if (daysMatch) {
      entities.days = parseInt(daysMatch[1]);
    }

    // Extract action type
    const actionTypes = ['work order', 'maintenance', 'alert', 'email', 'export'];
    for (const actionType of actionTypes) {
      if (lowerMessage.includes(actionType)) {
        entities.actionType = actionType.toUpperCase().replace(' ', '_');
        break;
      }
    }

    // Fetch matching vehicles
    if (entities.make || entities.model || entities.plate || entities.vin) {
      const vehicles = await prisma.vehicle.findMany({
        where: {
          userId,
          deletedAt: null,
          ...(entities.make && { make: entities.make }),
          ...(entities.model && { model: entities.model }),
          ...(entities.plate && { plateNumber: entities.plate }),
          ...(entities.vin && { vin: entities.vin }),
        },
        select: {
          id: true,
          make: true,
          model: true,
          plateNumber: true,
          vin: true,
        },
      });

      entities.vehicles = vehicles.map(v => ({
        id: v.id,
        name: `${v.make} ${v.model}`,
        plate: v.plateNumber || v.vin,
      }));
    }

    logger.info('Entities extracted', { userId, entities });

    return entities;
  } catch (error) {
    logger.error('Error extracting entities', { userId, error: error.message });
    return { vehicles: [] };
  }
}

/**
 * Execute safe predefined query based on entities
 */
export async function executeNaturalQuery(entities, userId) {
  try {
    const queryType = determineQueryType(entities);

    switch (queryType) {
      case 'BATTERY_THRESHOLD':
        return await queryBatteryThreshold(entities, userId);
      case 'COOLANT_THRESHOLD':
        return await queryCoolantThreshold(entities, userId);
      case 'OFFLINE_DAYS':
        return await queryOfflineDays(entities, userId);
      case 'MAINTENANCE_DUE':
        return await queryMaintenanceDue(entities, userId);
      case 'HIGHEST_FUEL_USAGE':
        return await queryHighestFuelUsage(userId);
      case 'REPAIR_PRIORITY':
        return await queryRepairPriority(userId);
      case 'DTC_CODE':
        return await queryDTCCode(entities, userId);
      default:
        return await queryDefault(entities, userId);
    }
  } catch (error) {
    logger.error('Error executing natural query', { userId, error: error.message });
    throw error;
  }
}

/**
 * Determine query type from entities
 */
function determineQueryType(entities) {
  if (entities.batteryThreshold !== null) return 'BATTERY_THRESHOLD';
  if (entities.coolantThreshold !== null) return 'COOLANT_THRESHOLD';
  if (entities.offlineDays !== null) return 'OFFLINE_DAYS';
  if (entities.maintenanceDue) return 'MAINTENANCE_DUE';
  if (entities.dtcCode) return 'DTC_CODE';
  if (entities.vehicles.length > 0) return 'VEHICLE_STATUS';
  return 'DEFAULT';
}

/**
 * Query vehicles with battery below threshold
 */
async function queryBatteryThreshold(entities, userId) {
  const threshold = entities.batteryThreshold;

  const vehicles = await prisma.vehicle.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(entities.make && { make: entities.make }),
      ...(entities.model && { model: entities.model }),
    },
    include: {
      liveData: { orderBy: { timestamp: 'desc' }, take: 1 },
    },
  });

  const filteredVehicles = vehicles.filter(v => {
    const latestData = v.liveData && v.liveData.length > 0 ? v.liveData[0] : null;
    return latestData && latestData.batteryVoltage && latestData.batteryVoltage < threshold;
  });

  return {
    success: true,
    queryType: 'BATTERY_THRESHOLD',
    threshold,
    vehicles: filteredVehicles.map(v => ({
      id: v.id,
      name: `${v.make} ${v.model}`,
      plate: v.plateNumber || v.vin,
      batteryVoltage: v.liveData[0]?.batteryVoltage,
    })),
    count: filteredVehicles.length,
  };
}

/**
 * Query vehicles with coolant above threshold
 */
async function queryCoolantThreshold(entities, userId) {
  const threshold = entities.coolantThreshold;

  const vehicles = await prisma.vehicle.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(entities.make && { make: entities.make }),
      ...(entities.model && { model: entities.model }),
    },
    include: {
      liveData: { orderBy: { timestamp: 'desc' }, take: 1 },
      maintenanceLogs: { where: { completed: false } },
    },
  });

  const filteredVehicles = vehicles.filter(v => {
    const latestData = v.liveData && v.liveData.length > 0 ? v.liveData[0] : null;
    const hasMaintenanceDue = v.maintenanceLogs.some(log => new Date(log.dueDate) <= new Date());
    return latestData && latestData.coolantTemp && latestData.coolantTemp > threshold && hasMaintenanceDue;
  });

  return {
    success: true,
    queryType: 'COOLANT_THRESHOLD',
    threshold,
    vehicles: filteredVehicles.map(v => ({
      id: v.id,
      name: `${v.make} ${v.model}`,
      plate: v.plateNumber || v.vin,
      coolantTemp: v.liveData[0]?.coolantTemp,
      maintenanceDue: v.maintenanceLogs.length,
    })),
    count: filteredVehicles.length,
  };
}

/**
 * Query vehicles offline for more than X days
 */
async function queryOfflineDays(entities, userId) {
  const days = entities.offlineDays;
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const vehicles = await prisma.vehicle.findMany({
    where: {
      userId,
      deletedAt: null,
      telemetryOnline: false,
      lastObdAt: { lt: cutoffDate },
    },
    select: {
      id: true,
      make: true,
      model: true,
      plateNumber: true,
      vin: true,
      lastObdAt: true,
    },
  });

  return {
    success: true,
    queryType: 'OFFLINE_DAYS',
    days,
    vehicles: vehicles.map(v => ({
      id: v.id,
      name: `${v.make} ${v.model}`,
      plate: v.plateNumber || v.vin,
      lastUpdate: v.lastObdAt,
      daysOffline: Math.floor((Date.now() - new Date(v.lastObdAt).getTime()) / (1000 * 60 * 60 * 24)),
    })),
    count: vehicles.length,
  };
}

/**
 * Query vehicles with maintenance due
 */
async function queryMaintenanceDue(entities, userId) {
  const vehicles = await prisma.vehicle.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(entities.make && { make: entities.make }),
      ...(entities.model && { model: entities.model }),
    },
    include: {
      maintenanceLogs: { where: { completed: false } },
    },
  });

  const filteredVehicles = vehicles.filter(v => v.maintenanceLogs.length > 0);

  return {
    success: true,
    queryType: 'MAINTENANCE_DUE',
    vehicles: filteredVehicles.map(v => ({
      id: v.id,
      name: `${v.make} ${v.model}`,
      plate: v.plateNumber || v.vin,
      maintenanceItems: v.maintenanceLogs.length,
      criticalItems: v.maintenanceLogs.filter(log => log.priority === 'CRITICAL').length,
    })),
    count: filteredVehicles.length,
  };
}

/**
 * Query vehicle with highest fuel usage
 */
async function queryHighestFuelUsage(userId) {
  const fuelLogs = await prisma.fuelLog.groupBy({
    by: ['vehicleId'],
    where: {
      vehicle: { userId },
      date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    _sum: {
      fuelConsumed: true,
    },
    orderBy: {
      _sum: {
        fuelConsumed: 'desc',
      },
    },
    take: 1,
  });

  if (fuelLogs.length === 0) {
    return {
      success: true,
      queryType: 'HIGHEST_FUEL_USAGE',
      vehicle: null,
      message: 'No fuel consumption data available',
    };
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: fuelLogs[0].vehicleId },
    select: {
      id: true,
      make: true,
      model: true,
      plateNumber: true,
      vin: true,
    },
  });

  return {
    success: true,
    queryType: 'HIGHEST_FUEL_USAGE',
    vehicle: {
      id: vehicle.id,
      name: `${vehicle.make} ${vehicle.model}`,
      plate: vehicle.plateNumber || vehicle.vin,
      totalFuelConsumed: fuelLogs[0]._sum.fuelConsumed,
    },
  };
}

/**
 * Query which vehicle should be repaired first
 * Returns top 3 vehicles ranked by DTC severity + critical alerts + maintenance overdue + battery/coolant/fuel risk + telemetry freshness
 */
async function queryRepairPriority(userId) {
  const vehicles = await prisma.vehicle.findMany({
    where: { userId, deletedAt: null },
    include: {
      maintenanceLogs: { where: { completed: false } },
      alerts: { where: { read: false } },
      dtcCodes: { where: { active: true } },
      liveData: { orderBy: { timestamp: 'desc' }, take: 1 },
    },
  });

  const scoredVehicles = vehicles.map(v => {
    let score = 0;
    let riskFactors = [];
    
    // Critical maintenance (highest priority)
    const criticalMaintenance = v.maintenanceLogs.filter(log => log.priority === 'CRITICAL').length;
    const highMaintenance = v.maintenanceLogs.filter(log => log.priority === 'HIGH').length;
    score += criticalMaintenance * 10;
    score += highMaintenance * 5;
    if (criticalMaintenance > 0) riskFactors.push(`${criticalMaintenance} critical maintenance items`);
    
    // Critical alerts (high priority)
    const criticalAlerts = v.alerts.filter(a => a.severity === 'CRITICAL').length;
    const highAlerts = v.alerts.filter(a => a.severity === 'HIGH').length;
    score += criticalAlerts * 8;
    score += highAlerts * 4;
    if (criticalAlerts > 0) riskFactors.push(`${criticalAlerts} critical alerts`);
    
    // Critical DTC codes (P0 codes are powertrain critical)
    const criticalDTCs = v.dtcCodes.filter(d => d.code.startsWith('P0')).length;
    const otherDTCs = v.dtcCodes.filter(d => !d.code.startsWith('P0')).length;
    score += criticalDTCs * 6;
    score += otherDTCs * 3;
    if (criticalDTCs > 0) riskFactors.push(`${criticalDTCs} critical DTC codes`);
    
    // Battery risk
    const latestData = v.liveData && v.liveData.length > 0 ? v.liveData[0] : null;
    if (latestData && latestData.batteryVoltage) {
      if (latestData.batteryVoltage < 11) {
        score += 10;
        riskFactors.push('Critical battery voltage');
      } else if (latestData.batteryVoltage < 12) {
        score += 7;
        riskFactors.push('Low battery voltage');
      }
    }
    
    // Coolant risk
    if (latestData && latestData.coolantTemp) {
      if (latestData.coolantTemp > 105) {
        score += 10;
        riskFactors.push('Critical coolant temperature');
      } else if (latestData.coolantTemp > 100) {
        score += 7;
        riskFactors.push('High coolant temperature');
      }
    }
    
    // Fuel risk
    if (latestData && latestData.fuelLevel) {
      if (latestData.fuelLevel < 10) {
        score += 5;
        riskFactors.push('Critical fuel level');
      } else if (latestData.fuelLevel < 20) {
        score += 3;
        riskFactors.push('Low fuel level');
      }
    }
    
    // Telemetry freshness (penalty for stale data)
    const lastUpdate = latestData?.timestamp;
    if (lastUpdate) {
      const hoursSinceUpdate = (Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60);
      if (hoursSinceUpdate > 24) {
        score -= 5; // Reduce score for stale data
        riskFactors.push('Stale telemetry data');
      } else if (hoursSinceUpdate > 12) {
        score -= 2;
      }
    } else {
      score -= 10; // Heavy penalty for no data
      riskFactors.push('No telemetry data');
    }

    return {
      vehicle: v,
      score,
      riskFactors,
    };
  });

  scoredVehicles.sort((a, b) => b.score - a.score);

  const topVehicles = scoredVehicles.slice(0, 3);

  if (topVehicles.length === 0 || topVehicles[0].score === 0) {
    return {
      success: true,
      queryType: 'REPAIR_PRIORITY',
      vehicles: [],
      message: 'No vehicles require immediate repair',
    };
  }

  return {
    success: true,
    queryType: 'REPAIR_PRIORITY',
    vehicles: topVehicles.map((item, index) => ({
      rank: index + 1,
      id: item.vehicle.id,
      name: `${item.vehicle.make} ${item.vehicle.model}`,
      plate: item.vehicle.plateNumber || item.vehicle.vin,
      priorityScore: item.score,
      riskFactors: item.riskFactors,
      criticalMaintenance: item.vehicle.maintenanceLogs.filter(log => log.priority === 'CRITICAL').length,
      criticalAlerts: item.vehicle.alerts.filter(a => a.severity === 'CRITICAL').length,
      criticalDTCs: item.vehicle.dtcCodes.filter(d => d.code.startsWith('P0')).length,
      batteryVoltage: item.vehicle.liveData[0]?.batteryVoltage,
      coolantTemp: item.vehicle.liveData[0]?.coolantTemp,
      fuelLevel: item.vehicle.liveData[0]?.fuelLevel,
    })),
    count: topVehicles.length,
  };
}

/**
 * Query vehicles with specific DTC code
 */
async function queryDTCCode(entities, userId) {
  const dtcCode = entities.dtcCode;

  const vehicles = await prisma.vehicle.findMany({
    where: {
      userId,
      deletedAt: null,
      dtcCodes: {
        some: {
          code: dtcCode,
          active: true,
        },
      },
    },
    include: {
      dtcCodes: { where: { code: dtcCode, active: true } },
    },
  });

  return {
    success: true,
    queryType: 'DTC_CODE',
    dtcCode,
    vehicles: vehicles.map(v => ({
      id: v.id,
      name: `${v.make} ${v.model}`,
      plate: v.plateNumber || v.vin,
      dtcInfo: v.dtcCodes[0],
    })),
    count: vehicles.length,
  };
}

/**
 * Default query - return vehicle status
 */
async function queryDefault(entities, userId) {
  if (entities.vehicles.length > 0) {
    const vehicleIds = entities.vehicles.map(v => v.id);
    const vehicles = await prisma.vehicle.findMany({
      where: {
        id: { in: vehicleIds },
        deletedAt: null,
      },
      include: {
        liveData: { orderBy: { timestamp: 'desc' }, take: 1 },
        maintenanceLogs: { where: { completed: false } },
        alerts: { where: { read: false } },
      },
    });

    return {
      success: true,
      queryType: 'VEHICLE_STATUS',
      vehicles: vehicles.map(v => ({
        id: v.id,
        name: `${v.make} ${v.model}`,
        plate: v.plateNumber || v.vin,
        status: v.telemetryOnline ? 'Online' : 'Offline',
        batteryVoltage: v.liveData[0]?.batteryVoltage,
        maintenanceDue: v.maintenanceLogs.length,
        alerts: v.alerts.length,
      })),
      count: vehicles.length,
    };
  }

  // Return all vehicles if no specific entities
  const vehicles = await prisma.vehicle.findMany({
    where: { userId, deletedAt: null },
    select: {
      id: true,
      make: true,
      model: true,
      plateNumber: true,
      vin: true,
      telemetryOnline: true,
    },
  });

  return {
    success: true,
    queryType: 'ALL_VEHICLES',
    vehicles: vehicles.map(v => ({
      id: v.id,
      name: `${v.make} ${v.model}`,
      plate: v.plateNumber || v.vin,
      status: v.telemetryOnline ? 'Online' : 'Offline',
    })),
    count: vehicles.length,
  };
}
