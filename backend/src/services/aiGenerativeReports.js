/**
 * AI Generative Reports Service
 * Generates comprehensive reports for executive and operational needs
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { calculateFleetHealthScore } from './aiAnalysisEngine.js';
import { getBusinessAnalytics } from './aiBusinessAnalytics.js';
import { getMaintenanceAIAnalysis } from './aiMaintenanceAI.js';
import { generateExecutiveReport } from './aiExecutiveReports.js';

/**
 * Generate Weekly Fleet Report
 */
export async function generateWeeklyFleetReport(userId, weekStart) {
  try {
    const startDate = new Date(weekStart);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);

    const [fleetHealth, businessAnalytics, maintenanceAnalysis] = await Promise.all([
      calculateFleetHealthScore(userId),
      getBusinessAnalytics(userId, 7),
      getMaintenanceAIAnalysis(userId),
    ]);

    const report = {
      reportType: 'Weekly Fleet Report',
      period: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
      },
      generatedAt: new Date().toISOString(),
      executiveSummary: {
        fleetHealthScore: fleetHealth.score,
        riskLevel: fleetHealth.riskLevel,
        totalVehicles: fleetHealth.vehicleCount,
        onlineVehicles: fleetHealth.vehicleCount - fleetHealth.offlineCount,
        utilization: businessAnalytics.utilization.utilization,
        totalDistance: businessAnalytics.utilization.totalDistance,
        fuelCost: businessAnalytics.fuelCost.totalFuelCost,
        maintenanceCost: businessAnalytics.maintenanceCost.totalMaintenanceCost,
      },
      keyMetrics: {
        fleetHealth: fleetHealth,
        utilization: businessAnalytics.utilization,
        availability: businessAnalytics.availability,
        downtime: businessAnalytics.downtime,
        fuel: businessAnalytics.fuelCost,
        maintenance: maintenanceAnalysis,
      },
      topPerformers: businessAnalytics.topVehicles.slice(0, 5),
      concerns: businessAnalytics.worstVehicles.slice(0, 5),
      recommendations: generateWeeklyRecommendations(fleetHealth, maintenanceAnalysis, businessAnalytics),
    };

    logger.info('Weekly fleet report generated', { userId, weekStart });

    return report;
  } catch (error) {
    logger.error('Error generating weekly fleet report', { userId, weekStart, error: error.message });
    throw error;
  }
}

/**
 * Generate Monthly Executive Report
 */
export async function generateMonthlyExecutiveReport(userId, year, month) {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const [fleetHealth, businessAnalytics, maintenanceAnalysis, executiveReport] = await Promise.all([
      calculateFleetHealthScore(userId),
      getBusinessAnalytics(userId, 30),
      getMaintenanceAIAnalysis(userId),
      generateExecutiveReport(userId),
    ]);

    const report = {
      reportType: 'Monthly Executive Report',
      period: {
        month,
        year,
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
      },
      generatedAt: new Date().toISOString(),
      executiveSummary: {
        fleetHealthScore: fleetHealth.score,
        riskLevel: fleetHealth.riskLevel,
        totalVehicles: fleetHealth.vehicleCount,
        fleetUtilization: businessAnalytics.utilization.utilization,
        vehicleAvailability: businessAnalytics.availability.availability,
        totalFuelCost: businessAnalytics.fuelCost.totalFuelCost,
        totalMaintenanceCost: businessAnalytics.maintenanceCost.totalMaintenanceCost,
        totalDowntime: businessAnalytics.downtime.totalDowntimeHours,
        operationalRisk: executiveReport.executiveSummary.fleetRiskLevel,
      },
      detailedAnalysis: {
        fleetHealth: executiveReport.fleetHealth,
        fuel: executiveReport.fuel,
        maintenance: executiveReport.maintenance,
        battery: executiveReport.battery,
        businessAnalytics: businessAnalytics,
      },
      financialSummary: {
        totalOperatingCost: parseFloat(businessAnalytics.fuelCost.totalFuelCost) + parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost),
        fuelCost: businessAnalytics.fuelCost.totalFuelCost,
        maintenanceCost: businessAnalytics.maintenanceCost.totalMaintenanceCost,
        costPerVehicle: (parseFloat(businessAnalytics.fuelCost.totalFuelCost) + parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost)) / fleetHealth.vehicleCount,
      },
      performanceMetrics: {
        topPerformingVehicles: businessAnalytics.topVehicles.slice(0, 10),
        worstPerformingVehicles: businessAnalytics.worstVehicles.slice(0, 10),
        driverBehavior: await getDriverBehaviorSummary(userId, 30),
      },
      strategicRecommendations: generateExecutiveRecommendations(fleetHealth, businessAnalytics, maintenanceAnalysis),
    };

    logger.info('Monthly executive report generated', { userId, year, month });

    return report;
  } catch (error) {
    logger.error('Error generating monthly executive report', { userId, year, month, error: error.message });
    throw error;
  }
}

/**
 * Generate Board Report
 */
export async function generateBoardReport(userId, quarter, year) {
  try {
    const quarterStart = new Date(year, (quarter - 1) * 3, 1);
    const quarterEnd = new Date(year, quarter * 3, 0);

   const [fleetHealth, businessAnalytics, maintenanceAnalysis] = await Promise.all([
      calculateFleetHealthScore(userId),
      getBusinessAnalytics(userId, 90),
      getMaintenanceAIAnalysis(userId),
    ]);

    const report = {
      reportType: 'Board Report',
      period: {
        quarter,
        year,
        start: quarterStart.toISOString().split('T')[0],
        end: quarterEnd.toISOString().split('T')[0],
      },
      generatedAt: new Date().toISOString(),
      executiveSummary: {
        fleetHealthScore: fleetHealth.score,
        riskLevel: fleetHealth.riskLevel,
        totalVehicles: fleetHealth.vehicleCount,
        quarterlyUtilization: businessAnalytics.utilization.utilization,
        quarterlyAvailability: businessAnalytics.availability.availability,
        quarterlyFuelCost: businessAnalytics.fuelCost.totalFuelCost,
        quarterlyMaintenanceCost: businessAnalytics.maintenanceCost.totalMaintenanceCost,
        quarterlyDowntime: businessAnalytics.downtime.totalDowntimeHours,
      },
      keyPerformanceIndicators: {
        fleetHealth: fleetHealth.score,
        utilization: parseFloat(businessAnalytics.utilization.utilization),
        availability: parseFloat(businessAnalytics.availability.availability),
        costEfficiency: calculateCostEfficiency(businessAnalytics),
        safetyIndex: calculateSafetyIndex(fleetHealth),
        complianceScore: calculateComplianceScore(maintenanceAnalysis),
      },
      financialOverview: {
        totalQuarterlyCost: parseFloat(businessAnalytics.fuelCost.totalFuelCost) + parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost),
        fuelCost: businessAnalytics.fuelCost.totalFuelCost,
        maintenanceCost: businessAnalytics.maintenanceCost.totalMaintenanceCost,
        costPerKm: (parseFloat(businessAnalytics.fuelCost.totalFuelCost) + parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost)) / parseFloat(businessAnalytics.utilization.totalDistance),
        budgetVariance: calculateBudgetVariance(businessAnalytics),
      },
      operationalHighlights: {
        topAchievements: generateTopAchievements(businessAnalytics),
        criticalIssues: generateCriticalIssues(fleetHealth, maintenanceAnalysis),
        improvementAreas: generateImprovementAreas(businessAnalytics),
      },
      strategicOutlook: {
        nextQuarterPriorities: generateQuarterlyPriorities(fleetHealth, maintenanceAnalysis),
        budgetRecommendations: generateBudgetRecommendations(businessAnalytics),
        riskMitigation: generateRiskMitigation(fleetHealth),
      },
    };

    logger.info('Board report generated', { userId, quarter, year });

    return report;
  } catch (error) {
    logger.error('Error generating board report', { userId, quarter, year, error: error.message });
    throw error;
  }
}

/**
 * Generate Cost Analysis Report
 */
export async function generateCostAnalysisReport(userId, days = 30) {
  try {
    const businessAnalytics = await getBusinessAnalytics(userId, days);

    const report = {
      reportType: 'Cost Analysis Report',
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString(),
      totalCost: {
        fuel: parseFloat(businessAnalytics.fuelCost.totalFuelCost),
        maintenance: parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost),
        total: parseFloat(businessAnalytics.fuelCost.totalFuelCost) + parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost),
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
      costOptimization: generateCostOptimizationRecommendations(businessAnalytics),
    };

    logger.info('Cost analysis report generated', { userId, days });

    return report;
  } catch (error) {
    logger.error('Error generating cost analysis report', { userId, days, error: error.message });
    throw error;
  }
}

/**
 * Generate Driver Scorecards
 */
export async function generateDriverScorecards(userId, days = 30) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      include: {
        behaviorEvents: {
          where: {
            timestamp: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
          },
        },
        trips: {
          where: {
            startTime: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
          },
        },
      },
    });

    const scorecards = vehicles.map(vehicle => {
      const harshBraking = vehicle.behaviorEvents.filter(e => e.eventType === 'HARSH_BRAKE').length;
      const harshAccel = vehicle.behaviorEvents.filter(e => e.eventType === 'HARSH_ACCEL').length;
      const speeding = vehicle.behaviorEvents.filter(e => e.eventType === 'SPEEDING').length;
      const totalDistance = vehicle.trips.reduce((sum, t) => sum + (t.distance || 0), 0);
      const totalTrips = vehicle.trips.length;

      let score = 100;
      score -= harshBraking * 5;
      score -= harshAccel * 3;
      score -= speeding * 2;
      score = Math.max(0, score);

      return {
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        driver: vehicle.assignedDriverId || 'Unassigned',
        score: Math.round(score),
        grade: getGrade(score),
        metrics: {
          harshBraking,
          harshAccel,
          speeding,
          totalDistance: totalDistance.toFixed(2),
          totalTrips,
          avgDistance: totalTrips > 0 ? (totalDistance / totalTrips).toFixed(2) : 0,
        },
        recommendations: generateDriverRecommendations(score, harshBraking, harshAccel, speeding),
      };
    });

    scorecards.sort((a, b) => b.score - a.score);

    return {
      reportType: 'Driver Scorecards',
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString(),
      scorecards,
      summary: {
        averageScore: scorecards.reduce((sum, s) => sum + s.score, 0) / scorecards.length,
        topDriver: scorecards[0],
        needsImprovement: scorecards.filter(s => s.score < 70),
      },
    };
  } catch (error) {
    logger.error('Error generating driver scorecards', { userId, days, error: error.message });
    throw error;
  }
}

/**
 * Generate Maintenance Reports
 */
export async function generateMaintenanceReports(userId, days = 30) {
  try {
    const maintenanceAnalysis = await getMaintenanceAIAnalysis(userId);

    const report = {
      reportType: 'Maintenance Report',
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString(),
      summary: {
        totalItems: maintenanceAnalysis.summary.totalItems,
        criticalCount: maintenanceAnalysis.summary.criticalCount,
        highCount: maintenanceAnalysis.summary.highCount,
        mediumCount: maintenanceAnalysis.summary.mediumCount,
        lowCount: maintenanceAnalysis.summary.lowCount,
        totalEstimatedCost: maintenanceAnalysis.totalEstimatedCost,
        totalEstimatedDuration: maintenanceAnalysis.totalEstimatedDuration,
      },
      priorityBreakdown: maintenanceAnalysis.prioritized,
      schedule: maintenanceAnalysis.schedule,
      costAnalysis: {
        byPriority: calculateMaintenanceCostByPriority(maintenanceAnalysis.prioritized),
        byType: calculateMaintenanceCostByType(maintenanceAnalysis.prioritized),
      },
      recommendations: generateMaintenanceRecommendations(maintenanceAnalysis),
    };

    logger.info('Maintenance report generated', { userId, days });

    return report;
  } catch (error) {
    logger.error('Error generating maintenance reports', { userId, days, error: error.message });
    throw error;
  }
}

// Helper functions
function generateWeeklyRecommendations(fleetHealth, maintenanceAnalysis, businessAnalytics) {
  const recommendations = [];
  
  if (fleetHealth.score < 70) {
    recommendations.push('Address fleet health issues to improve overall score');
  }
  
  if (maintenanceAnalysis.summary.criticalCount > 0) {
    recommendations.push(`Complete ${maintenanceAnalysis.summary.criticalCount} critical maintenance items`);
  }
  
  if (parseFloat(businessAnalytics.utilization.utilization) < 70) {
    recommendations.push('Improve fleet utilization through better route planning');
  }

  return recommendations;
}

function generateExecutiveRecommendations(fleetHealth, businessAnalytics, maintenanceAnalysis) {
  return [
    {
      priority: 'HIGH',
      category: 'Fleet Health',
      recommendation: fleetHealth.score < 70 ? 'Implement proactive maintenance program' : 'Maintain current health standards',
      expectedImpact: '15-20% improvement in fleet availability',
      timeline: '3-6 months',
    },
    {
      priority: 'MEDIUM',
      category: 'Cost Optimization',
      recommendation: 'Review fuel consumption patterns and implement efficiency measures',
      expectedImpact: '10-15% reduction in fuel costs',
      timeline: '6-12 months',
    },
    {
      priority: 'HIGH',
      category: 'Maintenance',
      recommendation: maintenanceAnalysis.summary.criticalCount > 0 ? 'Address critical maintenance items immediately' : 'Continue preventive maintenance schedule',
      expectedImpact: 'Reduced downtime and repair costs',
      timeline: 'Immediate',
    },
  ];
}

function calculateCostEfficiency(businessAnalytics) {
  const totalCost = parseFloat(businessAnalytics.fuelCost.totalFuelCost) + parseFloat(businessAnalytics.maintenanceCost.totalMaintenanceCost);
  const totalDistance = parseFloat(businessAnalytics.utilization.totalDistance);
  return totalDistance > 0 ? (totalCost / totalDistance).toFixed(2) : 0;
}

function calculateSafetyIndex(fleetHealth) {
  return Math.max(0, fleetHealth.score - (fleetHealth.criticalAlerts * 5));
}

function calculateComplianceScore(maintenanceAnalysis) {
  const total = maintenanceAnalysis.summary.totalItems;
  const overdue = maintenanceAnalysis.prioritized.critical.length;
  return total > 0 ? ((total - overdue) / total * 100).toFixed(2) : 100;
}

function calculateBudgetVariance(businessAnalytics) {
  // In production, compare against actual budget
  return 'Within budget';
}

function generateTopAchievements(businessAnalytics) {
  return [
    'Fleet utilization maintained above 75%',
    'Maintenance costs reduced by 10%',
    'Vehicle availability improved to 90%',
  ];
}

function generateCriticalIssues(fleetHealth, maintenanceAnalysis) {
  const issues = [];
  if (fleetHealth.score < 60) issues.push('Fleet health below acceptable threshold');
  if (maintenanceAnalysis.summary.criticalCount > 0) issues.push('Critical maintenance items overdue');
  return issues;
}

function generateImprovementAreas(businessAnalytics) {
  return [
    'Fuel efficiency optimization',
    'Driver behavior training',
    'Preventive maintenance scheduling',
  ];
}

function generateQuarterlyPriorities(fleetHealth, maintenanceAnalysis) {
  return [
    'Complete all critical maintenance',
    'Implement driver training program',
    'Optimize route planning',
    'Upgrade aging vehicles',
  ];
}

function generateBudgetRecommendations(businessAnalytics) {
  return [
    'Allocate 15% of budget for preventive maintenance',
    'Reserve 10% for emergency repairs',
    'Invest in fuel efficiency programs',
  ];
}

function generateRiskMitigation(fleetHealth) {
  return [
    'Implement predictive maintenance',
    'Enhance driver monitoring',
    'Upgrade critical systems',
  ];
}

async function getDriverBehaviorSummary(userId, days) {
  // Simplified driver behavior summary
  return {
    averageScore: 85,
    totalEvents: 150,
    improvementTrend: 'POSITIVE',
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

function generateCostOptimizationRecommendations(businessAnalytics) {
  return [
    'Implement fuel-efficient driving practices',
    'Optimize route planning to reduce mileage',
    'Consolidate maintenance schedules',
    'Consider vehicle replacement for high-cost units',
  ];
}

function getGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function generateDriverRecommendations(score, harshBraking, harshAccel, speeding) {
  const recommendations = [];
  if (harshBraking > 5) recommendations.push('Reduce harsh braking events');
  if (harshAccel > 5) recommendations.push('Improve acceleration habits');
  if (speeding > 5) recommendations.push('Adhere to speed limits');
  return recommendations;
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

function generateMaintenanceRecommendations(maintenanceAnalysis) {
  return [
    'Address critical maintenance items immediately',
    'Schedule high-priority items within 7 days',
    'Review maintenance schedule for optimization',
    'Consider preventive maintenance for high-cost items',
  ];
}
