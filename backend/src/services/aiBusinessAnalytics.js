/**
 * AI Business Analytics Service
 * Provides business analytics for fleet operations using real backend data
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

/**
 * Calculate Fleet Utilization
 */
export async function calculateFleetUtilization(userId, days = 30) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
    });

    if (vehicles.length === 0) {
      return { utilization: 0, vehicleCount: 0 };
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const trips = await prisma.trip.findMany({
      where: {
        vehicle: { userId, deletedAt: null },
        startTime: { gte: startDate },
      },
    });

    const totalDistance = trips.reduce((sum, t) => sum + (t.distance || 0), 0);
    const totalDuration = trips.reduce((sum, t) => {
      if (t.endTime) {
        return sum + (new Date(t.endTime) - new Date(t.startTime));
      }
      return sum;
    }, 0);

    const totalPossibleHours = vehicles.length * days * 24;
    const utilizedHours = totalDuration / (1000 * 60 * 60);
    const utilizationPercentage = (utilizedHours / totalPossibleHours) * 100;

    return {
      utilization: Math.min(100, utilizationPercentage.toFixed(2)),
      vehicleCount: vehicles.length,
      totalDistance: totalDistance.toFixed(2),
      totalDuration: (totalDuration / (1000 * 60 * 60)).toFixed(2),
      utilizedHours: utilizedHours.toFixed(2),
      totalPossibleHours: totalPossibleHours.toFixed(2),
      avgDistancePerVehicle: (totalDistance / vehicles.length).toFixed(2),
    };
  } catch (error) {
    logger.error('Error calculating fleet utilization', { userId, error: error.message });
    throw error;
  }
}

/**
 * Calculate Vehicle Availability
 */
export async function calculateVehicleAvailability(userId) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      include: {
        maintenanceLogs: { where: { completed: false } },
        alerts: { where: { read: false, severity: 'CRITICAL' } },
      },
    });

    if (vehicles.length === 0) {
      return { availability: 0, totalVehicles: 0, availableVehicles: 0 };
    }

    let availableVehicles = 0;
    let unavailableReasons = [];

    for (const vehicle of vehicles) {
      const hasCriticalAlert = vehicle.alerts.length > 0;
      const hasOverdueMaintenance = vehicle.maintenanceLogs.some(m => new Date(m.dueDate) < new Date());
      const isOffline = !vehicle.telemetryOnline;

      if (!hasCriticalAlert && !hasOverdueMaintenance && isOffline) {
        availableVehicles++;
      } else {
        if (hasCriticalAlert) unavailableReasons.push({ vehicle: vehicle.id, reason: 'Critical Alert' });
        if (hasOverdueMaintenance) unavailableReasons.push({ vehicle: vehicle.id, reason: 'Overdue Maintenance' });
        if (!isOffline) unavailableReasons.push({ vehicle: vehicle.id, reason: 'Offline' });
      }
    }

    const availability = (availableVehicles / vehicles.length) * 100;

    return {
      availability: availability.toFixed(2),
      totalVehicles: vehicles.length,
      availableVehicles,
      unavailableVehicles: vehicles.length - availableVehicles,
      unavailableReasons,
    };
  } catch (error) {
    logger.error('Error calculating vehicle availability', { userId, error: error.message });
    throw error;
  }
}

/**
 * Calculate Downtime
 */
export async function calculateDowntime(userId, days = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const maintenanceLogs = await prisma.maintenanceLog.findMany({
      where: {
        vehicle: { userId, deletedAt: null },
        completed: true,
        completedAt: { gte: startDate },
      },
      include: {
        vehicle: true,
      },
    });

    const totalDowntimeHours = maintenanceLogs.reduce((sum, log) => {
      if (log.completedAt && log.dueDate) {
        const duration = new Date(log.completedAt) - new Date(log.dueDate);
        return sum + (duration / (1000 * 60 * 60));
      }
      return sum;
    }, 0);

    return {
      totalDowntimeHours: totalDowntimeHours.toFixed(2),
      totalDowntimeDays: (totalDowntimeHours / 24).toFixed(2),
      maintenanceCount: maintenanceLogs.length,
      avgDowntimePerMaintenance: maintenanceLogs.length > 0 
        ? (totalDowntimeHours / maintenanceLogs.length).toFixed(2)
        : 0,
    };
  } catch (error) {
    logger.error('Error calculating downtime', { userId, error: error.message });
    throw error;
  }
}

/**
 * Calculate Idle Time
 */
export async function calculateIdleTime(userId, days = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const behaviorEvents = await prisma.behaviorEvent.findMany({
      where: {
        vehicle: { userId, deletedAt: null },
        eventType: 'IDLE',
        timestamp: { gte: startDate },
      },
    });

    const idleEvents = behaviorEvents.length;
    const avgIdleDuration = 5; // Assuming 5 minutes per idle event

    const totalIdleHours = (idleEvents * avgIdleDuration) / 60;

    return {
      totalIdleHours: totalIdleHours.toFixed(2),
      idleEventCount: idleEvents,
      avgIdleDuration,
      idlePercentage: ((totalIdleHours / (days * 24)) * 100).toFixed(2),
    };
  } catch (error) {
    logger.error('Error calculating idle time', { userId, error: error.message });
    throw error;
  }
}

/**
 * Calculate Fuel Cost
 */
export async function calculateFuelCost(userId, days = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const fuelLogs = await prisma.fuelLog.findMany({
      where: {
        vehicle: { userId, deletedAt: null },
        timestamp: { gte: startDate },
      },
      include: {
        vehicle: true,
      },
    });

    const totalLiters = fuelLogs.reduce((sum, log) => sum + (log.litersAdded || 0), 0);
    const avgFuelPrice = 1.5; // $1.50 per liter (adjust based on region)
    const totalFuelCost = totalLiters * avgFuelPrice;

    const trips = await prisma.trip.findMany({
      where: {
        vehicle: { userId, deletedAt: null },
        startTime: { gte: startDate },
      },
    });

    const totalDistance = trips.reduce((sum, t) => sum + (t.distance || 0), 0);
    const costPerKm = totalDistance > 0 ? (totalFuelCost / totalDistance) : 0;

    return {
      totalFuelCost: totalFuelCost.toFixed(2),
      totalLiters: totalLiters.toFixed(2),
      avgFuelPrice,
      totalDistance: totalDistance.toFixed(2),
      costPerKm: costPerKm.toFixed(2),
      fuelLogCount: fuelLogs.length,
    };
  } catch (error) {
    logger.error('Error calculating fuel cost', { userId, error: error.message });
    throw error;
  }
}

/**
 * Calculate Maintenance Cost
 */
export async function calculateMaintenanceCost(userId, days = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const maintenanceLogs = await prisma.maintenanceLog.findMany({
      where: {
        vehicle: { userId, deletedAt: null },
        completed: true,
        completedAt: { gte: startDate },
      },
      include: {
        vehicle: true,
      },
    });

    const totalMaintenanceCost = maintenanceLogs.reduce((sum, log) => sum + (log.estimatedCost || 0), 0);

    return {
      totalMaintenanceCost: totalMaintenanceCost.toFixed(2),
      maintenanceCount: maintenanceLogs.length,
      avgCostPerMaintenance: maintenanceLogs.length > 0 
        ? (totalMaintenanceCost / maintenanceLogs.length).toFixed(2)
        : 0,
      maintenanceTypes: maintenanceLogs.reduce((acc, log) => {
        acc[log.type] = (acc[log.type] || 0) + 1;
        return acc;
      }, {}),
    };
  } catch (error) {
    logger.error('Error calculating maintenance cost', { userId, error: error.message });
    throw error;
  }
}

/**
 * Generate Monthly Report
 */
export async function generateMonthlyReport(userId, year, month) {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const [utilization, availability, downtime, idleTime, fuelCost, maintenanceCost] = await Promise.all([
      calculateFleetUtilization(userId, 30),
      calculateVehicleAvailability(userId),
      calculateDowntime(userId, 30),
      calculateIdleTime(userId, 30),
      calculateFuelCost(userId, 30),
      calculateMaintenanceCost(userId, 30),
    ]);

    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      include: {
        trips: {
          where: {
            startTime: { gte: startDate, lte: endDate },
          },
        },
      },
    });

    const totalTrips = vehicles.reduce((sum, v) => sum + v.trips.length, 0);

    return {
      period: `${year}-${month.toString().padStart(2, '0')}`,
      utilization,
      availability,
      downtime,
      idleTime,
      fuelCost,
      maintenanceCost,
      totalTrips,
      vehicleCount: vehicles.length,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Error generating monthly report', { userId, year, month, error: error.message });
    throw error;
  }
}

/**
 * Get Top Performing Vehicles
 */
export async function getTopPerformingVehicles(userId, limit = 5) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      include: {
        trips: {
          orderBy: { startTime: 'desc' },
          take: 20,
        },
        alerts: { where: { read: false } },
        dtcCodes: { where: { active: true } },
      },
    });

    const vehicleScores = await Promise.all(
      vehicles.map(async (vehicle) => {
        const totalDistance = vehicle.trips.reduce((sum, t) => sum + (t.distance || 0), 0);
        const avgFuelEfficiency = vehicle.trips.length > 0
          ? vehicle.trips.reduce((sum, t) => sum + (t.fuelConsumption || 0), 0) / vehicle.trips.length
          : 0;

        let score = 100;
        score -= vehicle.alerts.length * 10;
        score -= vehicle.dtcCodes.length * 5;
        score += (totalDistance / 1000) * 2; // Bonus for distance
        score += avgFuelEfficiency * 3; // Bonus for fuel efficiency

        return {
          vehicle: `${vehicle.make} ${vehicle.model}`,
          plate: vehicle.plateNumber || vehicle.vin,
          score: Math.max(0, score),
          totalDistance: totalDistance.toFixed(2),
          avgFuelEfficiency: avgFuelEfficiency.toFixed(2),
          alertCount: vehicle.alerts.length,
          dtcCount: vehicle.dtcCodes.length,
        };
      })
    );

    vehicleScores.sort((a, b) => b.score - a.score);

    return vehicleScores.slice(0, limit);
  } catch (error) {
    logger.error('Error getting top performing vehicles', { userId, error: error.message });
    throw error;
  }
}

/**
 * Get Worst Performing Vehicles
 */
export async function getWorstPerformingVehicles(userId, limit = 5) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      include: {
        trips: {
          orderBy: { startTime: 'desc' },
          take: 20,
        },
        alerts: { where: { read: false } },
        dtcCodes: { where: { active: true } },
        maintenanceLogs: { where: { completed: false } },
      },
    });

    const vehicleScores = await Promise.all(
      vehicles.map(async (vehicle) => {
        const totalDistance = vehicle.trips.reduce((sum, t) => sum + (t.distance || 0), 0);
        const avgFuelEfficiency = vehicle.trips.length > 0
          ? vehicle.trips.reduce((sum, t) => sum + (t.fuelConsumption || 0), 0) / vehicle.trips.length
          : 0;

        let score = 100;
        score -= vehicle.alerts.length * 15;
        score -= vehicle.dtcCodes.length * 10;
        score -= vehicle.maintenanceLogs.length * 10;
        score -= (totalDistance < 100 ? 20 : 0); // Penalty for low usage

        return {
          vehicle: `${vehicle.make} ${vehicle.model}`,
          plate: vehicle.plateNumber || vehicle.vin,
          score: Math.max(0, score),
          totalDistance: totalDistance.toFixed(2),
          avgFuelEfficiency: avgFuelEfficiency.toFixed(2),
          alertCount: vehicle.alerts.length,
          dtcCount: vehicle.dtcCodes.length,
          maintenanceOverdue: vehicle.maintenanceLogs.length,
        };
      })
    );

    vehicleScores.sort((a, b) => a.score - b.score);

    return vehicleScores.slice(0, limit);
  } catch (error) {
    logger.error('Error getting worst performing vehicles', { userId, error: error.message });
    throw error;
  }
}

/**
 * Get comprehensive business analytics
 */
export async function getBusinessAnalytics(userId, days = 30) {
  try {
    const [utilization, availability, downtime, idleTime, fuelCost, maintenanceCost, topVehicles, worstVehicles] = await Promise.all([
      calculateFleetUtilization(userId, days),
      calculateVehicleAvailability(userId),
      calculateDowntime(userId, days),
      calculateIdleTime(userId, days),
      calculateFuelCost(userId, days),
      calculateMaintenanceCost(userId, days),
      getTopPerformingVehicles(userId, 3),
      getWorstPerformingVehicles(userId, 3),
    ]);

    return {
      utilization,
      availability,
      downtime,
      idleTime,
      fuelCost,
      maintenanceCost,
      topVehicles,
      worstVehicles,
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Error getting business analytics', { userId, error: error.message });
    throw error;
  }
}
