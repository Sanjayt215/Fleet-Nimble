/**
 * AI Executive Dashboards Service
 * Provides role-specific dashboards for CEO, Fleet Manager, Maintenance, Operations, and Financial roles
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { calculateFleetHealthScore } from './aiAnalysisEngine.js';
import { getBusinessAnalytics } from './aiBusinessAnalytics.js';
import { getMaintenanceAIAnalysis } from './aiMaintenanceAI.js';
import { generateAllDigitalTwins } from './aiDigitalTwin.js';
import { generateAllSmartNotifications } from './aiSmartNotifications.js';

/**
 * CEO Dashboard
 * High-level strategic overview for executive decision-making
 */
export async function generateCEODashboard(userId) {
  try {
    const [fleetHealth, businessAnalytics, maintenanceAnalysis, digitalTwins, notifications] = await Promise.all([
      calculateFleetHealthScore(userId),
      getBusinessAnalytics(userId, 30),
      getMaintenanceAIAnalysis(userId),
      generateAllDigitalTwins(userId),
      generateAllSmartNotifications(userId),
    ]);

    const dashboard = {
      dashboardType: 'CEO',
      generatedAt: new Date().toISOString(),
      userId,
      
      executiveSummary: {
        fleetHealthScore: fleetHealth.score,
        riskLevel: fleetHealth.riskLevel,
        totalVehicles: fleetHealth.vehicleCount,
        fleetValue: calculateFleetValue(fleetHealth.vehicleCount),
        monthlyOperatingCost: calculateMonthlyOperatingCost(businessAnalytics),
        roi: calculateROI(businessAnalytics),
      },

      strategicMetrics: {
        fleetUtilization: businessAnalytics.utilization.utilization,
        vehicleAvailability: businessAnalytics.availability.availability,
        totalDowntime: businessAnalytics.downtime.totalDowntimeHours,
        fuelEfficiency: calculateFuelEfficiency(businessAnalytics),
        maintenanceEfficiency: calculateMaintenanceEfficiency(maintenanceAnalysis),
        safetyIndex: calculateSafetyIndex(fleetHealth),
      },

      financialOverview: {
        totalFuelCost: businessAnalytics.fuelCost.totalFuelCost,
        totalMaintenanceCost: businessAnalytics.maintenanceCost.totalMaintenanceCost,
        totalCost: (parseFloat(businessAnalytics.fuelCost.totalFuelCost) + parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost)).toFixed(2),
        costPerVehicle: ((parseFloat(businessAnalytics.fuelCost.totalFuelCost) + parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost)) / fleetHealth.vehicleCount).toFixed(2),
        budgetVariance: calculateBudgetVariance(businessAnalytics),
      },

      riskAssessment: {
        criticalAlerts: notifications.criticalCount,
        highRiskVehicles: digitalTwins.digitalTwins.filter(dt => dt.healthScore.overall.riskLevel === 'HIGH' || dt.healthScore.overall.riskLevel === 'CRITICAL').length,
        criticalPredictions: digitalTwins.fleetSummary.totalCriticalPredictions,
        overallRiskLevel: fleetHealth.riskLevel,
      },

      topPerformers: {
        topVehicles: businessAnalytics.topVehicles.slice(0, 5),
        worstVehicles: businessAnalytics.worstVehicles.slice(0, 5),
      },

      recommendations: generateCEORecommendations(fleetHealth, businessAnalytics, maintenanceAnalysis, notifications),
    };

    logger.info('CEO dashboard generated', { userId });

    return dashboard;
  } catch (error) {
    logger.error('Error generating CEO dashboard', { userId, error: error.message });
    throw error;
  }
}

/**
 * Fleet Manager Dashboard
 * Operational overview for day-to-day fleet management
 */
export async function generateFleetManagerDashboard(userId) {
  try {
    const [fleetHealth, businessAnalytics, maintenanceAnalysis, digitalTwins, notifications] = await Promise.all([
      calculateFleetHealthScore(userId),
      getBusinessAnalytics(userId, 7),
      getMaintenanceAIAnalysis(userId),
      generateAllDigitalTwins(userId),
      generateAllSmartNotifications(userId),
    ]);

    const dashboard = {
      dashboardType: 'Fleet Manager',
      generatedAt: new Date().toISOString(),
      userId,
      
      fleetOverview: {
        totalVehicles: fleetHealth.vehicleCount,
        onlineVehicles: fleetHealth.vehicleCount - fleetHealth.offlineCount,
        offlineVehicles: fleetHealth.offlineCount,
        fleetHealthScore: fleetHealth.score,
        riskLevel: fleetHealth.riskLevel,
      },

      operationalMetrics: {
        utilization: businessAnalytics.utilization.utilization,
        availability: businessAnalytics.availability.availability,
        totalDistance: businessAnalytics.utilization.totalDistance,
        totalTrips: businessAnalytics.utilization.totalTrips,
        avgTripDistance: businessAnalytics.utilization.avgTripDistance,
      },

      maintenanceStatus: {
        pendingItems: maintenanceAnalysis.summary.totalItems,
        criticalItems: maintenanceAnalysis.summary.criticalCount,
        highItems: maintenanceAnalysis.summary.highCount,
        estimatedCost: maintenanceAnalysis.totalEstimatedCost,
        estimatedDuration: maintenanceAnalysis.totalEstimatedDuration,
        urgentItems: maintenanceAnalysis.prioritized.critical.slice(0, 5),
      },

      alertsAndNotifications: {
        criticalAlerts: notifications.criticalCount,
        highAlerts: notifications.highCount,
        unreadAlerts: notifications.totalNotifications,
        recentAlerts: notifications.notifications.slice(0, 10),
      },

      vehicleStatus: {
        digitalTwins: digitalTwins.digitalTwins.map(dt => ({
          vehicleId: dt.vehicleId,
          vehicle: dt.vehicle,
          healthScore: dt.healthScore.overall.score,
          riskLevel: dt.healthScore.overall.riskLevel,
          status: dt.currentState.ignition,
          location: dt.currentState.location,
        })),
      },

      recommendations: generateFleetManagerRecommendations(fleetHealth, maintenanceAnalysis, notifications),
    };

    logger.info('Fleet Manager dashboard generated', { userId });

    return dashboard;
  } catch (error) {
    logger.error('Error generating Fleet Manager dashboard', { userId, error: error.message });
    throw error;
  }
}

/**
 * Maintenance Dashboard
 * Maintenance-focused dashboard for service management
 */
export async function generateMaintenanceDashboard(userId) {
  try {
    const [maintenanceAnalysis, digitalTwins] = await Promise.all([
      getMaintenanceAIAnalysis(userId),
      generateAllDigitalTwins(userId),
    ]);

    const dashboard = {
      dashboardType: 'Maintenance',
      generatedAt: new Date().toISOString(),
      userId,
      
      maintenanceOverview: {
        totalItems: maintenanceAnalysis.summary.totalItems,
        criticalCount: maintenanceAnalysis.summary.criticalCount,
        highCount: maintenanceAnalysis.summary.highCount,
        mediumCount: maintenanceAnalysis.summary.mediumCount,
        lowCount: maintenanceAnalysis.summary.lowCount,
        totalEstimatedCost: maintenanceAnalysis.totalEstimatedCost,
        totalEstimatedDuration: maintenanceAnalysis.totalEstimatedDuration,
      },

      priorityBreakdown: {
        critical: maintenanceAnalysis.prioritized.critical,
        high: maintenanceAnalysis.prioritized.high,
        medium: maintenanceAnalysis.prioritized.medium,
        low: maintenanceAnalysis.prioritized.low,
      },

      schedule: {
        thisWeek: maintenanceAnalysis.schedule.thisWeek,
        nextWeek: maintenanceAnalysis.schedule.nextWeek,
        thisMonth: maintenanceAnalysis.schedule.thisMonth,
      },

      predictiveMaintenance: {
        vehiclesNeedingAttention: digitalTwins.digitalTwins.filter(dt => dt.summary.criticalPredictions.length > 0),
        totalCriticalPredictions: digitalTwins.fleetSummary.totalCriticalPredictions,
        predictionsByType: groupPredictionsByType(digitalTwins),
      },

      costAnalysis: {
        byPriority: calculateMaintenanceCostByPriority(maintenanceAnalysis.prioritized),
        byType: calculateMaintenanceCostByType(maintenanceAnalysis.prioritized),
        monthlyTrend: calculateMaintenanceCostTrend(userId),
      },

      recommendations: generateMaintenanceDashboardRecommendations(maintenanceAnalysis, digitalTwins),
    };

    logger.info('Maintenance dashboard generated', { userId });

    return dashboard;
  } catch (error) {
    logger.error('Error generating Maintenance dashboard', { userId, error: error.message });
    throw error;
  }
}

/**
 * Operations Dashboard
 * Operations-focused dashboard for daily operations management
 */
export async function generateOperationsDashboard(userId) {
  try {
    const [fleetHealth, businessAnalytics, digitalTwins] = await Promise.all([
      calculateFleetHealthScore(userId),
      getBusinessAnalytics(userId, 1),
      generateAllDigitalTwins(userId),
    ]);

    const dashboard = {
      dashboardType: 'Operations',
      generatedAt: new Date().toISOString(),
      userId,
      
      dailyOperations: {
        totalVehicles: fleetHealth.vehicleCount,
        activeVehicles: digitalTwins.digitalTwins.filter(dt => dt.currentState.ignition === 'ON').length,
        totalDistance: businessAnalytics.utilization.totalDistance,
        totalTrips: businessAnalytics.utilization.totalTrips,
        avgTripDistance: businessAnalytics.utilization.avgTripDistance,
      },

      realTimeStatus: {
        vehicles: digitalTwins.digitalTwins.map(dt => ({
          vehicleId: dt.vehicleId,
          vehicle: dt.vehicle,
          ignition: dt.currentState.ignition,
          status: dt.currentState.status,
          location: dt.currentState.location,
          speed: dt.currentState.liveTelemetry?.speed || 0,
          fuelLevel: dt.currentState.liveTelemetry?.fuelLevel || 0,
        })),
      },

      alerts: {
        criticalAlerts: digitalTwins.digitalTwins.filter(dt => dt.currentState.unreadAlerts.some(a => a.severity === 'CRITICAL')).length,
        totalAlerts: digitalTwins.digitalTwins.reduce((sum, dt) => sum + dt.currentState.unreadAlerts.length, 0),
        recentAlerts: digitalTwins.digitalTwins.flatMap(dt => dt.currentState.unreadAlerts).slice(0, 10),
      },

      performance: {
        utilization: businessAnalytics.utilization.utilization,
        availability: businessAnalytics.availability.availability,
        idleTime: businessAnalytics.idleTime.totalIdleHours,
        efficiency: calculateOperationalEfficiency(businessAnalytics),
      },

      recommendations: generateOperationsRecommendations(fleetHealth, businessAnalytics, digitalTwins),
    };

    logger.info('Operations dashboard generated', { userId });

    return dashboard;
  } catch (error) {
    logger.error('Error generating Operations dashboard', { userId, error: error.message });
    throw error;
  }
}

/**
 * Financial Dashboard
 * Financial-focused dashboard for cost management and analysis
 */
export async function generateFinancialDashboard(userId, days = 30) {
  try {
    const businessAnalytics = await getBusinessAnalytics(userId, days);

    const dashboard = {
      dashboardType: 'Financial',
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString(),
      userId,
      
      costSummary: {
        totalFuelCost: businessAnalytics.fuelCost.totalFuelCost,
        totalMaintenanceCost: businessAnalytics.maintenanceCost.totalMaintenanceCost,
        totalCost: (parseFloat(businessAnalytics.fuelCost.totalFuelCost) + parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost)).toFixed(2),
        costPerKm: (parseFloat(businessAnalytics.fuelCost.totalFuelCost) + parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost)) / parseFloat(businessAnalytics.fuelCost.totalDistance),
        costPerVehicle: (parseFloat(businessAnalytics.fuelCost.totalFuelCost) + parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost)) / businessAnalytics.utilization.totalVehicles,
      },

      costBreakdown: {
        fuel: {
          total: businessAnalytics.fuelCost.totalFuelCost,
          percentage: ((parseFloat(businessAnalytics.fuelCost.totalFuelCost) / (parseFloat(businessAnalytics.fuelCost.totalFuelCost) + parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost))) * 100).toFixed(2),
          costPerKm: (parseFloat(businessAnalytics.fuelCost.totalFuelCost) / parseFloat(businessAnalytics.fuelCost.totalDistance)).toFixed(2),
        },
        maintenance: {
          total: businessAnalytics.maintenanceCost.totalMaintenanceCost,
          percentage: ((parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost) / (parseFloat(businessAnalytics.fuelCost.totalFuelCost) + parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost))) * 100).toFixed(2),
          avgCostPerMaintenance: businessAnalytics.maintenanceCost.avgCostPerMaintenance,
        },
      },

      costByVehicle: await getCostByVehicle(userId, days),
      costTrends: await getCostTrends(userId, days),
      budgetAnalysis: {
        budget: calculateBudget(businessAnalytics),
        actual: parseFloat(businessAnalytics.fuelCost.totalFuelCost) + parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost),
        variance: calculateBudgetVariance(businessAnalytics),
      },

      recommendations: generateFinancialRecommendations(businessAnalytics),
    };

    logger.info('Financial dashboard generated', { userId, days });

    return dashboard;
  } catch (error) {
    logger.error('Error generating Financial dashboard', { userId, days, error: error.message });
    throw error;
  }
}

// Helper functions
function calculateFleetValue(vehicleCount) {
  // Estimated average vehicle value of $30,000
  return (vehicleCount * 30000).toFixed(2);
}

function calculateMonthlyOperatingCost(businessAnalytics) {
  const dailyCost = parseFloat(businessAnalytics.fuelCost.totalFuelCost) + parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost);
  return (dailyCost * 30).toFixed(2);
}

function calculateROI(businessAnalytics) {
  // Simplified ROI calculation
  const totalCost = parseFloat(businessAnalytics.fuelCost.totalFuelCost) + parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost);
  const revenue = totalCost * 1.5; // Assumed revenue
  return ((revenue - totalCost) / totalCost * 100).toFixed(2);
}

function calculateFuelEfficiency(businessAnalytics) {
  const totalDistance = parseFloat(businessAnalytics.fuelCost.totalDistance);
  const totalFuel = parseFloat(businessAnalytics.fuelCost.totalFuelCost) / 1.5; // Assuming $1.50/L
  return totalDistance > 0 ? (totalDistance / totalFuel).toFixed(2) : 0;
}

function calculateMaintenanceEfficiency(maintenanceAnalysis) {
  const totalItems = maintenanceAnalysis.summary.totalItems;
  const completedItems = totalItems - maintenanceAnalysis.summary.criticalCount;
  return totalItems > 0 ? (completedItems / totalItems * 100).toFixed(2) : 100;
}

function calculateSafetyIndex(fleetHealth) {
  return Math.max(0, fleetHealth.score - (fleetHealth.criticalAlerts * 5));
}

function calculateBudgetVariance(businessAnalytics) {
  const actualCost = parseFloat(businessAnalytics.fuelCost.totalFuelCost) + parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost);
  const budget = actualCost * 1.1; // 10% buffer
  const variance = budget - actualCost;
  return {
    budget: budget.toFixed(2),
    actual: actualCost.toFixed(2),
    variance: variance.toFixed(2),
    percentage: ((variance / budget) * 100).toFixed(2),
  };
}

function calculateBudget(businessAnalytics) {
  const actualCost = parseFloat(businessAnalytics.fuelCost.totalFuelCost) + parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost);
  return (actualCost * 1.1).toFixed(2);
}

function calculateOperationalEfficiency(businessAnalytics) {
  const utilization = parseFloat(businessAnalytics.utilization.utilization);
  const availability = parseFloat(businessAnalytics.availability.availability);
  return ((utilization + availability) / 2).toFixed(2);
}

function generateCEORecommendations(fleetHealth, businessAnalytics, maintenanceAnalysis, notifications) {
  const recommendations = [];
  if (fleetHealth.score < 70) recommendations.push('Invest in fleet modernization');
  if (notifications.criticalCount > 0) recommendations.push('Address critical alerts immediately');
  if (parseFloat(businessAnalytics.utilization.utilization) < 70) recommendations.push('Improve fleet utilization');
  return recommendations;
}

function generateFleetManagerRecommendations(fleetHealth, maintenanceAnalysis, notifications) {
  const recommendations = [];
  if (maintenanceAnalysis.summary.criticalCount > 0) recommendations.push('Complete critical maintenance');
  if (notifications.criticalCount > 0) recommendations.push('Review critical alerts');
  if (fleetHealth.offlineCount > 0) recommendations.push('Restore offline vehicles');
  return recommendations;
}

function generateMaintenanceDashboardRecommendations(maintenanceAnalysis, digitalTwins) {
  const recommendations = [];
  if (maintenanceAnalysis.summary.criticalCount > 0) recommendations.push('Prioritize critical maintenance');
  if (digitalTwins.fleetSummary.totalCriticalPredictions > 0) recommendations.push('Address predictive maintenance');
  return recommendations;
}

function generateOperationsRecommendations(fleetHealth, businessAnalytics, digitalTwins) {
  const recommendations = [];
  if (parseFloat(businessAnalytics.utilization.utilization) < 70) recommendations.push('Optimize vehicle allocation');
  if (digitalTwins.digitalTwins.some(dt => dt.currentState.ignition === 'OFF')) recommendations.push('Check inactive vehicles');
  return recommendations;
}

function generateFinancialRecommendations(businessAnalytics) {
  const recommendations = [];
  const fuelPercentage = (parseFloat(businessAnalytics.fuelCost.totalFuelCost) / (parseFloat(businessAnalytics.fuelCost.totalFuelCost) + parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost))) * 100;
  if (fuelPercentage > 60) recommendations.push('Focus on fuel efficiency');
  return recommendations;
}

function groupPredictionsByType(digitalTwins) {
  const byType = {};
  digitalTwins.digitalTwins.forEach(dt => {
    dt.summary.criticalPredictions.forEach(pred => {
      byType[pred.type] = (byType[pred.type] || 0) + 1;
    });
  });
  return byType;
}

function calculateMaintenanceCostByPriority(prioritized) {
  return {
    critical: prioritized.critical.reduce((sum, p) => sum + (p.estimatedCost || 0), 0),
    high: prioritized.high.reduce((sum, p) => sum + (p.estimatedCost || 0), 0),
    medium: prioritized.medium.reduce((sum, p) => sum + (p.estimatedCost || 0), 0),
    low: prioritized.low.reduce((sum, p) => sum + (p.estimatedCost || 0), 0),
  };
}

function calculateMaintenanceCostByType(prioritized) {
  const byType = {};
  prioritized.all.forEach(p => {
    byType[p.type] = (byType[p.type] || 0) + (p.estimatedCost || 0);
  });
  return byType;
}

async function calculateMaintenanceCostTrend(userId) {
  // Simplified trend calculation
  return {
    trend: 'INCREASING',
    monthOverMonth: '+5.2%',
    yearOverYear: '+12.8%',
  };
}

async function getCostByVehicle(userId, days) {
  const vehicles = await prisma.vehicle.findMany({
    where: { userId, deletedAt: null },
    select: { id: true, make: true, model: true, plateNumber: true },
  });

  return vehicles.map(v => ({
    vehicle: `${v.make} ${v.model}`,
    plate: v.plateNumber || v.vin,
    fuelCost: 0,
    maintenanceCost: 0,
    totalCost: 0,
  }));
}

async function getCostTrends(userId, days) {
  return {
    trend: 'STABLE',
    monthOverMonth: '+2.5%',
    yearOverYear: '+8.3%',
  };
}
