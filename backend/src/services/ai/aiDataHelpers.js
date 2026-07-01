/**
 * FleetNimble AI Data Helpers
 * Safe helper functions for data access with correct Prisma field names
 * All functions return useful data or friendly empty responses
 * Never throw directly to controller
 */

import prisma from '../../utils/prisma.js';
import logger from '../../utils/logger.js';

/**
 * Find vehicle by text with fuzzy search
 * Searches vehicleName, registrationNumber, vin, make, model
 */
export async function findVehicleByText(userId, text) {
  try {
    if (!text || typeof text !== 'string') {
      return null;
    }

    const lowerText = text.toLowerCase();
    const words = lowerText.split(/\s+/).filter(w => w.length > 2);

    if (words.length === 0) return null;

    // Try exact phrase match first
    let vehicle = await prisma.vehicle.findFirst({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { vehicleName: { contains: text, mode: 'insensitive' } },
          { registrationNumber: { contains: text, mode: 'insensitive' } },
          { vin: { contains: text, mode: 'insensitive' } },
        ]
      },
    });

    if (vehicle) return vehicle;

    // Try make/model combination
    if (words.length >= 2) {
      const makeWord = words[0];
      const modelWord = words.slice(1).join(' ');

      vehicle = await prisma.vehicle.findFirst({
        where: {
          userId,
          deletedAt: null,
          OR: [
            { make: { contains: makeWord, mode: 'insensitive' }, model: { contains: modelWord, mode: 'insensitive' } },
            { vehicleName: { contains: makeWord, mode: 'insensitive' } },
            { vehicleName: { contains: modelWord, mode: 'insensitive' } },
          ]
        },
      });

      if (vehicle) return vehicle;
    }

    // Try each word individually
    for (const word of words) {
      vehicle = await prisma.vehicle.findFirst({
        where: {
          userId,
          deletedAt: null,
          OR: [
            { vehicleName: { contains: word, mode: 'insensitive' } },
            { registrationNumber: { contains: word, mode: 'insensitive' } },
            { vin: { contains: word, mode: 'insensitive' } },
            { make: { contains: word, mode: 'insensitive' } },
            { model: { contains: word, mode: 'insensitive' } },
          ]
        },
      });

      if (vehicle) return vehicle;
    }

    return null;
  } catch (error) {
    logger.error('FIND_VEHICLE_BY_TEXT_ERROR', { userId, text, error: error.message });
    return null;
  }
}

/**
 * Get fleet summary with correct field names
 */
export async function getFleetSummary(userId) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        vehicleName: true,
        registrationNumber: true,
        status: true,
        telemetryOnline: true,
        lastTelemetryAt: true,
        _count: {
          select: { alerts: true, dtcCodes: true, maintenanceLogs: true },
        },
      },
      take: 50,
    });

    if (vehicles.length === 0) {
      return {
        hasVehicles: false,
        vehicleCount: 0,
        onlineCount: 0,
        offlineCount: 0,
        totalAlerts: 0,
        totalDTCs: 0,
        maintenanceDue: 0,
        vehicles: [],
      };
    }

    const onlineCount = vehicles.filter(v => v.telemetryOnline).length;
    const offlineCount = vehicles.length - onlineCount;
    const totalAlerts = vehicles.reduce((sum, v) => sum + v._count.alerts, 0);
    const totalDTCs = vehicles.reduce((sum, v) => sum + v._count.dtcCodes, 0);
    const maintenanceDue = vehicles.reduce((sum, v) => sum + v._count.maintenanceLogs, 0);

    return {
      hasVehicles: true,
      vehicleCount: vehicles.length,
      onlineCount,
      offlineCount,
      totalAlerts,
      totalDTCs,
      maintenanceDue,
      vehicles: vehicles.map(v => ({
        id: v.id,
        name: v.vehicleName,
        plate: v.registrationNumber,
        status: v.status,
        online: v.telemetryOnline,
        lastSeen: v.lastTelemetryAt,
      })),
    };
  } catch (error) {
    logger.error('GET_FLEET_SUMMARY_ERROR', { userId, error: error.message });
    return {
      hasVehicles: false,
      vehicleCount: 0,
      onlineCount: 0,
      offlineCount: 0,
      totalAlerts: 0,
      totalDTCs: 0,
      maintenanceDue: 0,
      vehicles: [],
    };
  }
}

/**
 * Get vehicle details with correct field names
 */
export async function getVehicleDetails(userId, vehicleId) {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, userId, deletedAt: null },
      select: {
        id: true,
        vehicleName: true,
        registrationNumber: true,
        vin: true,
        make: true,
        model: true,
        year: true,
        status: true,
        telemetryOnline: true,
        lastTelemetryAt: true,
        engineState: true,
        ignitionStatus: true,
        gpsLastLatitude: true,
        gpsLastLongitude: true,
        gpsLastAt: true,
        batteryProtectionMode: true,
        lastEngineOffAt: true,
        lastEngineOnAt: true,
        lastStandbyAt: true,
      },
    });

    if (!vehicle) {
      return {
        found: false,
        message: 'Vehicle not found',
      };
    }

    return {
      found: true,
      vehicle: {
        id: vehicle.id,
        name: vehicle.vehicleName,
        plate: vehicle.registrationNumber,
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        status: vehicle.status,
        online: vehicle.telemetryOnline,
        lastSeen: vehicle.lastTelemetryAt,
        engineState: vehicle.engineState,
        ignitionStatus: vehicle.ignitionStatus,
        gps: {
          latitude: vehicle.gpsLastLatitude,
          longitude: vehicle.gpsLastLongitude,
          lastAt: vehicle.gpsLastAt,
        },
        batteryProtectionMode: vehicle.batteryProtectionMode,
        lastEngineOffAt: vehicle.lastEngineOffAt,
        lastEngineOnAt: vehicle.lastEngineOnAt,
        lastStandbyAt: vehicle.lastStandbyAt,
      },
    };
  } catch (error) {
    logger.error('GET_VEHICLE_DETAILS_ERROR', { userId, vehicleId, error: error.message });
    return {
      found: false,
      message: 'Error fetching vehicle details',
    };
  }
}

/**
 * Get vehicle history with date filters
 */
export async function getVehicleHistory(userId, vehicleId, dateFilter = 'last_7_days') {
  try {
    const now = new Date();
    let startDate;

    switch (dateFilter) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'yesterday':
        startDate = new Date(now.setDate(now.getDate() - 1));
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'last_7_days':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'last_30_days':
        startDate = new Date(now.setDate(now.getDate() - 30));
        break;
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = new Date(now.setDate(now.getDate() - 7));
    }

    const [telemetry, alerts, maintenance, dtcCodes] = await Promise.all([
      prisma.telemetry.findMany({
        where: {
          vehicleId,
          timestamp: { gte: startDate },
        },
        orderBy: { timestamp: 'desc' },
        take: 100,
      }),
      prisma.alert.findMany({
        where: {
          vehicleId,
          createdAt: { gte: startDate },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.maintenanceLog.findMany({
        where: {
          vehicleId,
          createdAt: { gte: startDate },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.dtcCode.findMany({
        where: {
          vehicleId,
          detectedAt: { gte: startDate },
        },
        orderBy: { detectedAt: 'desc' },
        take: 50,
      }),
    ]);

    return {
      period: dateFilter,
      startDate,
      endDate: new Date(),
      telemetryCount: telemetry.length,
      alertCount: alerts.length,
      maintenanceCount: maintenance.length,
      dtcCount: dtcCodes.length,
      data: {
        telemetry: telemetry.slice(0, 10),
        alerts: alerts.slice(0, 10),
        maintenance: maintenance.slice(0, 10),
        dtcCodes: dtcCodes.slice(0, 10),
      },
    };
  } catch (error) {
    logger.error('GET_VEHICLE_HISTORY_ERROR', { userId, vehicleId, dateFilter, error: error.message });
    return {
      period: dateFilter,
      error: 'Error fetching vehicle history',
      data: null,
    };
  }
}

/**
 * Get telemetry history with date filter
 */
export async function getTelemetryHistory(userId, vehicleId, dateFilter = 'last_7_days') {
  try {
    const now = new Date();
    let startDate;

    switch (dateFilter) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'yesterday':
        startDate = new Date(now.setDate(now.getDate() - 1));
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'last_7_days':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'last_30_days':
        startDate = new Date(now.setDate(now.getDate() - 30));
        break;
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = new Date(now.setDate(now.getDate() - 7));
    }

    const telemetry = await prisma.telemetry.findMany({
      where: {
        vehicleId,
        timestamp: { gte: startDate },
      },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    return {
      period: dateFilter,
      count: telemetry.length,
      data: telemetry.slice(0, 20),
    };
  } catch (error) {
    logger.error('GET_TELEMETRY_HISTORY_ERROR', { userId, vehicleId, dateFilter, error: error.message });
    return {
      period: dateFilter,
      count: 0,
      data: [],
    };
  }
}

/**
 * Get alert history with date filter
 */
export async function getAlertHistory(userId, vehicleId, dateFilter = 'last_7_days') {
  try {
    const now = new Date();
    let startDate;

    switch (dateFilter) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'yesterday':
        startDate = new Date(now.setDate(now.getDate() - 1));
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'last_7_days':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'last_30_days':
        startDate = new Date(now.setDate(now.getDate() - 30));
        break;
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = new Date(now.setDate(now.getDate() - 7));
    }

    const alerts = await prisma.alert.findMany({
      where: {
        vehicleId,
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      period: dateFilter,
      count: alerts.length,
      data: alerts,
    };
  } catch (error) {
    logger.error('GET_ALERT_HISTORY_ERROR', { userId, vehicleId, dateFilter, error: error.message });
    return {
      period: dateFilter,
      count: 0,
      data: [],
    };
  }
}

/**
 * Get maintenance history with date filter
 */
export async function getMaintenanceHistory(userId, vehicleId, dateFilter = 'last_7_days') {
  try {
    const now = new Date();
    let startDate;

    switch (dateFilter) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'yesterday':
        startDate = new Date(now.setDate(now.getDate() - 1));
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'last_7_days':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'last_30_days':
        startDate = new Date(now.setDate(now.getDate() - 30));
        break;
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = new Date(now.setDate(now.getDate() - 7));
    }

    const maintenance = await prisma.maintenanceLog.findMany({
      where: {
        vehicleId,
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      period: dateFilter,
      count: maintenance.length,
      data: maintenance,
    };
  } catch (error) {
    logger.error('GET_MAINTENANCE_HISTORY_ERROR', { userId, vehicleId, dateFilter, error: error.message });
    return {
      period: dateFilter,
      count: 0,
      data: [],
    };
  }
}

/**
 * Get DTC history with date filter
 */
export async function getDtcHistory(userId, vehicleId, dateFilter = 'last_7_days') {
  try {
    const now = new Date();
    let startDate;

    switch (dateFilter) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'yesterday':
        startDate = new Date(now.setDate(now.getDate() - 1));
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'last_7_days':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'last_30_days':
        startDate = new Date(now.setDate(now.getDate() - 30));
        break;
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = new Date(now.setDate(now.getDate() - 7));
    }

    const dtcCodes = await prisma.dtcCode.findMany({
      where: {
        vehicleId,
        detectedAt: { gte: startDate },
      },
      orderBy: { detectedAt: 'desc' },
      take: 50,
    });

    return {
      period: dateFilter,
      count: dtcCodes.length,
      data: dtcCodes,
    };
  } catch (error) {
    logger.error('GET_DTC_HISTORY_ERROR', { userId, vehicleId, dateFilter, error: error.message });
    return {
      period: dateFilter,
      count: 0,
      data: [],
    };
  }
}

/**
 * Get fuel history with date filter
 */
export async function getFuelHistory(userId, vehicleId, dateFilter = 'last_7_days') {
  try {
    const now = new Date();
    let startDate;

    switch (dateFilter) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'yesterday':
        startDate = new Date(now.setDate(now.getDate() - 1));
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'last_7_days':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'last_30_days':
        startDate = new Date(now.setDate(now.getDate() - 30));
        break;
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = new Date(now.setDate(now.getDate() - 7));
    }

    const fuelHistory = await prisma.fuelHistory.findMany({
      where: {
        vehicleId,
        timestamp: { gte: startDate },
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    return {
      period: dateFilter,
      count: fuelHistory.length,
      data: fuelHistory,
    };
  } catch (error) {
    logger.error('GET_FUEL_HISTORY_ERROR', { userId, vehicleId, dateFilter, error: error.message });
    return {
      period: dateFilter,
      count: 0,
      data: [],
    };
  }
}

/**
 * Get GPS history with date filter
 */
export async function getGpsHistory(userId, vehicleId, dateFilter = 'last_7_days') {
  try {
    const now = new Date();
    let startDate;

    switch (dateFilter) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'yesterday':
        startDate = new Date(now.setDate(now.getDate() - 1));
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'last_7_days':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'last_30_days':
        startDate = new Date(now.setDate(now.getDate() - 30));
        break;
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = new Date(now.setDate(now.getDate() - 7));
    }

    const gpsLocations = await prisma.gpsLocation.findMany({
      where: {
        vehicleId,
        recordedAt: { gte: startDate },
      },
      orderBy: { recordedAt: 'desc' },
      take: 100,
    });

    return {
      period: dateFilter,
      count: gpsLocations.length,
      data: gpsLocations,
    };
  } catch (error) {
    logger.error('GET_GPS_HISTORY_ERROR', { userId, vehicleId, dateFilter, error: error.message });
    return {
      period: dateFilter,
      count: 0,
      data: [],
    };
  }
}

/**
 * Get enhanced battery history with analysis
 */
export async function getBatteryHistoryAnalysis(userId, vehicleId) {
  try {
    const telemetryRecords = await prisma.telemetry.findMany({
      where: { vehicleId },
      orderBy: { timestamp: 'desc' },
      take: 100,
      select: {
        timestamp: true,
        batteryVoltage: true,
      },
    });

    if (telemetryRecords.length === 0) {
      return {
        latest: null,
        average: null,
        lowest: null,
        trend: 'No data available',
        lastUpdate: null,
        recommendation: 'Connect OBD device to start monitoring battery voltage',
      };
    }

    const voltages = telemetryRecords
      .map(r => r.batteryVoltage)
      .filter(v => v !== null && v !== undefined);

    const latest = voltages[0];
    const average = voltages.reduce((sum, v) => sum + v, 0) / voltages.length;
    const lowest = Math.min(...voltages);

    // Determine trend
    const recent = voltages.slice(0, 10);
    const older = voltages.slice(10, 20);
    const recentAvg = recent.reduce((sum, v) => sum + v, 0) / recent.length;
    const olderAvg = older.length > 0 ? older.reduce((sum, v) => sum + v, 0) / older.length : recentAvg;
    let trend = 'Stable';
    if (recentAvg < olderAvg - 0.5) trend = 'Declining';
    if (recentAvg > olderAvg + 0.5) trend = 'Improving';

    const lastUpdate = telemetryRecords[0].timestamp;

    // Recommendation
    let recommendation = 'Battery voltage is normal';
    if (latest < 11) recommendation = 'CRITICAL: Battery voltage critically low. Replace battery immediately.';
    else if (latest < 12) recommendation = 'WARNING: Battery voltage low. Check alternator and battery health.';
    else if (latest < 12.5) recommendation = 'Monitor battery voltage closely.';
    else if (trend === 'Declining') recommendation = 'Battery voltage is declining. Check charging system.';

    return {
      latest: latest?.toFixed(2),
      average: average?.toFixed(2),
      lowest: lowest?.toFixed(2),
      trend,
      lastUpdate,
      recommendation,
    };
  } catch (error) {
    logger.error('GET_BATTERY_HISTORY_ANALYSIS_ERROR', { userId, vehicleId, error: error.message });
    return {
      latest: null,
      average: null,
      lowest: null,
      trend: 'Error',
      lastUpdate: null,
      recommendation: 'Unable to analyze battery history',
    };
  }
}

/**
 * Get enhanced fuel history with analysis
 */
export async function getFuelHistoryAnalysis(userId, vehicleId) {
  try {
    const telemetryRecords = await prisma.telemetry.findMany({
      where: { vehicleId },
      orderBy: { timestamp: 'desc' },
      take: 100,
      select: {
        timestamp: true,
        fuelLevel: true,
      },
    });

    if (telemetryRecords.length === 0) {
      return {
        latest: null,
        average: null,
        lowest: null,
        trend: 'No data available',
        lastUpdate: null,
        recommendation: 'Connect OBD device to start monitoring fuel level',
      };
    }

    const fuelLevels = telemetryRecords
      .map(r => r.fuelLevel)
      .filter(f => f !== null && f !== undefined);

    const latest = fuelLevels[0];
    const average = fuelLevels.reduce((sum, f) => sum + f, 0) / fuelLevels.length;
    const lowest = Math.min(...fuelLevels);

    // Determine trend
    const recent = fuelLevels.slice(0, 10);
    const older = fuelLevels.slice(10, 20);
    const recentAvg = recent.reduce((sum, f) => sum + f, 0) / recent.length;
    const olderAvg = older.length > 0 ? older.reduce((sum, f) => sum + f, 0) / older.length : recentAvg;
    let trend = 'Stable';
    if (recentAvg < olderAvg - 5) trend = 'Consuming';
    if (recentAvg > olderAvg + 5) trend = 'Refueled';

    const lastUpdate = telemetryRecords[0].timestamp;

    // Recommendation
    let recommendation = 'Fuel level is normal';
    if (latest < 10) recommendation = 'CRITICAL: Fuel level critically low. Refuel immediately.';
    else if (latest < 20) recommendation = 'WARNING: Fuel level low. Plan to refuel soon.';
    else if (latest < 30) recommendation = 'Monitor fuel level. Consider refueling if planning long trip.';

    return {
      latest: latest?.toFixed(1),
      average: average?.toFixed(1),
      lowest: lowest?.toFixed(1),
      trend,
      lastUpdate,
      recommendation,
    };
  } catch (error) {
    logger.error('GET_FUEL_HISTORY_ANALYSIS_ERROR', { userId, vehicleId, error: error.message });
    return {
      latest: null,
      average: null,
      lowest: null,
      trend: 'Error',
      lastUpdate: null,
      recommendation: 'Unable to analyze fuel history',
    };
  }
}

/**
 * Get enhanced coolant history with analysis
 */
export async function getCoolantHistoryAnalysis(userId, vehicleId) {
  try {
    const telemetryRecords = await prisma.telemetry.findMany({
      where: { vehicleId },
      orderBy: { timestamp: 'desc' },
      take: 100,
      select: {
        timestamp: true,
        coolantTemp: true,
      },
    });

    if (telemetryRecords.length === 0) {
      return {
        latest: null,
        average: null,
        highest: null,
        trend: 'No data available',
        lastUpdate: null,
        recommendation: 'Connect OBD device to start monitoring coolant temperature',
      };
    }

    const temps = telemetryRecords
      .map(r => r.coolantTemp)
      .filter(t => t !== null && t !== undefined);

    const latest = temps[0];
    const average = temps.reduce((sum, t) => sum + t, 0) / temps.length;
    const highest = Math.max(...temps);

    // Determine trend
    const recent = temps.slice(0, 10);
    const older = temps.slice(10, 20);
    const recentAvg = recent.reduce((sum, t) => sum + t, 0) / recent.length;
    const olderAvg = older.length > 0 ? older.reduce((sum, t) => sum + t, 0) / older.length : recentAvg;
    let trend = 'Stable';
    if (recentAvg > olderAvg + 5) trend = 'Rising';
    if (recentAvg < olderAvg - 5) trend = 'Cooling';

    const lastUpdate = telemetryRecords[0].timestamp;

    // Recommendation
    let recommendation = 'Coolant temperature is normal';
    if (latest > 105) recommendation = 'CRITICAL: Engine overheating. Stop vehicle immediately and check cooling system.';
    else if (latest > 100) recommendation = 'WARNING: Coolant temperature high. Check radiator and coolant level.';
    else if (latest > 95) recommendation = 'Monitor coolant temperature closely.';
    else if (latest < 60) recommendation = 'Coolant temperature low. Engine may not be at optimal operating temperature.';

    return {
      latest: latest?.toFixed(1),
      average: average?.toFixed(1),
      highest: highest?.toFixed(1),
      trend,
      lastUpdate,
      recommendation,
    };
  } catch (error) {
    logger.error('GET_COOLANT_HISTORY_ANALYSIS_ERROR', { userId, vehicleId, error: error.message });
    return {
      latest: null,
      average: null,
      highest: null,
      trend: 'Error',
      lastUpdate: null,
      recommendation: 'Unable to analyze coolant history',
    };
  }
}

export default {
  findVehicleByText,
  getFleetSummary,
  getVehicleDetails,
  getVehicleHistory,
  getTelemetryHistory,
  getAlertHistory,
  getMaintenanceHistory,
  getDtcHistory,
  getFuelHistory,
  getGpsHistory,
  getBatteryHistoryAnalysis,
  getFuelHistoryAnalysis,
  getCoolantHistoryAnalysis,
};
