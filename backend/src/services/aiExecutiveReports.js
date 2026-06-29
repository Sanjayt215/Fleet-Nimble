/**
 * AI Executive Reports Generator
 * Generates comprehensive executive reports for fleet operations
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { calculateFleetHealthScore } from './aiAnalysisEngine.js';
import { getBusinessAnalytics } from './aiBusinessAnalytics.js';
import { getAllPredictions } from './aiPredictions.js';
import { calculateAllVehicleHealthScores } from './aiAnalysisEngine.js';

/**
 * Generate Fleet Health Report
 */
export async function generateFleetHealthReport(userId) {
  try {
    const fleetHealth = await calculateFleetHealthScore(userId);
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      include: {
        alerts: { where: { read: false } },
        dtcCodes: { where: { active: true } },
      },
    });

    const vehicleHealthScores = await Promise.all(
      vehicles.map(v => calculateVehicleHealthScore(v.id))
    );

    return {
      reportType: 'Fleet Health Report',
      generatedAt: new Date().toISOString(),
      summary: {
        fleetHealthScore: fleetHealth.score,
        riskLevel: fleetHealth.riskLevel,
        totalVehicles: fleetHealth.vehicleCount,
        onlineVehicles: vehicles.filter(v => v.telemetryOnline).length,
        offlineVehicles: fleetHealth.offlineCount,
        criticalAlerts: fleetHealth.criticalAlerts,
        activeDTCs: fleetHealth.activeDTCs,
        overdueMaintenance: fleetHealth.overdueMaintenance,
      },
      vehicleBreakdown: vehicleHealthScores.map((score, idx) => ({
        vehicle: `${vehicles[idx].make} ${vehicles[idx].model}`,
        plate: vehicles[idx].plateNumber || vehicles[idx].vin,
        healthScore: score.score,
        riskLevel: score.riskLevel,
        alertCount: score.alertCount,
        dtcCount: score.dtcCount,
      })),
      recommendations: generateHealthRecommendations(fleetHealth),
    };
  } catch (error) {
    logger.error('Error generating fleet health report', { userId, error: error.message });
    throw error;
  }
}

/**
 * Generate Fuel Report
 */
export async function generateFuelReport(userId, days = 30) {
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

    const trips = await prisma.trip.findMany({
      where: {
        vehicle: { userId, deletedAt: null },
        startTime: { gte: startDate },
      },
      include: {
        vehicle: true,
      },
    });

    const totalFuel = fuelLogs.reduce((sum, log) => sum + (log.litersAdded || 0), 0);
    const totalDistance = trips.reduce((sum, t) => sum + (t.distance || 0), 0);
    const avgFuelEfficiency = totalDistance > 0 ? (totalDistance / totalFuel) : 0;
    const totalFuelCost = totalFuel * 1.5; // Assuming $1.50 per liter

    // Per vehicle breakdown
    const vehicleFuelData = {};
    trips.forEach(trip => {
      const vehicleId = trip.vehicleId;
      if (!vehicleFuelData[vehicleId]) {
        vehicleFuelData[vehicleId] = {
          vehicle: `${trip.vehicle.make} ${trip.vehicle.model}`,
          plate: trip.vehicle.plateNumber || trip.vehicle.vin,
          distance: 0,
          fuelConsumption: 0,
          tripCount: 0,
        };
      }
      vehicleFuelData[vehicleId].distance += trip.distance || 0;
      vehicleFuelData[vehicleId].fuelConsumption += trip.fuelConsumption || 0;
      vehicleFuelData[vehicleId].tripCount++;
    });

    const vehicleBreakdown = Object.values(vehicleFuelData).map(data => ({
      ...data,
      efficiency: data.fuelConsumption > 0 ? (data.distance / data.fuelConsumption).toFixed(2) : 0,
    }));

    vehicleBreakdown.sort((a, b) => parseFloat(b.efficiency) - parseFloat(a.efficiency));

    return {
      reportType: 'Fuel Report',
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString(),
      summary: {
        totalFuel: totalFuel.toFixed(2),
        totalDistance: totalDistance.toFixed(2),
        avgFuelEfficiency: avgFuelEfficiency.toFixed(2),
        totalFuelCost: totalFuelCost.toFixed(2),
        fuelLogCount: fuelLogs.length,
        tripCount: trips.length,
      },
      vehicleBreakdown,
      recommendations: generateFuelRecommendations(avgFuelEfficiency),
    };
  } catch (error) {
    logger.error('Error generating fuel report', { userId, error: error.message });
    throw error;
  }
}

/**
 * Generate Maintenance Report
 */
export async function generateMaintenanceReport(userId) {
  try {
    const maintenanceLogs = await prisma.maintenanceLog.findMany({
      where: {
        vehicle: { userId, deletedAt: null },
        completed: false,
      },
      include: {
        vehicle: true,
      },
      orderBy: { dueDate: 'asc' },
    });

    const completedMaintenance = await prisma.maintenanceLog.findMany({
      where: {
        vehicle: { userId, deletedAt: null },
        completed: true,
        completedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      include: {
        vehicle: true,
      },
    });

    const now = new Date();
    const overdue = maintenanceLogs.filter(m => new Date(m.dueDate) < now);
    const dueThisWeek = maintenanceLogs.filter(m => {
      const dueDate = new Date(m.dueDate);
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return dueDate >= now && dueDate <= weekFromNow;
    });
    const dueThisMonth = maintenanceLogs.filter(m => {
      const dueDate = new Date(m.dueDate);
      const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      return dueDate >= now && dueDate <= monthFromNow;
    });

    const totalEstimatedCost = maintenanceLogs.reduce((sum, m) => sum + (m.estimatedCost || 0), 0);

    return {
      reportType: 'Maintenance Report',
      generatedAt: new Date().toISOString(),
      summary: {
        pendingMaintenance: maintenanceLogs.length,
        overdueCount: overdue.length,
        dueThisWeek: dueThisWeek.length,
        dueThisMonth: dueThisMonth.length,
        completedThisMonth: completedMaintenance.length,
        totalEstimatedCost: totalEstimatedCost.toFixed(2),
      },
      pendingItems: maintenanceLogs.map(log => ({
        vehicle: `${log.vehicle.make} ${log.vehicle.model}`,
        plate: log.vehicle.plateNumber || log.vehicle.vin,
        type: log.type,
        dueDate: log.dueDate,
        priority: log.priority,
        estimatedCost: log.estimatedCost || 0,
        isOverdue: new Date(log.dueDate) < now,
      })),
      completedItems: completedMaintenance.map(log => ({
        vehicle: `${log.vehicle.make} ${log.vehicle.model}`,
        type: log.type,
        completedAt: log.completedAt,
        actualCost: log.actualCost || log.estimatedCost || 0,
      })),
      recommendations: generateMaintenanceRecommendations(overdue.length, dueThisWeek.length),
    };
  } catch (error) {
    logger.error('Error generating maintenance report', { userId, error: error.message });
    throw error;
  }
}

/**
 * Generate Battery Report
 */
export async function generateBatteryReport(userId) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
    });

    const batteryHealthScores = await Promise.all(
      vehicles.map(v => calculateBatteryHealthScore(v.id))
    );

    const criticalBatteries = batteryHealthScores.filter(b => b.score < 40);
    const warningBatteries = batteryHealthScores.filter(b => b.score >= 40 && b.score < 60);

    return {
      reportType: 'Battery Health Report',
      generatedAt: new Date().toISOString(),
      summary: {
        totalVehicles: vehicles.length,
        criticalCount: criticalBatteries.length,
        warningCount: warningBatteries.length,
        healthyCount: batteryHealthScores.filter(b => b.score >= 60).length,
      },
      vehicleBreakdown: batteryHealthScores.map((score, idx) => ({
        vehicle: `${vehicles[idx].make} ${vehicles[idx].model}`,
        plate: vehicles[idx].plateNumber || vehicles[idx].vin,
        healthScore: score.score,
        riskLevel: score.riskLevel,
        avgVoltage: score.avgVoltage,
        minVoltage: score.minVoltage,
      })),
      recommendations: generateBatteryRecommendations(criticalBatteries.length, warningBatteries.length),
    };
  } catch (error) {
    logger.error('Error generating battery report', { userId, error: error.message });
    throw error;
  }
}

/**
 * Generate Vehicle Report
 */
export async function generateVehicleReport(userId, vehicleId = null) {
  try {
    const vehicles = vehicleId 
      ? [await prisma.vehicle.findFirst({ where: { id: vehicleId, userId, deletedAt: null } })]
      : await prisma.vehicle.findMany({ where: { userId, deletedAt: null } });

    if (vehicles.length === 0 || !vehicles[0]) {
      throw new Error('No vehicles found');
    }

    const vehicleReports = await Promise.all(
      vehicles.map(async (vehicle) => {
        const healthScores = await calculateAllVehicleHealthScores(vehicle.id);
        const predictions = await getAllPredictions(vehicle.id);
        const trips = await prisma.trip.findMany({
          where: { vehicleId: vehicle.id },
          orderBy: { startTime: 'desc' },
          take: 20,
        });

        const totalDistance = trips.reduce((sum, t) => sum + (t.distance || 0), 0);

        return {
          vehicle: `${vehicle.make} ${vehicle.model}`,
          plate: vehicle.plateNumber || vehicle.vin,
          odometer: vehicle.odometer,
          healthScores,
          predictions,
          tripSummary: {
            totalTrips: trips.length,
            totalDistance: totalDistance.toFixed(2),
            avgDistance: trips.length > 0 ? (totalDistance / trips.length).toFixed(2) : 0,
          },
        };
      })
    );

    return {
      reportType: 'Vehicle Report',
      generatedAt: new Date().toISOString(),
      vehicles: vehicleReports,
    };
  } catch (error) {
    logger.error('Error generating vehicle report', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Generate Trip Report
 */
export async function generateTripReport(userId, days = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const trips = await prisma.trip.findMany({
      where: {
        vehicle: { userId, deletedAt: null },
        startTime: { gte: startDate },
      },
      include: {
        vehicle: true,
      },
      orderBy: { startTime: 'desc' },
    });

    const totalTrips = trips.length;
    const totalDistance = trips.reduce((sum, t) => sum + (t.distance || 0), 0);
    const totalDuration = trips.reduce((sum, t) => {
      if (t.endTime) {
        return sum + (new Date(t.endTime) - new Date(t.startTime));
      }
      return sum;
    }, 0);

    const avgDistance = totalTrips > 0 ? totalDistance / totalTrips : 0;
    const avgDuration = totalTrips > 0 ? totalDuration / totalTrips : 0;

    // Per vehicle breakdown
    const vehicleTripData = {};
    trips.forEach(trip => {
      const vehicleId = trip.vehicleId;
      if (!vehicleTripData[vehicleId]) {
        vehicleTripData[vehicleId] = {
          vehicle: `${trip.vehicle.make} ${trip.vehicle.model}`,
          plate: trip.vehicle.plateNumber || trip.vehicle.vin,
          tripCount: 0,
          totalDistance: 0,
          totalDuration: 0,
        };
      }
      vehicleTripData[vehicleId].tripCount++;
      vehicleTripData[vehicleId].totalDistance += trip.distance || 0;
      if (trip.endTime) {
        vehicleTripData[vehicleId].totalDuration += new Date(trip.endTime) - new Date(trip.startTime);
      }
    });

    const vehicleBreakdown = Object.values(vehicleTripData).map(data => ({
      ...data,
      avgDistance: data.tripCount > 0 ? (data.totalDistance / data.tripCount).toFixed(2) : 0,
      avgDuration: data.tripCount > 0 ? (data.totalDuration / data.tripCount / 60000).toFixed(2) : 0, // minutes
    }));

    vehicleBreakdown.sort((a, b) => b.tripCount - a.tripCount);

    return {
      reportType: 'Trip Report',
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString(),
      summary: {
        totalTrips,
        totalDistance: totalDistance.toFixed(2),
        totalDuration: (totalDuration / 3600000).toFixed(2), // hours
        avgDistance: avgDistance.toFixed(2),
        avgDuration: (avgDuration / 60000).toFixed(2), // minutes
      },
      vehicleBreakdown,
      recommendations: generateTripRecommendations(avgDistance),
    };
  } catch (error) {
    logger.error('Error generating trip report', { userId, error: error.message });
    throw error;
  }
}

/**
 * Generate comprehensive executive report
 */
export async function generateExecutiveReport(userId) {
  try {
    const [fleetHealth, fuelReport, maintenanceReport, batteryReport, businessAnalytics] = await Promise.all([
      generateFleetHealthReport(userId),
      generateFuelReport(userId),
      generateMaintenanceReport(userId),
      generateBatteryReport(userId),
      getBusinessAnalytics(userId, 30),
    ]);

    return {
      reportType: 'Comprehensive Executive Report',
      generatedAt: new Date().toISOString(),
      executiveSummary: {
        fleetHealthScore: fleetHealth.summary.fleetHealthScore,
        fleetRiskLevel: fleetHealth.summary.riskLevel,
        totalVehicles: fleetHealth.summary.totalVehicles,
        fleetUtilization: businessAnalytics.utilization.utilization,
        vehicleAvailability: businessAnalytics.availability.availability,
        totalFuelCost: fuelReport.summary.totalFuelCost,
        totalMaintenanceCost: maintenanceReport.summary.totalEstimatedCost,
      },
      fleetHealth: fleetHealth,
      fuel: fuelReport,
      maintenance: maintenanceReport,
      battery: batteryReport,
      businessAnalytics,
      keyRecommendations: [
        ...fleetHealth.recommendations,
        ...fuelReport.recommendations,
        ...maintenanceReport.recommendations,
        ...batteryReport.recommendations,
      ],
    };
  } catch (error) {
    logger.error('Error generating executive report', { userId, error: error.message });
    throw error;
  }
}

// Helper functions for recommendations
function generateHealthRecommendations(fleetHealth) {
  const recommendations = [];
  if (fleetHealth.score < 50) {
    recommendations.push('Critical: Immediate action required for fleet health');
  }
  if (fleetHealth.offlineCount > 0) {
    recommendations.push(`Address ${fleetHealth.offlineCount} offline vehicles`);
  }
  if (fleetHealth.criticalAlerts > 0) {
    recommendations.push(`Resolve ${fleetHealth.criticalAlerts} critical alerts`);
  }
  if (fleetHealth.overdueMaintenance > 0) {
    recommendations.push(`Complete ${fleetHealth.overdueMaintenance} overdue maintenance items`);
  }
  return recommendations;
}

function generateFuelRecommendations(avgEfficiency) {
  const recommendations = [];
  if (avgEfficiency < 10) {
    recommendations.push('Fuel efficiency is below optimal - consider driver training');
  } else if (avgEfficiency < 15) {
    recommendations.push('Monitor fuel efficiency and optimize routes');
  }
  return recommendations;
}

function generateMaintenanceRecommendations(overdueCount, dueThisWeekCount) {
  const recommendations = [];
  if (overdueCount > 0) {
    recommendations.push(`Complete ${overdueCount} overdue maintenance items immediately`);
  }
  if (dueThisWeekCount > 0) {
    recommendations.push(`Schedule ${dueThisWeekCount} maintenance items due this week`);
  }
  return recommendations;
}

function generateBatteryRecommendations(criticalCount, warningCount) {
  const recommendations = [];
  if (criticalCount > 0) {
    recommendations.push(`Replace ${criticalCount} critical batteries immediately`);
  }
  if (warningCount > 0) {
    recommendations.push(`Monitor ${warningCount} batteries with warning status`);
  }
  return recommendations;
}

function generateTripRecommendations(avgDistance) {
  const recommendations = [];
  if (avgDistance < 20) {
    recommendations.push('Consider route optimization to increase trip efficiency');
  }
  return recommendations;
}

// Import needed helper
async function calculateBatteryHealthScore(vehicleId) {
  const telemetry = await prisma.obdLiveData.findMany({
    where: { vehicleId },
    orderBy: { recordedAt: 'desc' },
    take: 10,
  });

  if (telemetry.length === 0) {
    return { score: 0, riskLevel: 'No Data', avgVoltage: null, minVoltage: null };
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
}

async function calculateVehicleHealthScore(vehicleId) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId },
    include: {
      alerts: { where: { read: false } },
      dtcCodes: { where: { active: true } },
      maintenanceLogs: { where: { completed: false } },
    },
  });

  if (!vehicle) {
    return { score: 0, riskLevel: 'No Data', alertCount: 0, dtcCount: 0 };
  }

  let score = 100;
  if (!vehicle.telemetryOnline) score -= 30;
  score -= vehicle.alerts.filter(a => a.severity === 'CRITICAL').length * 15;
  score -= vehicle.alerts.filter(a => a.severity === 'HIGH').length * 10;
  score -= vehicle.dtcCodes.length * 5;

  const overdue = vehicle.maintenanceLogs.filter(m => new Date(m.dueDate) < new Date());
  score -= overdue.length * 10;

  return {
    score: Math.max(0, score),
    riskLevel: score < 50 ? 'Critical' : score < 70 ? 'High' : score < 85 ? 'Moderate' : 'Good',
    alertCount: vehicle.alerts.length,
    dtcCount: vehicle.dtcCodes.length,
  };
}
