/**
 * AI Dashboard Service
 * Generates daily dashboard with summary, alerts, maintenance, business impact, KPIs, and recommended actions
 * Designed to appear automatically every morning
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { calculateFleetHealthScore } from './aiAnalysisEngine.js';
import { getMaintenanceAIAnalysis } from './aiMaintenanceAI.js';
import { getBusinessAnalytics } from './aiBusinessAnalytics.js';
import { getAllPredictions } from './aiPredictions.js';

/**
 * Generate daily AI Dashboard
 */
export async function generateDailyDashboard(userId) {
  try {
    const [fleetHealth, maintenanceAnalysis, businessAnalytics, criticalAlerts, predictions] = await Promise.all([
      calculateFleetHealthScore(userId),
      getMaintenanceAIAnalysis(userId),
      getBusinessAnalytics(userId, 1), // Last 1 day
      getCriticalAlerts(userId),
      getTopPredictions(userId),
    ]);

    const dashboard = {
      date: new Date().toISOString().split('T')[0],
      generatedAt: new Date().toISOString(),
      userId,
      
      dailySummary: {
        fleetHealthScore: fleetHealth.score,
        riskLevel: fleetHealth.riskLevel,
        totalVehicles: fleetHealth.vehicleCount,
        onlineVehicles: fleetHealth.vehicleCount - fleetHealth.offlineCount,
        offlineVehicles: fleetHealth.offlineCount,
        overallStatus: getOverallStatus(fleetHealth.score),
      },

      criticalAlerts: {
        count: criticalAlerts.length,
        alerts: criticalAlerts.slice(0, 5),
        requiresImmediateAction: criticalAlerts.length > 0,
      },

      pendingMaintenance: {
        totalItems: maintenanceAnalysis.summary.totalItems,
        criticalCount: maintenanceAnalysis.summary.criticalCount,
        highCount: maintenanceAnalysis.summary.highCount,
        mediumCount: maintenanceAnalysis.summary.mediumCount,
        lowCount: maintenanceAnalysis.summary.lowCount,
        totalEstimatedCost: maintenanceAnalysis.totalEstimatedCost,
        totalEstimatedDuration: maintenanceAnalysis.totalEstimatedDuration,
        urgentItems: maintenanceAnalysis.prioritized.critical.slice(0, 3),
      },

      businessImpact: {
        fleetUtilization: businessAnalytics.utilization.utilization,
        vehicleAvailability: businessAnalytics.availability.availability,
        totalDowntime: businessAnalytics.downtime.totalDowntimeHours,
        totalFuelCost: businessAnalytics.fuelCost.totalFuelCost,
        totalMaintenanceCost: businessAnalytics.maintenanceCost.totalMaintenanceCost,
        idleTime: businessAnalytics.idleTime.totalIdleHours,
        operationalRisk: calculateOperationalRisk(fleetHealth, businessAnalytics),
      },

      fleetKPIs: {
        healthScore: fleetHealth.score,
        utilization: parseFloat(businessAnalytics.utilization.utilization),
        availability: parseFloat(businessAnalytics.availability.availability),
        fuelEfficiency: calculateFuelEfficiencyKPI(businessAnalytics.fuelCost),
        maintenanceCost: parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost),
        downtimeHours: parseFloat(businessAnalytics.downtime.totalDowntimeHours),
        activeAlerts: fleetHealth.criticalAlerts,
        activeDTCs: fleetHealth.activeDTCs,
      },

      recommendedActions: generateRecommendedActions(
        fleetHealth,
        maintenanceAnalysis,
        criticalAlerts,
        predictions,
        businessAnalytics
      ),

      topPredictions: predictions.slice(0, 3),

      topPerformingVehicles: businessAnalytics.topVehicles.slice(0, 3),
      worstPerformingVehicles: businessAnalytics.worstVehicles.slice(0, 3),
    };

    logger.info('Daily dashboard generated', { userId, date: dashboard.date });

    return dashboard;
  } catch (error) {
    logger.error('Error generating daily dashboard', { userId, error: error.message });
    throw error;
  }
}

/**
 * Get critical alerts
 */
async function getCriticalAlerts(userId) {
  const alerts = await prisma.alert.findMany({
    where: {
      vehicle: { userId, deletedAt: null },
      severity: 'CRITICAL',
      read: false,
    },
    include: {
      vehicle: {
        select: {
          make: true,
          model: true,
          plateNumber: true,
          vin: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return alerts.map(alert => ({
    id: alert.id,
    vehicle: `${alert.vehicle.make} ${alert.vehicle.model}`,
    plate: alert.vehicle.plateNumber || alert.vehicle.vin,
    message: alert.message,
    type: alert.type,
    createdAt: alert.createdAt,
  }));
}

/**
 * Get top predictions
 */
async function getTopPredictions(userId) {
  const vehicles = await prisma.vehicle.findMany({
    where: { userId, deletedAt: null },
    select: { id: true },
  });

  const allPredictions = [];
  
  for (const vehicle of vehicles) {
    try {
      const predictions = await getAllPredictions(vehicle.id);
      const criticalPredictions = Object.entries(predictions)
        .filter(([key, pred]) => pred.confidence > 70 && pred.prediction.toLowerCase().includes('critical'))
        .map(([key, pred]) => ({
          type: key,
          ...pred,
          vehicleId: vehicle.id,
        }));
      
      allPredictions.push(...criticalPredictions);
    } catch (error) {
      // Skip vehicles with prediction errors
    }
  }

  // Sort by confidence and take top 5
  allPredictions.sort((a, b) => b.confidence - a.confidence);
  return allPredictions.slice(0, 5);
}

/**
 * Calculate overall status
 */
function getOverallStatus(healthScore) {
  if (healthScore >= 85) return 'Excellent';
  if (healthScore >= 70) return 'Good';
  if (healthScore >= 50) return 'Fair';
  if (healthScore >= 30) return 'Poor';
  return 'Critical';
}

/**
 * Calculate operational risk
 */
function calculateOperationalRisk(fleetHealth, businessAnalytics) {
  let riskScore = 0;

  // Health score impact
  if (fleetHealth.score < 50) riskScore += 30;
  else if (fleetHealth.score < 70) riskScore += 15;

  // Utilization impact
  const utilization = parseFloat(businessAnalytics.utilization.utilization);
  if (utilization < 50) riskScore += 20;
  else if (utilization < 70) riskScore += 10;

  // Availability impact
  const availability = parseFloat(businessAnalytics.availability.availability);
  if (availability < 70) riskScore += 20;
  else if (availability < 85) riskScore += 10;

  // Downtime impact
  const downtime = parseFloat(businessAnalytics.downtime.totalDowntimeHours);
  if (downtime > 24) riskScore += 20;
  else if (downtime > 8) riskScore += 10;

  // Critical alerts impact
  if (fleetHealth.criticalAlerts > 0) riskScore += fleetHealth.criticalAlerts * 5;

  if (riskScore > 70) return 'High';
  if (riskScore > 40) return 'Medium';
  return 'Low';
}

/**
 * Calculate fuel efficiency KPI
 */
function calculateFuelEfficiencyKPI(fuelCost) {
  const totalDistance = parseFloat(fuelCost.totalDistance);
  const totalCost = parseFloat(fuelCost.totalFuelCost);
  
  if (totalDistance > 0) {
    return (totalCost / totalDistance).toFixed(2);
  }
  return 0;
}

/**
 * Generate recommended actions
 */
function generateRecommendedActions(fleetHealth, maintenanceAnalysis, criticalAlerts, predictions, businessAnalytics) {
  const actions = [];

  // Critical alerts
  if (criticalAlerts.length > 0) {
    actions.push({
      priority: 'CRITICAL',
      category: 'Alerts',
      action: `Address ${criticalAlerts.length} critical alerts immediately`,
      impact: 'High',
      estimatedTime: '2-4 hours',
    });
  }

  // Critical maintenance
  if (maintenanceAnalysis.summary.criticalCount > 0) {
    actions.push({
      priority: 'CRITICAL',
      category: 'Maintenance',
      action: `Complete ${maintenanceAnalysis.summary.criticalCount} critical maintenance items`,
      impact: 'High',
      estimatedTime: `${maintenanceAnalysis.totalEstimatedDuration} hours`,
      estimatedCost: `$${maintenanceAnalysis.totalEstimatedCost}`,
    });
  }

  // Offline vehicles
  if (fleetHealth.offlineCount > 0) {
    actions.push({
      priority: 'HIGH',
      category: 'Connectivity',
      action: `Restore connectivity for ${fleetHealth.offlineCount} offline vehicles`,
      impact: 'Medium',
      estimatedTime: '1-2 hours',
    });
  }

  // High maintenance
  if (maintenanceAnalysis.summary.highCount > 0) {
    actions.push({
      priority: 'HIGH',
      category: 'Maintenance',
      action: `Schedule ${maintenanceAnalysis.summary.highCount} high-priority maintenance items`,
      impact: 'Medium',
      estimatedTime: '1-2 days',
    });
  }

  // Low utilization
  const utilization = parseFloat(businessAnalytics.utilization.utilization);
  if (utilization < 60) {
    actions.push({
      priority: 'MEDIUM',
      category: 'Operations',
      action: 'Improve fleet utilization through route optimization',
      impact: 'Medium',
      estimatedTime: '1 week',
    });
  }

  // Critical predictions
  const criticalPredictions = predictions.filter(p => p.confidence > 80);
  if (criticalPredictions.length > 0) {
    actions.push({
      priority: 'HIGH',
      category: 'Predictive',
      action: `Address ${criticalPredictions.length} high-risk component failures`,
      impact: 'High',
      estimatedTime: '2-3 days',
    });
  }

  // Low availability
  const availability = parseFloat(businessAnalytics.availability.availability);
  if (availability < 80) {
    actions.push({
      priority: 'MEDIUM',
      category: 'Availability',
      action: 'Improve vehicle availability by reducing downtime',
      impact: 'Medium',
      estimatedTime: '1-2 weeks',
    });
  }

  return actions.slice(0, 5); // Top 5 actions
}

/**
 * Save dashboard to database
 */
export async function saveDashboard(userId, dashboard) {
  try {
    const savedDashboard = await prisma.aiDashboard.create({
      data: {
        userId,
        date: dashboard.date,
        data: dashboard,
        createdAt: new Date(),
      },
    });

    logger.info('Dashboard saved', { userId, dashboardId: savedDashboard.id });

    return savedDashboard;
  } catch (error) {
    logger.error('Error saving dashboard', { userId, error: error.message });
    throw error;
  }
}

/**
 * Get latest dashboard for user
 */
export async function getLatestDashboard(userId) {
  try {
    const dashboard = await prisma.aiDashboard.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return dashboard ? dashboard.data : null;
  } catch (error) {
    logger.error('Error getting latest dashboard', { userId, error: error.message });
    throw error;
  }
}

/**
 * Get dashboard history
 */
export async function getDashboardHistory(userId, days = 30) {
  try {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const dashboards = await prisma.aiDashboard.findMany({
      where: {
        userId,
        createdAt: { gte: cutoffDate },
      },
      orderBy: { createdAt: 'desc' },
    });

    return dashboards.map(d => d.data);
  } catch (error) {
    logger.error('Error getting dashboard history', { userId, error: error.message });
    throw error;
  }
}

/**
 * Schedule daily dashboard generation
 */
export function scheduleDailyDashboardGeneration() {
  // Generate dashboard at 6 AM every day
  const now = new Date();
  const sixAM = new Date();
  sixAM.setHours(6, 0, 0, 0);
  
  if (now > sixAM) {
    sixAM.setDate(sixAM.getDate() + 1);
  }

  const msUntilSixAM = sixAM - now;

  setTimeout(async () => {
    try {
      const users = await prisma.user.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });

      for (const user of users) {
        try {
          const dashboard = await generateDailyDashboard(user.id);
          await saveDashboard(user.id, dashboard);
          logger.info('Daily dashboard generated for user', { userId: user.id });
        } catch (error) {
          logger.error('Failed to generate dashboard for user', { userId: user.id, error: error.message });
        }
      }

      // Schedule next day
      scheduleDailyDashboardGeneration();
    } catch (error) {
      logger.error('Error in daily dashboard generation', { error: error.message });
      // Retry in 1 hour
      setTimeout(scheduleDailyDashboardGeneration, 60 * 60 * 1000);
    }
  }, msUntilSixAM);

  logger.info('Daily dashboard generation scheduled', { nextRun: sixAM });
}

/**
 * Get dashboard summary for notification
 */
export function getDashboardSummaryForNotification(dashboard) {
  return {
    date: dashboard.date,
    healthScore: dashboard.dailySummary.fleetHealthScore,
    riskLevel: dashboard.dailySummary.riskLevel,
    criticalAlerts: dashboard.criticalAlerts.count,
    pendingMaintenance: dashboard.pendingMaintenance.totalItems,
    recommendedActions: dashboard.recommendedActions.length,
    overallStatus: dashboard.dailySummary.overallStatus,
  };
}
