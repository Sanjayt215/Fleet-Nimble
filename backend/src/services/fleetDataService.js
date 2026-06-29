/**
 * Fleet Data Service
 * Reusable services for accessing fleet data with user isolation
 * All functions ensure data access is restricted to the logged-in user
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

/**
 * Get fleet summary for a user
 */
export async function getFleetSummary(userId) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      include: {
        liveState: true,
        alerts: { where: { read: false } },
        dtcCodes: { where: { active: true } },
        maintenanceLogs: { where: { completed: false } },
      },
    });

    const totalVehicles = vehicles.length;
    const onlineVehicles = vehicles.filter(v => v.telemetryOnline).length;
    const offlineVehicles = totalVehicles - onlineVehicles;
    const standbyVehicles = vehicles.filter(v => v.liveState?.vehicleStatus === 'STANDBY').length;
    const criticalAlerts = vehicles.reduce((sum, v) => sum + v.alerts.filter(a => a.severity === 'CRITICAL').length, 0);
    const maintenanceDue = vehicles.reduce((sum, v) => sum + v.maintenanceLogs.length, 0);
    const activeDTCs = vehicles.reduce((sum, v) => sum + v.dtcCodes.length, 0);

    // Calculate fleet health score
    let healthScore = 100;
    healthScore -= offlineVehicles * 5;
    healthScore -= criticalAlerts * 10;
    healthScore -= activeDTCs * 5;
    healthScore = Math.max(0, healthScore);

    // Determine risk level
    let riskLevel = 'Good';
    if (healthScore < 50) riskLevel = 'Critical';
    else if (healthScore < 70) riskLevel = 'High';
    else if (healthScore < 85) riskLevel = 'Moderate';

    return {
      totalVehicles,
      onlineVehicles,
      offlineVehicles,
      standbyVehicles,
      criticalAlerts,
      maintenanceDue,
      activeDTCs,
      healthScore,
      riskLevel,
      lastTelemetryUpdate: vehicles.length > 0 
        ? Math.max(...vehicles.map(v => v.liveState?.lastUpdate || v.lastObdAt || 0))
        : null,
    };
  } catch (error) {
    logger.error('Error getting fleet summary', { userId, error: error.message });
    throw error;
  }
}

/**
 * Get vehicle by ID
 */
export async function getVehicle(userId, vehicleId) {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, userId, deletedAt: null },
      include: {
        liveState: true,
        gpsLocation: true,
        telematicsDevice: true,
        alerts: { where: { read: false }, orderBy: { createdAt: 'desc' }, take: 10 },
        dtcCodes: { where: { active: true }, orderBy: { detectedAt: 'desc' }, take: 10 },
        maintenanceLogs: { where: { completed: false }, orderBy: { dueDate: 'asc' }, take: 10 },
      },
    });

    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    return vehicle;
  } catch (error) {
    logger.error('Error getting vehicle', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Get vehicle by plate number
 */
export async function getVehicleByPlate(userId, plateNumber) {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { plateNumber: plateNumber.toUpperCase(), userId, deletedAt: null },
      include: {
        liveState: true,
        gpsLocation: true,
        alerts: { where: { read: false } },
        dtcCodes: { where: { active: true } },
      },
    });

    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    return vehicle;
  } catch (error) {
    logger.error('Error getting vehicle by plate', { userId, plateNumber, error: error.message });
    throw error;
  }
}

/**
 * Get vehicle by VIN
 */
export async function getVehicleByVIN(userId, vin) {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { vin: vin.toUpperCase(), userId, deletedAt: null },
      include: {
        liveState: true,
        gpsLocation: true,
        alerts: { where: { read: false } },
        dtcCodes: { where: { active: true } },
      },
    });

    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    return vehicle;
  } catch (error) {
    logger.error('Error getting vehicle by VIN', { userId, vin, error: error.message });
    throw error;
  }
}

/**
 * Get live telemetry for a vehicle
 */
export async function getLiveTelemetry(userId, vehicleId) {
  try {
    // Verify vehicle belongs to user
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, userId, deletedAt: null },
    });

    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    const telemetry = await prisma.obdLiveData.findFirst({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
    });

    return telemetry;
  } catch (error) {
    logger.error('Error getting live telemetry', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Get latest location for a vehicle
 */
export async function getLatestLocation(userId, vehicleId) {
  try {
    // Verify vehicle belongs to user
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, userId, deletedAt: null },
      include: { gpsLocation: true },
    });

    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    return vehicle.gpsLocation;
  } catch (error) {
    logger.error('Error getting latest location', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Get alerts for a user or specific vehicle
 */
export async function getAlerts(userId, vehicleId = null) {
  try {
    const where = {
      vehicle: { userId, deletedAt: null },
      read: false,
      ...(vehicleId ? { vehicleId } : {}),
    };

    const alerts = await prisma.alert.findMany({
      where,
      include: {
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            plateNumber: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return alerts;
  } catch (error) {
    logger.error('Error getting alerts', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Get maintenance for a user or specific vehicle
 */
export async function getMaintenance(userId, vehicleId = null) {
  try {
    const where = {
      vehicle: { userId, deletedAt: null },
      completed: false,
      ...(vehicleId ? { vehicleId } : {}),
    };

    const maintenance = await prisma.maintenanceLog.findMany({
      where,
      include: {
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            plateNumber: true,
          },
        },
      },
      orderBy: { dueDate: 'asc' },
      take: 50,
    });

    return maintenance;
  } catch (error) {
    logger.error('Error getting maintenance', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Get diagnostics (DTC codes) for a user or specific vehicle
 */
export async function getDiagnostics(userId, vehicleId = null) {
  try {
    const where = {
      vehicle: { userId, deletedAt: null },
      active: true,
      ...(vehicleId ? { vehicleId } : {}),
    };

    const dtcCodes = await prisma.dtcCode.findMany({
      where,
      include: {
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            plateNumber: true,
          },
        },
      },
      orderBy: { detectedAt: 'desc' },
      take: 50,
    });

    return dtcCodes;
  } catch (error) {
    logger.error('Error getting diagnostics', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Get trips for a user or specific vehicle
 */
export async function getTrips(userId, vehicleId = null, limit = 20) {
  try {
    const where = {
      vehicle: { userId, deletedAt: null },
      ...(vehicleId ? { vehicleId } : {}),
    };

    const trips = await prisma.trip.findMany({
      where,
      include: {
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            plateNumber: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
      take: limit,
    });

    return trips;
  } catch (error) {
    logger.error('Error getting trips', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Get driver behavior events for a vehicle
 */
export async function getDriverBehavior(userId, vehicleId, limit = 100) {
  try {
    // Verify vehicle belongs to user
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, userId, deletedAt: null },
    });

    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    const behaviorEvents = await prisma.behaviorEvent.findMany({
      where: { vehicleId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return behaviorEvents;
  } catch (error) {
    logger.error('Error getting driver behavior', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Get fuel history for a vehicle
 */
export async function getFuelHistory(userId, vehicleId, limit = 20) {
  try {
    // Verify vehicle belongs to user
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, userId, deletedAt: null },
    });

    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    const fuelHistory = await prisma.fuelLog.findMany({
      where: { vehicleId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return fuelHistory;
  } catch (error) {
    logger.error('Error getting fuel history', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Get all vehicles for a user
 */
export async function getAllVehicles(userId) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      include: {
        liveState: true,
        gpsLocation: true,
        alerts: { where: { read: false } },
        dtcCodes: { where: { active: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return vehicles;
  } catch (error) {
    logger.error('Error getting all vehicles', { userId, error: error.message });
    throw error;
  }
}
