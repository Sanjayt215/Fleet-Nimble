/**
 * AI Maintenance AI Service
 * Automatically prioritizes maintenance, suggests schedules, and estimates costs/durations
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

/**
 * Automatically prioritize maintenance items
 */
export async function prioritizeMaintenance(userId) {
  try {
    const maintenanceLogs = await prisma.maintenanceLog.findMany({
      where: {
        vehicle: { userId, deletedAt: null },
        completed: false,
      },
      include: {
        vehicle: {
          include: {
            alerts: { where: { read: false } },
            dtcCodes: { where: { active: true } },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    const prioritizedItems = maintenanceLogs.map(log => {
      const now = new Date();
      const dueDate = new Date(log.dueDate);
      const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
      
      let priority = 'LOW';
      let priorityScore = 0;

      // Overdue
      if (daysUntilDue < 0) {
        priorityScore += 50;
      } else if (daysUntilDue <= 7) {
        priorityScore += 30;
      } else if (daysUntilDue <= 30) {
        priorityScore += 15;
      }

      // Vehicle health impact
      const criticalAlerts = log.vehicle.alerts.filter(a => a.severity === 'CRITICAL').length;
      const activeDTCs = log.vehicle.dtcCodes.length;
      
      priorityScore += criticalAlerts * 20;
      priorityScore += activeDTCs * 10;

      // Maintenance type impact
      const highImpactTypes = ['BRAKE', 'ENGINE', 'TRANSMISSION', 'COOLING', 'BATTERY'];
      if (highImpactTypes.includes(log.type.toUpperCase())) {
        priorityScore += 25;
      }

      // Determine priority level
      if (priorityScore >= 70) {
        priority = 'CRITICAL';
      } else if (priorityScore >= 40) {
        priority = 'HIGH';
      } else if (priorityScore >= 20) {
        priority = 'MEDIUM';
      }

      return {
        id: log.id,
        vehicle: `${log.vehicle.make} ${log.vehicle.model}`,
        plate: log.vehicle.plateNumber || log.vehicle.vin,
        type: log.type,
        dueDate: log.dueDate,
        daysUntilDue,
        priority,
        priorityScore,
        criticalAlerts,
        activeDTCs,
      };
    });

    // Sort by priority score
    prioritizedItems.sort((a, b) => b.priorityScore - a.priorityScore);

    return {
      critical: prioritizedItems.filter(i => i.priority === 'CRITICAL'),
      high: prioritizedItems.filter(i => i.priority === 'HIGH'),
      medium: prioritizedItems.filter(i => i.priority === 'MEDIUM'),
      low: prioritizedItems.filter(i => i.priority === 'LOW'),
      all: prioritizedItems,
    };
  } catch (error) {
    logger.error('Error prioritizing maintenance', { userId, error: error.message });
    throw error;
  }
}

/**
 * Suggest maintenance schedule
 */
export async function suggestMaintenanceSchedule(userId, daysAhead = 30) {
  try {
    const prioritized = await prioritizeMaintenance(userId);
    const allItems = prioritized.all;

    const schedule = [];
    const now = new Date();

    for (const item of allItems) {
      const dueDate = new Date(item.dueDate);
      const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

      if (daysUntilDue <= daysAhead) {
        schedule.push({
          ...item,
          suggestedDate: item.priority === 'CRITICAL' 
            ? now.toISOString().split('T')[0]
            : dueDate.toISOString().split('T')[0],
          urgency: item.priority === 'CRITICAL' 
            ? 'Immediate' 
            : item.priority === 'HIGH' 
            ? 'This Week' 
            : 'This Month',
        });
      }
    }

    // Group by week
    const weeklySchedule = {};
    schedule.forEach(item => {
      const itemDate = new Date(item.suggestedDate);
      const weekNumber = getWeekNumber(itemDate);
      const weekKey = `Week ${weekNumber}`;

      if (!weeklySchedule[weekKey]) {
        weeklySchedule[weekKey] = [];
      }
      weeklySchedule[weekKey].push(item);
    });

    return {
      schedule,
      weeklySchedule,
      totalItems: schedule.length,
      criticalCount: schedule.filter(i => i.priority === 'CRITICAL').length,
      highCount: schedule.filter(i => i.priority === 'HIGH').length,
    };
  } catch (error) {
    logger.error('Error suggesting maintenance schedule', { userId, error: error.message });
    throw error;
  }
}

/**
 * Estimate repair cost
 */
export async function estimateRepairCost(maintenanceType, vehicleMake, vehicleModel) {
  try {
    // Base costs for different maintenance types (in USD)
    const baseCosts = {
      'OIL_CHANGE': 50,
      'BRAKE_SERVICE': 200,
      'TIRE_ROTATION': 40,
      'TIRE_REPLACEMENT': 500,
      'BATTERY_REPLACEMENT': 150,
      'COOLANT_FLUSH': 100,
      'TRANSMISSION_SERVICE': 300,
      'ENGINE_TUNE_UP': 250,
      'AIR_FILTER': 30,
      'SPARK_PLUGS': 150,
      'ALIGNMENT': 80,
      'INSPECTION': 50,
      'DEFAULT': 100,
    };

    const baseCost = baseCosts[maintenanceType.toUpperCase()] || baseCosts.DEFAULT;

    // Adjust for vehicle type (luxury vehicles cost more)
    const luxuryMakes = ['BMW', 'MERCEDES', 'AUDI', 'LEXUS', 'LAND ROVER', 'PORSCHE'];
    const multiplier = luxuryMakes.includes(vehicleMake.toUpperCase()) ? 1.5 : 1.0;

    const estimatedCost = baseCost * multiplier;

    // Estimate duration (hours)
    const durations = {
      'OIL_CHANGE': 1,
      'BRAKE_SERVICE': 2,
      'TIRE_ROTATION': 1,
      'TIRE_REPLACEMENT': 2,
      'BATTERY_REPLACEMENT': 1,
      'COOLANT_FLUSH': 1.5,
      'TRANSMISSION_SERVICE': 4,
      'ENGINE_TUNE_UP': 3,
      'AIR_FILTER': 0.5,
      'SPARK_PLUGS': 2,
      'ALIGNMENT': 1,
      'INSPECTION': 1,
      'DEFAULT': 2,
    };

    const estimatedDuration = durations[maintenanceType.toUpperCase()] || durations.DEFAULT;

    return {
      estimatedCost: estimatedCost.toFixed(2),
      estimatedDuration: estimatedDuration,
      currency: 'USD',
      breakdown: {
        parts: (estimatedCost * 0.6).toFixed(2),
        labor: (estimatedCost * 0.4).toFixed(2),
      },
    };
  } catch (error) {
    logger.error('Error estimating repair cost', { maintenanceType, error: error.message });
    throw error;
  }
}

/**
 * Estimate repair duration
 */
export async function estimateRepairDuration(maintenanceType, vehicleMake) {
  try {
    const durations = {
      'OIL_CHANGE': 1,
      'BRAKE_SERVICE': 2,
      'TIRE_ROTATION': 1,
      'TIRE_REPLACEMENT': 2,
      'BATTERY_REPLACEMENT': 1,
      'COOLANT_FLUSH': 1.5,
      'TRANSMISSION_SERVICE': 4,
      'ENGINE_TUNE_UP': 3,
      'AIR_FILTER': 0.5,
      'SPARK_PLUGS': 2,
      'ALIGNMENT': 1,
      'INSPECTION': 1,
      'DEFAULT': 2,
    };

    const baseDuration = durations[maintenanceType.toUpperCase()] || durations.DEFAULT;

    // Luxury vehicles may take longer
    const luxuryMakes = ['BMW', 'MERCEDES', 'AUDI', 'LEXUS', 'LAND ROVER', 'PORSCHE'];
    const multiplier = luxuryMakes.includes(vehicleMake.toUpperCase()) ? 1.2 : 1.0;

    const estimatedDuration = baseDuration * multiplier;

    return {
      estimatedDuration: estimatedDuration.toFixed(1),
      unit: 'hours',
      bufferTime: (estimatedDuration * 0.2).toFixed(1), // 20% buffer
    };
  } catch (error) {
    logger.error('Error estimating repair duration', { maintenanceType, error: error.message });
    throw error;
  }
}

/**
 * Get comprehensive maintenance AI analysis
 */
export async function getMaintenanceAIAnalysis(userId) {
  try {
    const [prioritized, schedule, maintenanceLogs] = await Promise.all([
      prioritizeMaintenance(userId),
      suggestMaintenanceSchedule(userId, 30),
      prisma.maintenanceLog.findMany({
        where: {
          vehicle: { userId, deletedAt: null },
          completed: false,
        },
        include: {
          vehicle: true,
        },
      }),
    ]);

    // Calculate total estimated cost
    let totalEstimatedCost = 0;
    let totalEstimatedDuration = 0;

    for (const log of maintenanceLogs) {
      const costEstimate = await estimateRepairCost(log.type, log.vehicle.make, log.vehicle.model);
      const durationEstimate = await estimateRepairDuration(log.type, log.vehicle.make);
      
      totalEstimatedCost += parseFloat(costEstimate.estimatedCost);
      totalEstimatedDuration += parseFloat(durationEstimate.estimatedDuration);
    }

    return {
      prioritized,
      schedule,
      totalEstimatedCost: totalEstimatedCost.toFixed(2),
      totalEstimatedDuration: totalEstimatedDuration.toFixed(1),
      currency: 'USD',
      summary: {
        totalItems: maintenanceLogs.length,
        criticalCount: prioritized.critical.length,
        highCount: prioritized.high.length,
        mediumCount: prioritized.medium.length,
        lowCount: prioritized.low.length,
      },
    };
  } catch (error) {
    logger.error('Error getting maintenance AI analysis', { userId, error: error.message });
    throw error;
  }
}

/**
 * Helper function to get week number
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
}
