/**
 * AI Digital Twin Service
 * Creates a live AI digital twin for each vehicle with health score, predictions, current state, historical trends, and recommendations
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { calculateAllVehicleHealthScores } from './aiAnalysisEngine.js';
import { getAllPredictions } from './aiPredictions.js';
import { compareWithHistorical } from './aiConversationMemory.js';

/**
 * Generate digital twin for a vehicle
 */
export async function generateVehicleDigitalTwin(vehicleId, userId) {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, userId, deletedAt: null },
      include: {
        liveData: { orderBy: { timestamp: 'desc' }, take: 1 },
        dtcCodes: { where: { active: true } },
        alerts: { where: { read: false }, orderBy: { createdAt: 'desc' }, take: 10 },
        trips: { orderBy: { startTime: 'desc' }, take: 50 },
        maintenanceLogs: { where: { completed: false }, orderBy: { dueDate: 'asc' } },
        gpsLocation: true,
        liveState: true,
      },
    });

    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    const [healthScores, predictions, historicalComparison] = await Promise.all([
      calculateAllVehicleHealthScores(vehicleId),
      getAllPredictions(vehicleId),
      compareWithHistorical(userId, vehicleId, getCurrentTelemetry(vehicle)),
    ]);

    const digitalTwin = {
      vehicleId,
      vehicle: {
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        plate: vehicle.plateNumber || vehicle.vin,
        vin: vehicle.vin,
      },
      generatedAt: new Date().toISOString(),
      
      healthScore: {
        overall: healthScores.vehicle,
        battery: healthScores.battery,
        engine: healthScores.engine,
        maintenance: healthScores.maintenance,
        fuelEfficiency: healthScores.fuelEfficiency,
        utilization: healthScores.utilization,
        driverPerformance: healthScores.driverPerformance,
        tripAnalysis: healthScores.tripAnalysis,
        riskAnalysis: healthScores.riskAnalysis,
      },

      predictions: {
        battery: predictions.battery,
        coolant: predictions.coolant,
        brakeWear: predictions.brakeWear,
        tyreReplacement: predictions.tyreReplacement,
        alternator: predictions.alternator,
        engineOverheating: predictions.engineOverheating,
        transmission: predictions.transmission,
        maintenanceDate: predictions.maintenanceDate,
      },

      currentState: {
        ignition: vehicle.liveState?.ignitionStatus ? 'ON' : 'OFF',
        status: vehicle.liveState?.vehicleStatus || 'UNKNOWN',
        telemetryOnline: vehicle.telemetryOnline,
        lastUpdate: vehicle.liveState?.lastUpdate || vehicle.lastObdAt,
        location: vehicle.gpsLocation ? {
          latitude: vehicle.gpsLocation.latitude,
          longitude: vehicle.gpsLocation.longitude,
          lastUpdate: vehicle.gpsLastAt,
        } : null,
        liveTelemetry: vehicle.liveData && vehicle.liveData.length > 0 ? {
          rpm: vehicle.liveData[0].rpm,
          speed: vehicle.liveData[0].speed,
          fuelLevel: vehicle.liveData[0].fuelLevel,
          batteryVoltage: vehicle.liveData[0].batteryVoltage,
          coolantTemp: vehicle.liveData[0].coolantTemp,
          engineLoad: vehicle.liveData[0].engineLoad,
          throttlePosition: vehicle.liveData[0].throttlePosition,
        } : null,
        activeDTCs: vehicle.dtcCodes.map(dtc => ({
          code: dtc.code,
          description: dtc.description,
          timestamp: dtc.timestamp,
        })),
        unreadAlerts: vehicle.alerts.map(alert => ({
          id: alert.id,
          message: alert.message,
          severity: alert.severity,
          type: alert.type,
          createdAt: alert.createdAt,
        })),
        pendingMaintenance: vehicle.maintenanceLogs.map(log => ({
          id: log.id,
          type: log.type,
          dueDate: log.dueDate,
          priority: log.priority,
          estimatedCost: log.estimatedCost,
        })),
      },

      historicalTrends: {
        hasHistoricalData: historicalComparison.hasHistoricalData,
        previousTimestamp: historicalComparison.previousTimestamp,
        comparisons: historicalComparison.comparisons || [],
        significantChanges: historicalComparison.significantChanges || [],
        recentTrips: {
          totalTrips: vehicle.trips.length,
          totalDistance: vehicle.trips.reduce((sum, t) => sum + (t.distance || 0), 0),
          avgDistance: vehicle.trips.length > 0 ? vehicle.trips.reduce((sum, t) => sum + (t.distance || 0), 0) / vehicle.trips.length : 0,
          lastTrip: vehicle.trips[0] ? {
            startTime: vehicle.trips[0].startTime,
            endTime: vehicle.trips[0].endTime,
            distance: vehicle.trips[0].distance,
            duration: vehicle.trips[0].duration,
          } : null,
        },
      },

      recommendations: generateDigitalTwinRecommendations(healthScores, predictions, vehicle),

      summary: {
        overallHealth: healthScores.vehicle.score,
        riskLevel: healthScores.vehicle.riskLevel,
        immediateActions: getImmediateActions(healthScores, predictions, vehicle),
        nextMaintenance: vehicle.maintenanceLogs.length > 0 ? vehicle.maintenanceLogs[0] : null,
        criticalPredictions: getCriticalPredictions(predictions),
      },
    };

    logger.info('Digital twin generated', { vehicleId });

    return digitalTwin;
  } catch (error) {
    logger.error('Error generating digital twin', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Generate digital twins for all vehicles
 */
export async function generateAllDigitalTwins(userId) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      select: { id: true },
    });

    const digitalTwins = await Promise.all(
      vehicles.map(vehicle => generateVehicleDigitalTwin(vehicle.id, userId))
    );

    return {
      userId,
      generatedAt: new Date().toISOString(),
      totalVehicles: digitalTwins.length,
      digitalTwins,
      fleetSummary: generateFleetDigitalTwinSummary(digitalTwins),
    };
  } catch (error) {
    logger.error('Error generating all digital twins', { userId, error: error.message });
    throw error;
  }
}

/**
 * Get current telemetry from vehicle
 */
function getCurrentTelemetry(vehicle) {
  if (!vehicle.liveData || vehicle.liveData.length === 0) {
    return {};
  }

  const data = vehicle.liveData[0];
  return {
    batteryVoltage: data.batteryVoltage,
    coolantTemp: data.coolantTemp,
    fuelLevel: data.fuelLevel,
    odometer: vehicle.odometer,
    rpm: data.rpm,
    speed: data.speed,
  };
}

/**
 * Generate recommendations for digital twin
 */
function generateDigitalTwinRecommendations(healthScores, predictions, vehicle) {
  const recommendations = [];

  // Health-based recommendations
  if (healthScores.vehicle.score < 60) {
    recommendations.push({
      priority: 'CRITICAL',
      category: 'Health',
      action: 'Immediate vehicle inspection required',
      reason: `Overall health score is ${healthScores.vehicle.score}`,
    });
  } else if (healthScores.vehicle.score < 75) {
    recommendations.push({
      priority: 'HIGH',
      category: 'Health',
      action: 'Schedule vehicle inspection',
      reason: `Overall health score is ${healthScores.vehicle.score}`,
    });
  }

  // Battery health
  if (healthScores.battery.score < 60) {
    recommendations.push({
      priority: 'HIGH',
      category: 'Battery',
      action: 'Check battery health and consider replacement',
      reason: `Battery health score is ${healthScores.battery.score}`,
    });
  }

  // Engine health
  if (healthScores.engine.score < 60) {
    recommendations.push({
      priority: 'HIGH',
      category: 'Engine',
      action: 'Engine diagnostic recommended',
      reason: `Engine health score is ${healthScores.engine.score}`,
    });
  }

  // Predictive recommendations
  if (predictions.battery.confidence > 80 && predictions.battery.prediction.toLowerCase().includes('failure')) {
    recommendations.push({
      priority: 'CRITICAL',
      category: 'Prediction',
      action: predictions.battery.recommendedAction,
      reason: `Battery failure predicted with ${predictions.battery.confidence}% confidence`,
      estimatedFailureDate: predictions.battery.estimatedFailureDate,
      estimatedCost: predictions.battery.estimatedRepairCost,
    });
  }

  if (predictions.coolant.confidence > 80 && predictions.coolant.prediction.toLowerCase().includes('failure')) {
    recommendations.push({
      priority: 'CRITICAL',
      category: 'Prediction',
      action: predictions.coolant.recommendedAction,
      reason: `Coolant failure predicted with ${predictions.coolant.confidence}% confidence`,
      estimatedFailureDate: predictions.coolant.estimatedFailureDate,
      estimatedCost: predictions.coolant.estimatedRepairCost,
    });
  }

  // Maintenance recommendations
  if (vehicle.maintenanceLogs.some(log => log.priority === 'CRITICAL')) {
    recommendations.push({
      priority: 'CRITICAL',
      category: 'Maintenance',
      action: 'Complete critical maintenance items immediately',
      reason: 'Critical maintenance items are overdue',
    });
  }

  // DTC recommendations
  if (vehicle.dtcCodes.length > 0) {
    recommendations.push({
      priority: 'HIGH',
      category: 'Diagnostics',
      action: 'Address active DTC codes',
      reason: `${vehicle.dtcCodes.length} active DTC codes detected`,
    });
  }

  return recommendations;
}

/**
 * Get immediate actions
 */
function getImmediateActions(healthScores, predictions, vehicle) {
  const actions = [];

  if (healthScores.vehicle.score < 50) {
    actions.push('Take vehicle out of service for inspection');
  }

  if (predictions.battery.confidence > 90 && predictions.battery.prediction.toLowerCase().includes('failure')) {
    actions.push('Replace battery immediately');
  }

  if (vehicle.dtcCodes.some(dtc => dtc.code.startsWith('P0'))) {
    actions.push('Diagnostic inspection required');
  }

  if (vehicle.maintenanceLogs.some(log => log.priority === 'CRITICAL')) {
    actions.push('Complete critical maintenance');
  }

  return actions;
}

/**
 * Get critical predictions
 */
function getCriticalPredictions(predictions) {
  const critical = [];

  if (predictions.battery.confidence > 80) {
    critical.push({ type: 'battery', ...predictions.battery });
  }

  if (predictions.coolant.confidence > 80) {
    critical.push({ type: 'coolant', ...predictions.coolant });
  }

  if (predictions.engineOverheating.confidence > 80) {
    critical.push({ type: 'engineOverheating', ...predictions.engineOverheating });
  }

  if (predictions.transmission.confidence > 80) {
    critical.push({ type: 'transmission', ...predictions.transmission });
  }

  return critical;
}

/**
 * Generate fleet digital twin summary
 */
function generateFleetDigitalTwinSummary(digitalTwins) {
  const totalVehicles = digitalTwins.length;
  const avgHealthScore = digitalTwins.reduce((sum, dt) => sum + dt.healthScore.overall.score, 0) / totalVehicles;
  const criticalVehicles = digitalTwins.filter(dt => dt.healthScore.overall.score < 60);
  const highRiskVehicles = digitalTwins.filter(dt => dt.healthScore.overall.riskLevel === 'HIGH' || dt.healthScore.overall.riskLevel === 'CRITICAL');
  const totalCriticalPredictions = digitalTwins.reduce((sum, dt) => sum + dt.summary.criticalPredictions.length, 0);

  return {
    totalVehicles,
    averageHealthScore: avgHealthScore.toFixed(2),
    criticalVehicles: criticalVehicles.length,
    highRiskVehicles: highRiskVehicles.length,
    totalCriticalPredictions,
    overallFleetStatus: avgHealthScore >= 80 ? 'EXCELLENT' : avgHealthScore >= 60 ? 'GOOD' : avgHealthScore >= 40 ? 'FAIR' : 'POOR',
    topRecommendations: getTopFleetRecommendations(digitalTwins),
  };
}

/**
 * Get top fleet recommendations
 */
function getTopFleetRecommendations(digitalTwins) {
  const allRecommendations = digitalTwins.flatMap(dt => dt.recommendations);
  const criticalRecommendations = allRecommendations.filter(r => r.priority === 'CRITICAL');
  const highRecommendations = allRecommendations.filter(r => r.priority === 'HIGH');

  return {
    critical: criticalRecommendations.slice(0, 5),
    high: highRecommendations.slice(0, 5),
  };
}

/**
 * Save digital twin to database
 */
export async function saveDigitalTwin(userId, digitalTwin) {
  try {
    const saved = await prisma.vehicleDigitalTwin.upsert({
      where: {
        vehicleId: digitalTwin.vehicleId,
      },
      update: {
        data: digitalTwin,
        updatedAt: new Date(),
      },
      create: {
        vehicleId: digitalTwin.vehicleId,
        userId,
        data: digitalTwin,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    logger.info('Digital twin saved', { vehicleId: digitalTwin.vehicleId });

    return saved;
  } catch (error) {
    logger.error('Error saving digital twin', { vehicleId: digitalTwin.vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Get digital twin for vehicle
 */
export async function getDigitalTwin(vehicleId, userId) {
  try {
    const digitalTwin = await prisma.vehicleDigitalTwin.findUnique({
      where: { vehicleId },
    });

    if (!digitalTwin) {
      return await generateVehicleDigitalTwin(vehicleId, userId);
    }

    // Check if data is stale (older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (digitalTwin.updatedAt < oneHourAgo) {
      return await generateVehicleDigitalTwin(vehicleId, userId);
    }

    return digitalTwin.data;
  } catch (error) {
    logger.error('Error getting digital twin', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Schedule digital twin updates (every 30 minutes)
 */
let digitalTwinInterval = null;

export function scheduleDigitalTwinUpdates() {
  if (digitalTwinInterval) return;
  
  digitalTwinInterval = setInterval(async () => {
    try {
      const users = await prisma.user.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });

      for (const user of users) {
        try {
          const digitalTwins = await generateAllDigitalTwins(user.id);
          
          for (const twin of digitalTwins.digitalTwins) {
            await saveDigitalTwin(user.id, twin);
          }

          logger.info('Digital twins updated for user', { userId: user.id, count: digitalTwins.digitalTwins.length });
        } catch (error) {
          logger.error('Failed to update digital twins for user', { userId: user.id, error: error.message });
        }
      }
    } catch (error) {
      logger.error('Error in digital twin update schedule', { error: error.message });
    }
  }, 30 * 60 * 1000); // Every 30 minutes

  logger.info('Digital twin updates scheduled');
}

export function stopDigitalTwinUpdates() {
  if (digitalTwinInterval) {
    clearInterval(digitalTwinInterval);
    digitalTwinInterval = null;
  }
}
