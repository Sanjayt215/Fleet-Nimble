/**
 * AI Analysis Engine
 * Calculates health scores and performs fleet analysis using real backend data
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

/**
 * Calculate Fleet Health Score (0-100)
 */
export async function calculateFleetHealthScore(userId) {
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

    if (vehicles.length === 0) {
      return { score: 0, riskLevel: 'No Data' };
    }

    let totalScore = 0;
    let offlineCount = 0;
    let criticalAlerts = 0;
    let activeDTCs = 0;
    let overdueMaintenance = 0;

    for (const vehicle of vehicles) {
      let vehicleScore = 100;
      
      // Offline penalty
      if (!vehicle.telemetryOnline) {
        vehicleScore -= 30;
        offlineCount++;
      }
      
      // Alert penalties
      const criticalVehicleAlerts = vehicle.alerts.filter(a => a.severity === 'CRITICAL').length;
      vehicleScore -= criticalVehicleAlerts * 15;
      vehicleScore -= vehicle.alerts.filter(a => a.severity === 'HIGH').length * 10;
      vehicleScore -= vehicle.alerts.filter(a => a.severity === 'MEDIUM').length * 5;
      criticalAlerts += criticalVehicleAlerts;
      
      // DTC penalties
      vehicleScore -= vehicle.dtcCodes.length * 5;
      activeDTCs += vehicle.dtcCodes.length;
      
      // Maintenance penalties
      const overdue = vehicle.maintenanceLogs.filter(m => new Date(m.dueDate) < new Date());
      vehicleScore -= overdue.length * 10;
      overdueMaintenance += overdue.length;
      
      totalScore += Math.max(0, vehicleScore);
    }

    const averageScore = Math.round(totalScore / vehicles.length);
    
    // Determine risk level
    let riskLevel = 'Good';
    if (averageScore < 50) riskLevel = 'Critical';
    else if (averageScore < 70) riskLevel = 'High';
    else if (averageScore < 85) riskLevel = 'Moderate';

    return {
      score: averageScore,
      riskLevel,
      vehicleCount: vehicles.length,
      offlineCount,
      criticalAlerts,
      activeDTCs,
      overdueMaintenance,
    };
  } catch (error) {
    logger.error('Error calculating fleet health score', { userId, error: error.message });
    throw error;
  }
}

/**
 * Calculate Vehicle Health Score (0-100)
 */
export async function calculateVehicleHealthScore(vehicleId) {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId },
      include: {
        liveState: true,
        alerts: { where: { read: false } },
        dtcCodes: { where: { active: true } },
        maintenanceLogs: { where: { completed: false } },
      },
    });

    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    let score = 100;

    // Telemetry status
    if (!vehicle.telemetryOnline) score -= 30;

    // Alerts
    score -= vehicle.alerts.filter(a => a.severity === 'CRITICAL').length * 15;
    score -= vehicle.alerts.filter(a => a.severity === 'HIGH').length * 10;
    score -= vehicle.alerts.filter(a => a.severity === 'MEDIUM').length * 5;

    // DTC codes
    score -= vehicle.dtcCodes.length * 5;

    // Maintenance
    const overdue = vehicle.maintenanceLogs.filter(m => new Date(m.dueDate) < new Date());
    score -= overdue.length * 10;

    return {
      score: Math.max(0, score),
      riskLevel: score < 50 ? 'Critical' : score < 70 ? 'High' : score < 85 ? 'Moderate' : 'Good',
      telemetryOnline: vehicle.telemetryOnline,
      alertCount: vehicle.alerts.length,
      dtcCount: vehicle.dtcCodes.length,
      maintenanceOverdue: overdue.length,
    };
  } catch (error) {
    logger.error('Error calculating vehicle health score', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Calculate Battery Health Score (0-100)
 */
export async function calculateBatteryHealthScore(vehicleId) {
  try {
    const telemetry = await prisma.obdLiveData.findMany({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
      take: 10,
    });

    if (telemetry.length === 0) {
      return { score: 0, riskLevel: 'No Data', voltage: null };
    }

    const avgVoltage = telemetry.reduce((sum, t) => sum + (t.batteryVoltage || 0), 0) / telemetry.length;
    const minVoltage = Math.min(...telemetry.map(t => t.batteryVoltage || 0));

    let score = 100;

    if (avgVoltage < 11.5 || minVoltage < 11.0) {
      score = 20;
    } else if (avgVoltage < 12.0 || minVoltage < 11.5) {
      score = 40;
    } else if (avgVoltage < 12.4) {
      score = 60;
    } else if (avgVoltage < 12.6) {
      score = 80;
    }

    return {
      score,
      riskLevel: score < 40 ? 'Critical' : score < 60 ? 'High' : score < 80 ? 'Moderate' : 'Good',
      avgVoltage: avgVoltage.toFixed(2),
      minVoltage: minVoltage.toFixed(2),
    };
  } catch (error) {
    logger.error('Error calculating battery health score', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Calculate Engine Health Score (0-100)
 */
export async function calculateEngineHealthScore(vehicleId) {
  try {
    const telemetry = await prisma.obdLiveData.findMany({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
      take: 10,
    });

    const dtcCodes = await prisma.dtcCode.findMany({
      where: { vehicleId, active: true },
    });

    if (telemetry.length === 0) {
      return { score: 0, riskLevel: 'No Data' };
    }

    const avgCoolant = telemetry.reduce((sum, t) => sum + (t.coolantTemp || 0), 0) / telemetry.length;
    const maxCoolant = Math.max(...telemetry.map(t => t.coolantTemp || 0));
    const avgLoad = telemetry.reduce((sum, t) => sum + (t.engineLoad || 0), 0) / telemetry.length;

    let score = 100;

    // Coolant temperature
    if (maxCoolant > 105 || avgCoolant > 100) {
      score -= 30;
    } else if (maxCoolant > 100 || avgCoolant > 95) {
      score -= 15;
    }

    // Engine load (consistently high load may indicate issues)
    if (avgLoad > 80) {
      score -= 10;
    }

    // DTC codes related to engine
    const engineDTCs = dtcCodes.filter(d => d.code.startsWith('P0') || d.code.startsWith('P1'));
    score -= engineDTCs.length * 10;

    return {
      score: Math.max(0, score),
      riskLevel: score < 50 ? 'Critical' : score < 70 ? 'High' : score < 85 ? 'Moderate' : 'Good',
      avgCoolant: avgCoolant.toFixed(1),
      maxCoolant: maxCoolant.toFixed(1),
      avgLoad: avgLoad.toFixed(1),
      engineDTCCount: engineDTCs.length,
    };
  } catch (error) {
    logger.error('Error calculating engine health score', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Calculate Maintenance Health Score (0-100)
 */
export async function calculateMaintenanceHealthScore(vehicleId) {
  try {
    const maintenanceLogs = await prisma.maintenanceLog.findMany({
      where: { vehicleId, completed: false },
      orderBy: { dueDate: 'asc' },
    });

    if (maintenanceLogs.length === 0) {
      return { score: 100, riskLevel: 'Good', pendingCount: 0 };
    }

    const now = new Date();
    let score = 100;
    let overdueCount = 0;
    let urgentCount = 0;

    for (const log of maintenanceLogs) {
      const dueDate = new Date(log.dueDate);
      const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

      if (daysUntilDue < 0) {
        score -= 20;
        overdueCount++;
      } else if (daysUntilDue <= 7) {
        score -= 10;
        urgentCount++;
      } else if (daysUntilDue <= 30) {
        score -= 5;
      }

      // Priority weighting
      if (log.priority === 'CRITICAL') score -= 15;
      else if (log.priority === 'HIGH') score -= 10;
      else if (log.priority === 'MEDIUM') score -= 5;
    }

    return {
      score: Math.max(0, score),
      riskLevel: score < 50 ? 'Critical' : score < 70 ? 'High' : score < 85 ? 'Moderate' : 'Good',
      pendingCount: maintenanceLogs.length,
      overdueCount,
      urgentCount,
    };
  } catch (error) {
    logger.error('Error calculating maintenance health score', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Calculate Fuel Efficiency Score (0-100)
 */
export async function calculateFuelEfficiencyScore(vehicleId) {
  try {
    const trips = await prisma.trip.findMany({
      where: { vehicleId },
      orderBy: { startTime: 'desc' },
      take: 20,
    });

    if (trips.length === 0 || !trips[0].fuelConsumption) {
      return { score: 0, riskLevel: 'No Data', avgEfficiency: null };
    }

    const avgEfficiency = trips.reduce((sum, t) => sum + (t.fuelConsumption || 0), 0) / trips.length;

    // Assuming target efficiency is 15 km/L (adjust based on vehicle type)
    const targetEfficiency = 15;
    let score = (avgEfficiency / targetEfficiency) * 100;
    score = Math.min(100, Math.max(0, score));

    return {
      score: Math.round(score),
      riskLevel: score < 50 ? 'Poor' : score < 70 ? 'Fair' : score < 85 ? 'Good' : 'Excellent',
      avgEfficiency: avgEfficiency.toFixed(2),
      targetEfficiency,
    };
  } catch (error) {
    logger.error('Error calculating fuel efficiency score', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Calculate Vehicle Utilization Score (0-100)
 */
export async function calculateVehicleUtilizationScore(vehicleId) {
  try {
    const trips = await prisma.trip.findMany({
      where: { vehicleId },
      orderBy: { startTime: 'desc' },
      take: 30,
    });

    if (trips.length === 0) {
      return { score: 0, riskLevel: 'No Data' };
    }

    // Calculate utilization based on trip frequency and distance
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentTrips = trips.filter(t => new Date(t.startTime) >= thirtyDaysAgo);
    
    const totalDistance = recentTrips.reduce((sum, t) => sum + (t.distance || 0), 0);
    const avgDistancePerTrip = totalDistance / recentTrips.length;

    // Target: 20 trips per month, 50km per trip average
    const targetTripCount = 20;
    const targetAvgDistance = 50;

    let score = 0;
    score += (recentTrips.length / targetTripCount) * 50;
    score += (avgDistancePerTrip / targetAvgDistance) * 50;
    score = Math.min(100, Math.max(0, score));

    return {
      score: Math.round(score),
      riskLevel: score < 40 ? 'Underutilized' : score < 70 ? 'Normal' : 'Highly Utilized',
      recentTripCount: recentTrips.length,
      totalDistance: totalDistance.toFixed(2),
      avgDistancePerTrip: avgDistancePerTrip.toFixed(2),
    };
  } catch (error) {
    logger.error('Error calculating vehicle utilization score', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Calculate Driver Performance Score (0-100)
 */
export async function calculateDriverPerformanceScore(vehicleId) {
  try {
    const behaviorEvents = await prisma.behaviorEvent.findMany({
      where: { vehicleId },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    if (behaviorEvents.length === 0) {
      return { score: 0, riskLevel: 'No Data' };
    }

    const harshBraking = behaviorEvents.filter(e => e.eventType === 'HARSH_BRAKE').length;
    const harshAccel = behaviorEvents.filter(e => e.eventType === 'HARSH_ACCEL').length;
    const speeding = behaviorEvents.filter(e => e.eventType === 'SPEEDING').length;
    const idleEvents = behaviorEvents.filter(e => e.eventType === 'IDLE').length;

    let score = 100;
    score -= harshBraking * 5;
    score -= harshAccel * 3;
    score -= speeding * 2;
    score -= idleEvents * 1;
    score = Math.max(0, score);

    return {
      score: Math.round(score),
      riskLevel: score < 50 ? 'Poor' : score < 70 ? 'Fair' : score < 85 ? 'Good' : 'Excellent',
      harshBraking,
      harshAccel,
      speeding,
      idleEvents,
      totalEvents: behaviorEvents.length,
    };
  } catch (error) {
    logger.error('Error calculating driver performance score', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Calculate Trip Analysis Score (0-100)
 */
export async function calculateTripAnalysisScore(vehicleId) {
  try {
    const trips = await prisma.trip.findMany({
      where: { vehicleId },
      orderBy: { startTime: 'desc' },
      take: 20,
    });

    if (trips.length === 0) {
      return { score: 0, riskLevel: 'No Data' };
    }

    // Analyze trip patterns
    const completedTrips = trips.filter(t => t.endTime);
    const avgDuration = completedTrips.reduce((sum, t) => {
      const duration = new Date(t.endTime) - new Date(t.startTime);
      return sum + duration;
    }, 0) / completedTrips.length;

    const avgDistance = trips.reduce((sum, t) => sum + (t.distance || 0), 0) / trips.length;

    let score = 100;
    
    // Penalty for incomplete trips
    const incompleteCount = trips.length - completedTrips.length;
    score -= incompleteCount * 10;

    // Score based on trip consistency
    const distanceVariance = calculateVariance(trips.map(t => t.distance || 0));
    if (distanceVariance > avgDistance * 0.5) {
      score -= 10; // Inconsistent trip patterns
    }

    return {
      score: Math.max(0, Math.round(score)),
      riskLevel: score < 50 ? 'Poor' : score < 70 ? 'Fair' : score < 85 ? 'Good' : 'Excellent',
      totalTrips: trips.length,
      completedTrips: completedTrips.length,
      avgDuration: Math.round(avgDuration / 60000), // minutes
      avgDistance: avgDistance.toFixed(2),
    };
  } catch (error) {
    logger.error('Error calculating trip analysis score', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Calculate Risk Analysis Score (0-100)
 */
export async function calculateRiskAnalysisScore(vehicleId) {
  try {
    const [batteryHealth, engineHealth, maintenanceHealth, vehicleHealth] = await Promise.all([
      calculateBatteryHealthScore(vehicleId),
      calculateEngineHealthScore(vehicleId),
      calculateMaintenanceHealthScore(vehicleId),
      calculateVehicleHealthScore(vehicleId),
    ]);

    // Weighted risk calculation
    const riskFactors = {
      battery: batteryHealth.score < 60 ? 1 : 0,
      engine: engineHealth.score < 60 ? 1 : 0,
      maintenance: maintenanceHealth.score < 60 ? 1 : 0,
      overall: vehicleHealth.score < 60 ? 1 : 0,
    };

    const riskCount = Object.values(riskFactors).reduce((sum, val) => sum + val, 0);
    const riskScore = Math.max(0, 100 - (riskCount * 25));

    return {
      score: riskScore,
      riskLevel: riskScore < 25 ? 'Critical' : riskScore < 50 ? 'High' : riskScore < 75 ? 'Moderate' : 'Low',
      riskFactors,
      batteryHealth: batteryHealth.score,
      engineHealth: engineHealth.score,
      maintenanceHealth: maintenanceHealth.score,
      overallHealth: vehicleHealth.score,
    };
  } catch (error) {
    logger.error('Error calculating risk analysis score', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Calculate all health scores for a vehicle
 */
export async function calculateAllVehicleHealthScores(vehicleId) {
  try {
    const [
      vehicleHealth,
      batteryHealth,
      engineHealth,
      maintenanceHealth,
      fuelEfficiency,
      utilization,
      driverPerformance,
      tripAnalysis,
      riskAnalysis,
    ] = await Promise.all([
      calculateVehicleHealthScore(vehicleId),
      calculateBatteryHealthScore(vehicleId),
      calculateEngineHealthScore(vehicleId),
      calculateMaintenanceHealthScore(vehicleId),
      calculateFuelEfficiencyScore(vehicleId),
      calculateVehicleUtilizationScore(vehicleId),
      calculateDriverPerformanceScore(vehicleId),
      calculateTripAnalysisScore(vehicleId),
      calculateRiskAnalysisScore(vehicleId),
    ]);

    return {
      vehicle: vehicleHealth,
      battery: batteryHealth,
      engine: engineHealth,
      maintenance: maintenanceHealth,
      fuelEfficiency,
      utilization,
      driverPerformance,
      tripAnalysis,
      riskAnalysis,
    };
  } catch (error) {
    logger.error('Error calculating all vehicle health scores', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Helper function to calculate variance
 */
function calculateVariance(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
}
