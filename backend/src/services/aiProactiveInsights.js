/**
 * AI Proactive Insights Service
 * Automatically generates insights about fleet operations
 * - Battery dropping trend
 * - Coolant rising trend
 * - Repeated fuel low
 * - Repeated standby
 * - Overdue maintenance
 * - Telemetry offline
 * - Risky vehicle
 * - High fuel consumption
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { compareWithHistorical } from './aiConversationMemory.js';
import { getAllPredictions } from './aiPredictions.js';
import { calculateAllVehicleHealthScores } from './aiAnalysisEngine.js';

/**
 * Generate all proactive insights for a user
 */
export async function generateProactiveInsights(userId) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      include: {
        liveData: { orderBy: { timestamp: 'desc' }, take: 10 },
        maintenanceLogs: { where: { completed: false } },
        alerts: { where: { read: false } },
        dtcCodes: { where: { active: true } },
      },
    });

    const insights = [];

    for (const vehicle of (vehicles || [])) {
      try {
        const vehicleInsights = await generateVehicleInsights(vehicle);
        insights.push(...(vehicleInsights || []));
      } catch (vehicleError) {
        console.error('AI FAILED AT GENERATE VEHICLE INSIGHTS', vehicleError);
        console.error(vehicleError.stack);
      }
    }

    // Fleet-level insights
    try {
      const fleetInsights = await generateFleetInsights(userId, vehicles);
      insights.push(...(fleetInsights || []));
    } catch (fleetError) {
      console.error('AI FAILED AT GENERATE FLEET INSIGHTS', fleetError);
      console.error(fleetError.stack);
    }

    // Sort by severity
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    insights.sort((a, b) => (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3));

    logger.info('AI_PROACTIVE_INSIGHTS_GENERATED', { userId, insightCount: insights.length });

    return {
      userId,
      generatedAt: new Date().toISOString(),
      totalInsights: insights.length,
      criticalCount: insights.filter(i => i.severity === 'CRITICAL').length,
      highCount: insights.filter(i => i.severity === 'HIGH').length,
      mediumCount: insights.filter(i => i.severity === 'MEDIUM').length,
      lowCount: insights.filter(i => i.severity === 'LOW').length,
      insights: insights.slice(0, 20), // Limit to top 20
    };
  } catch (error) {
    console.error('AI FAILED AT GENERATE PROACTIVE INSIGHTS', error);
    console.error(error.stack);
    // Return empty insights instead of throwing
    return {
      userId,
      generatedAt: new Date().toISOString(),
      totalInsights: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      insights: [],
    };
  }
}

/**
 * Generate insights for a single vehicle
 */
async function generateVehicleInsights(vehicle) {
  const insights = [];
  const vehicleName = `${vehicle.make} ${vehicle.model} (${vehicle.plateNumber || vehicle.vin})`;

  // Battery dropping trend
  const batteryInsight = await detectBatteryDroppingTrend(vehicle, vehicleName);
  if (batteryInsight) insights.push(batteryInsight);

  // Coolant rising trend
  const coolantInsight = await detectCoolantRisingTrend(vehicle, vehicleName);
  if (coolantInsight) insights.push(coolantInsight);

  // Repeated fuel low
  const fuelInsight = await detectRepeatedFuelLow(vehicle, vehicleName);
  if (fuelInsight) insights.push(fuelInsight);

  // Repeated standby
  const standbyInsight = await detectRepeatedStandby(vehicle, vehicleName);
  if (standbyInsight) insights.push(standbyInsight);

  // Overdue maintenance
  const maintenanceInsight = await detectOverdueMaintenance(vehicle, vehicleName);
  if (maintenanceInsight) insights.push(maintenanceInsight);

  // Telemetry offline
  const telemetryInsight = await detectTelemetryOffline(vehicle, vehicleName);
  if (telemetryInsight) insights.push(telemetryInsight);

  // Risky vehicle (from predictions)
  const riskInsight = await detectRiskyVehicle(vehicle, vehicleName);
  if (riskInsight) insights.push(riskInsight);

  // High fuel consumption
  const consumptionInsight = await detectHighFuelConsumption(vehicle, vehicleName);
  if (consumptionInsight) insights.push(consumptionInsight);

  return insights;
}

/**
 * Detect battery dropping trend
 */
async function detectBatteryDroppingTrend(vehicle, vehicleName) {
  try {
    if (!vehicle.liveData || vehicle.liveData.length < 3) {
      return null;
    }

    const recentVoltages = vehicle.liveData.slice(0, 5).map(d => d.batteryVoltage).filter(v => v);
    if (recentVoltages.length < 3) return null;

    const firstVoltage = recentVoltages[recentVoltages.length - 1];
    const lastVoltage = recentVoltages[0];
    const voltageDrop = firstVoltage - lastVoltage;

    if (voltageDrop > 0.5) {
      return {
        type: 'BATTERY_DROPPING',
        severity: voltageDrop > 1.0 ? 'CRITICAL' : 'HIGH',
        vehicle: vehicleName,
        vehicleId: vehicle.id,
        message: `Battery voltage dropping by ${voltageDrop.toFixed(2)}V over recent readings`,
        currentVoltage: lastVoltage.toFixed(2),
        previousVoltage: firstVoltage.toFixed(2),
        drop: voltageDrop.toFixed(2),
        recommendedAction: 'Check battery health and charging system',
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  } catch (error) {
    logger.error('Error detecting battery dropping trend', { vehicleId: vehicle.id, error: error.message });
    return null;
  }
}

/**
 * Detect coolant rising trend
 */
async function detectCoolantRisingTrend(vehicle, vehicleName) {
  try {
    if (!vehicle.liveData || vehicle.liveData.length < 3) {
      return null;
    }

    const recentTemps = vehicle.liveData.slice(0, 5).map(d => d.coolantTemp).filter(t => t);
    if (recentTemps.length < 3) return null;

    const firstTemp = recentTemps[recentTemps.length - 1];
    const lastTemp = recentTemps[0];
    const tempRise = lastTemp - firstTemp;

    if (tempRise > 5) {
      return {
        type: 'COOLANT_RISING',
        severity: tempRise > 15 ? 'CRITICAL' : tempRise > 10 ? 'HIGH' : 'MEDIUM',
        vehicle: vehicleName,
        vehicleId: vehicle.id,
        message: `Coolant temperature rising by ${tempRise.toFixed(1)}°C`,
        currentTemp: lastTemp.toFixed(1),
        previousTemp: firstTemp.toFixed(1),
        rise: tempRise.toFixed(1),
        recommendedAction: 'Check cooling system and thermostat',
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  } catch (error) {
    logger.error('Error detecting coolant rising trend', { vehicleId: vehicle.id, error: error.message });
    return null;
  }
}

/**
 * Detect repeated fuel low
 */
async function detectRepeatedFuelLow(vehicle, vehicleName) {
  try {
    if (!vehicle.liveData || vehicle.liveData.length < 5) {
      return null;
    }

    const lowFuelReadings = vehicle.liveData.filter(d => d.fuelLevel && d.fuelLevel < 20);
    const lowFuelCount = lowFuelReadings.length;
    const totalReadings = vehicle.liveData.length;

    if (lowFuelCount >= 3 && lowFuelCount / totalReadings > 0.5) {
      return {
        type: 'REPEATED_FUEL_LOW',
        severity: 'MEDIUM',
        vehicle: vehicleName,
        vehicleId: vehicle.id,
        message: `Fuel level below 20% in ${lowFuelCount} of ${totalReadings} recent readings`,
        lowFuelCount,
        totalReadings,
        percentage: ((lowFuelCount / totalReadings) * 100).toFixed(1),
        recommendedAction: 'Monitor fuel consumption and consider route optimization',
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  } catch (error) {
    logger.error('Error detecting repeated fuel low', { vehicleId: vehicle.id, error: error.message });
    return null;
  }
}

/**
 * Detect repeated standby
 */
async function detectRepeatedStandby(vehicle, vehicleName) {
  try {
    const standbyCount = vehicle.standbyCount || 0;
    const lastStandbyAt = vehicle.lastStandbyAt;

    if (!lastStandbyAt) return null;

    const hoursSinceStandby = (Date.now() - new Date(lastStandbyAt).getTime()) / (1000 * 60 * 60);

    if (standbyCount > 5 && hoursSinceStandby < 24) {
      return {
        type: 'REPEATED_STANDBY',
        severity: 'MEDIUM',
        vehicle: vehicleName,
        vehicleId: vehicle.id,
        message: `Vehicle entered standby mode ${standbyCount} times in the last 24 hours`,
        standbyCount,
        hoursSinceStandby: hoursSinceStandby.toFixed(1),
        recommendedAction: 'Check battery health and OBD device connection',
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  } catch (error) {
    logger.error('Error detecting repeated standby', { vehicleId: vehicle.id, error: error.message });
    return null;
  }
}

/**
 * Detect overdue maintenance
 */
async function detectOverdueMaintenance(vehicle, vehicleName) {
  try {
    const now = new Date();
    const overdueItems = vehicle.maintenanceLogs.filter(log => new Date(log.dueDate) < now);
    const criticalOverdue = overdueItems.filter(log => log.priority === 'CRITICAL');

    if (overdueItems.length > 0) {
      return {
        type: 'OVERDUE_MAINTENANCE',
        severity: criticalOverdue.length > 0 ? 'CRITICAL' : 'HIGH',
        vehicle: vehicleName,
        vehicleId: vehicle.id,
        message: `${overdueItems.length} maintenance items overdue (${criticalOverdue.length} critical)`,
        overdueCount: overdueItems.length,
        criticalCount: criticalOverdue.length,
        items: overdueItems.map(log => ({ type: log.type, dueDate: log.dueDate, priority: log.priority })),
        recommendedAction: 'Schedule overdue maintenance immediately',
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  } catch (error) {
    logger.error('Error detecting overdue maintenance', { vehicleId: vehicle.id, error: error.message });
    return null;
  }
}

/**
 * Detect telemetry offline
 */
async function detectTelemetryOffline(vehicle, vehicleName) {
  try {
    if (vehicle.telemetryOnline) return null;

    const lastObdAt = vehicle.lastObdAt;
    if (!lastObdAt) return null;

    const hoursOffline = (Date.now() - new Date(lastObdAt).getTime()) / (1000 * 60 * 60);

    if (hoursOffline > 3) {
      return {
        type: 'TELEMETRY_OFFLINE',
        severity: hoursOffline > 24 ? 'CRITICAL' : hoursOffline > 12 ? 'HIGH' : 'MEDIUM',
        vehicle: vehicleName,
        vehicleId: vehicle.id,
        message: `Telemetry offline for ${hoursOffline.toFixed(1)} hours`,
        hoursOffline: hoursOffline.toFixed(1),
        lastUpdate: lastObdAt,
        recommendedAction: 'Check OBD device connection and vehicle power',
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  } catch (error) {
    logger.error('Error detecting telemetry offline', { vehicleId: vehicle.id, error: error.message });
    return null;
  }
}

/**
 * Detect risky vehicle from predictions
 */
async function detectRiskyVehicle(vehicle, vehicleName) {
  try {
    const predictions = await getAllPredictions(vehicle.id);
    const healthScores = await calculateAllVehicleHealthScores(vehicle.id);

    const criticalPredictions = [];
    if (predictions.battery.confidence > 80 && predictions.battery.prediction.toLowerCase().includes('failure')) {
      criticalPredictions.push({ type: 'battery', ...predictions.battery });
    }
    if (predictions.coolant.confidence > 80 && predictions.coolant.prediction.toLowerCase().includes('failure')) {
      criticalPredictions.push({ type: 'coolant', ...predictions.coolant });
    }
    if (predictions.engineOverheating.confidence > 80 && predictions.engineOverheating.prediction.toLowerCase().includes('overheat')) {
      criticalPredictions.push({ type: 'engine', ...predictions.engineOverheating });
    }

    if (criticalPredictions.length > 0 || healthScores.vehicle.score < 50) {
      return {
        type: 'RISKY_VEHICLE',
        severity: healthScores.vehicle.score < 40 ? 'CRITICAL' : 'HIGH',
        vehicle: vehicleName,
        vehicleId: vehicle.id,
        message: `Vehicle at high risk - health score ${healthScores.vehicle.score}/100 with ${criticalPredictions.length} critical predictions`,
        healthScore: healthScores.vehicle.score,
        riskLevel: healthScores.vehicle.riskLevel,
        criticalPredictions,
        recommendedAction: 'Schedule immediate inspection and maintenance',
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  } catch (error) {
    logger.error('Error detecting risky vehicle', { vehicleId: vehicle.id, error: error.message });
    return null;
  }
}

/**
 * Detect high fuel consumption
 */
async function detectHighFuelConsumption(vehicle, vehicleName) {
  try {
    const fuelLogs = await prisma.fuelLog.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: { date: 'desc' },
      take: 10,
    });

    if (fuelLogs.length < 5) return null;

    const recentConsumption = fuelLogs.slice(0, 5).reduce((sum, log) => sum + (log.fuelConsumed || 0), 0);
    const avgConsumption = recentConsumption / 5;

    // Threshold: 15L per 100km is considered high
    if (avgConsumption > 15) {
      return {
        type: 'HIGH_FUEL_CONSUMPTION',
        severity: avgConsumption > 20 ? 'HIGH' : 'MEDIUM',
        vehicle: vehicleName,
        vehicleId: vehicle.id,
        message: `Average fuel consumption ${avgConsumption.toFixed(1)}L/100km exceeds normal range`,
        avgConsumption: avgConsumption.toFixed(1),
        recommendedAction: 'Review driving behavior and vehicle condition',
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  } catch (error) {
    logger.error('Error detecting high fuel consumption', { vehicleId: vehicle.id, error: error.message });
    return null;
  }
}

/**
 * Generate fleet-level insights
 */
async function generateFleetInsights(userId, vehicles) {
  const insights = [];

  // Fleet-wide offline vehicles
  const offlineVehicles = vehicles.filter(v => !v.telemetryOnline);
  if (offlineVehicles.length > 0) {
    insights.push({
      type: 'FLEET_OFFLINE_VEHICLES',
      severity: offlineVehicles.length > vehicles.length / 2 ? 'CRITICAL' : 'HIGH',
      vehicle: 'Fleet',
      vehicleId: null,
      message: `${offlineVehicles.length} of ${vehicles.length} vehicles offline (${((offlineVehicles.length / vehicles.length) * 100).toFixed(1)}%)`,
      offlineCount: offlineVehicles.length,
      totalVehicles: vehicles.length,
      percentage: ((offlineVehicles.length / vehicles.length) * 100).toFixed(1),
      recommendedAction: 'Check connectivity for all offline vehicles',
      timestamp: new Date().toISOString(),
    });
  }

  // Fleet-wide overdue maintenance
  const allMaintenanceLogs = await prisma.maintenanceLog.findMany({
    where: {
      vehicle: { userId },
      completed: false,
      dueDate: { lt: new Date() },
    },
  });

  if (allMaintenanceLogs.length > 5) {
    insights.push({
      type: 'FLEET_OVERDUE_MAINTENANCE',
      severity: allMaintenanceLogs.length > 10 ? 'CRITICAL' : 'HIGH',
      vehicle: 'Fleet',
      vehicleId: null,
      message: `${allMaintenanceLogs.length} maintenance items overdue across fleet`,
      overdueCount: allMaintenanceLogs.length,
      recommendedAction: 'Prioritize fleet-wide maintenance scheduling',
      timestamp: new Date().toISOString(),
    });
  }

  // Fleet-wide critical alerts
  const allAlerts = await prisma.alert.findMany({
    where: {
      vehicle: { userId },
      read: false,
      severity: 'CRITICAL',
    },
  });

  if (allAlerts.length > 3) {
    insights.push({
      type: 'FLEET_CRITICAL_ALERTS',
      severity: 'CRITICAL',
      vehicle: 'Fleet',
      vehicleId: null,
      message: `${allAlerts.length} critical alerts across fleet`,
      alertCount: allAlerts.length,
      recommendedAction: 'Address critical alerts immediately',
      timestamp: new Date().toISOString(),
    });
  }

  return insights;
}

/**
 * Schedule proactive insights generation (every hour)
 */
export function scheduleProactiveInsights() {
  setInterval(async () => {
    try {
      const users = await prisma.user.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });

      for (const user of users) {
        try {
          const insights = await generateProactiveInsights(user.id);
          
          // Save insights to database for dashboard
          await prisma.aiInsight.create({
            data: {
              userId: user.id,
              insights: JSON.stringify(insights),
              generatedAt: new Date(),
            },
          });

          logger.info('Proactive insights saved for user', { userId: user.id, count: insights.totalInsights });
        } catch (error) {
          logger.error('Failed to generate insights for user', { userId: user.id, error: error.message });
        }
      }
    } catch (error) {
      logger.error('Error in proactive insights schedule', { error: error.message });
    }
  }, 60 * 60 * 1000); // Every hour

  logger.info('Proactive insights generation scheduled');
}
