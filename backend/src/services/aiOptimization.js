/**
 * AI Optimization Service
 * Provides optimization recommendations for fuel, routes, driver behavior, fleet costs, and maintenance
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { getBusinessAnalytics } from './aiBusinessAnalytics.js';
import { calculateAllVehicleHealthScores } from './aiAnalysisEngine.js';

/**
 * Fuel Optimization
 */
export async function optimizeFuel(userId, days = 30) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      include: {
        trips: {
          where: {
            startTime: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
          },
          orderBy: { startTime: 'desc' },
          take: 50,
        },
        behaviorEvents: {
          where: {
            timestamp: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
          },
        },
      },
    });

    const fuelOptimization = vehicles.map(vehicle => {
      const trips = vehicle.trips;
      const totalDistance = trips.reduce((sum, t) => sum + (t.distance || 0), 0);
      const totalFuel = trips.reduce((sum, t) => sum + (t.fuelConsumption || 0), 0);
      const avgEfficiency = totalDistance > 0 ? totalDistance / totalFuel : 0;
      
      const harshBraking = vehicle.behaviorEvents.filter(e => e.eventType === 'HARSH_BRAKE').length;
      const harshAccel = vehicle.behaviorEvents.filter(e => e.eventType === 'HARSH_ACCEL').length;
      const speeding = vehicle.behaviorEvents.filter(e => e.eventType === 'SPEEDING').length;
      
      const currentEfficiency = avgEfficiency;
      const targetEfficiency = 15; // km/L
      const potentialSavings = ((targetEfficiency - currentEfficiency) / currentEfficiency) * 100;
      
      return {
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        currentEfficiency: currentEfficiency.toFixed(2),
        targetEfficiency,
        potentialSavings: potentialSavings.toFixed(2),
        issues: {
          harshBraking,
          harshAccel,
          speeding,
        },
        recommendations: generateFuelRecommendations(harshBraking, harshAccel, speeding, currentEfficiency),
        estimatedCostSavings: (potentialSavings / 100 * totalFuel * 1.5).toFixed(2), // Assuming $1.50/L
      };
    });

    fuelOptimization.sort((a, b) => parseFloat(b.potentialSavings) - parseFloat(a.potentialSavings));

    return {
      optimizationType: 'Fuel',
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString(),
      vehicles: fuelOptimization,
      summary: {
        totalPotentialSavings: fuelOptimization.reduce((sum, v) => sum + parseFloat(v.estimatedCostSavings), 0).toFixed(2),
        averageEfficiency: (fuelOptimization.reduce((sum, v) => sum + parseFloat(v.currentEfficiency), 0) / fuelOptimization.length).toFixed(2),
        topOpportunity: fuelOptimization[0],
      },
    };
  } catch (error) {
    logger.error('Error optimizing fuel', { userId, error: error.message });
    throw error;
  }
}

/**
 * Route Optimization
 */
export async function optimizeRoutes(userId, days = 30) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      include: {
        trips: {
          where: {
            startTime: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
          },
          orderBy: { startTime: 'desc' },
          take: 100,
        },
        gpsLocation: true,
      },
    });

    const routeOptimization = vehicles.map(vehicle => {
      const trips = vehicle.trips;
      const totalDistance = trips.reduce((sum, t) => sum + (t.distance || 0), 0);
      const avgTripDistance = trips.length > 0 ? totalDistance / trips.length : 0;
      
      // Calculate route efficiency based on trip patterns
      const routeEfficiency = calculateRouteEfficiency(trips);
      
      return {
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        totalTrips: trips.length,
        totalDistance: totalDistance.toFixed(2),
        avgTripDistance: avgTripDistance.toFixed(2),
        routeEfficiency: routeEfficiency.toFixed(2),
        currentLocation: vehicle.gpsLocation,
        recommendations: generateRouteRecommendations(routeEfficiency, avgTripDistance),
        potentialDistanceSavings: ((1 - routeEfficiency / 100) * totalDistance).toFixed(2),
      };
    });

    return {
      optimizationType: 'Route',
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString(),
      vehicles: routeOptimization,
      summary: {
        totalPotentialSavings: routeOptimization.reduce((sum, v) => sum + parseFloat(v.potentialDistanceSavings), 0).toFixed(2),
        averageRouteEfficiency: (routeOptimization.reduce((sum, v) => sum + parseFloat(v.routeEfficiency), 0) / routeOptimization.length).toFixed(2),
      },
    };
  } catch (error) {
    logger.error('Error optimizing routes', { userId, error: error.message });
    throw error;
  }
}

/**
 * Driver Behavior Optimization
 */
export async function optimizeDriverBehavior(userId, days = 30) {
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

    const driverOptimization = vehicles.map(vehicle => {
      const behaviorEvents = vehicle.behaviorEvents;
      const harshBraking = behaviorEvents.filter(e => e.eventType === 'HARSH_BRAKE').length;
      const harshAccel = behaviorEvents.filter(e => e.eventType === 'HARSH_ACCEL').length;
      const speeding = behaviorEvents.filter(e => e.eventType === 'SPEEDING').length;
      const idleEvents = behaviorEvents.filter(e => e.eventType === 'IDLE').length;
      
      const totalEvents = behaviorEvents.length;
      const safetyScore = Math.max(0, 100 - (harshBraking * 5 + harshAccel * 3 + speeding * 2));
      const efficiencyScore = Math.max(0, 100 - (idleEvents * 2 + harshAccel * 2));
      
      return {
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        driver: vehicle.assignedDriverId || 'Unassigned',
        safetyScore: safetyScore.toFixed(0),
        efficiencyScore: efficiencyScore.toFixed(0),
        overallScore: ((safetyScore + efficiencyScore) / 2).toFixed(0),
        events: {
          harshBraking,
          harshAccel,
          speeding,
          idleEvents,
          totalEvents,
        },
        recommendations: generateDriverBehaviorRecommendations(harshBraking, harshAccel, speeding, idleEvents),
        trainingPriority: getTrainingPriority(safetyScore, efficiencyScore),
      };
    });

    driverOptimization.sort((a, b) => parseFloat(a.overallScore) - parseFloat(b.overallScore));

    return {
      optimizationType: 'Driver Behavior',
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString(),
      drivers: driverOptimization,
      summary: {
        averageSafetyScore: (driverOptimization.reduce((sum, d) => sum + parseFloat(d.safetyScore), 0) / driverOptimization.length).toFixed(0),
        averageEfficiencyScore: (driverOptimization.reduce((sum, d) => sum + parseFloat(d.efficiencyScore), 0) / driverOptimization.length).toFixed(0),
        needsTraining: driverOptimization.filter(d => parseFloat(d.overallScore) < 70),
      },
    };
  } catch (error) {
    logger.error('Error optimizing driver behavior', { userId, error: error.message });
    throw error;
  }
}

/**
 * Fleet Cost Optimization
 */
export async function optimizeFleetCosts(userId, days = 30) {
  try {
    const businessAnalytics = await getBusinessAnalytics(userId, days);
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      include: {
        trips: {
          where: {
            startTime: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
          },
        },
        maintenanceLogs: {
          where: {
            completed: true,
            completedAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
          },
        },
      },
    });

    const costOptimization = vehicles.map(vehicle => {
      const vehicleTrips = vehicle.trips;
      const vehicleMaintenance = vehicle.maintenanceLogs;
      
      const fuelCost = vehicleTrips.reduce((sum, t) => sum + (t.fuelConsumption || 0) * 1.5, 0);
      const maintenanceCost = vehicleMaintenance.reduce((sum, m) => sum + (m.actualCost || m.estimatedCost || 0), 0);
      const totalCost = fuelCost + maintenanceCost;
      const totalDistance = vehicleTrips.reduce((sum, t) => sum + (t.distance || 0), 0);
      const costPerKm = totalDistance > 0 ? totalCost / totalDistance : 0;
      
      return {
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        totalCost: totalCost.toFixed(2),
        fuelCost: fuelCost.toFixed(2),
        maintenanceCost: maintenanceCost.toFixed(2),
        totalDistance: totalDistance.toFixed(2),
        costPerKm: costPerKm.toFixed(2),
        recommendations: generateCostRecommendations(fuelCost, maintenanceCost, costPerKm),
        potentialSavings: (costPerKm * 0.15 * totalDistance).toFixed(2), // 15% potential savings
      };
    });

    costOptimization.sort((a, b) => parseFloat(b.costPerKm) - parseFloat(a.costPerKm));

    return {
      optimizationType: 'Fleet Cost',
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString(),
      vehicles: costOptimization,
      summary: {
        totalFleetCost: costOptimization.reduce((sum, v) => sum + parseFloat(v.totalCost), 0).toFixed(2),
        averageCostPerKm: (costOptimization.reduce((sum, v) => sum + parseFloat(v.costPerKm), 0) / costOptimization.length).toFixed(2),
        totalPotentialSavings: costOptimization.reduce((sum, v) => sum + parseFloat(v.potentialSavings), 0).toFixed(2),
        highestCostVehicle: costOptimization[0],
      },
      businessAnalytics,
    };
  } catch (error) {
    logger.error('Error optimizing fleet costs', { userId, error: error.message });
    throw error;
  }
}

/**
 * Maintenance Optimization
 */
export async function optimizeMaintenance(userId) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      include: {
        maintenanceLogs: {
          where: { completed: false },
          orderBy: { dueDate: 'asc' },
        },
        dtcCodes: { where: { active: true } },
      },
    });

    const maintenanceOptimization = vehicles.map(vehicle => {
      const pendingMaintenance = vehicle.maintenanceLogs;
      const activeDTCs = vehicle.dtcCodes;
      
      // Calculate maintenance urgency score
      let urgencyScore = 0;
      const now = new Date();
      
      pendingMaintenance.forEach(log => {
        const dueDate = new Date(log.dueDate);
        const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
        
        if (daysUntilDue < 0) urgencyScore += 30;
        else if (daysUntilDue <= 7) urgencyScore += 20;
        else if (daysUntilDue <= 30) urgencyScore += 10;
        
        if (log.priority === 'CRITICAL') urgencyScore += 25;
        else if (log.priority === 'HIGH') urgencyScore += 15;
        else if (log.priority === 'MEDIUM') urgencyScore += 5;
      });
      
      urgencyScore += activeDTCs.length * 10;
      
      return {
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        urgencyScore: urgencyScore,
        priorityLevel: urgencyScore > 50 ? 'CRITICAL' : urgencyScore > 30 ? 'HIGH' : urgencyScore > 15 ? 'MEDIUM' : 'LOW',
        pendingItems: pendingMaintenance.length,
        activeDTCs: activeDTCs.length,
        recommendations: generateMaintenanceOptimizationRecommendations(pendingMaintenance, activeDTCs, urgencyScore),
        suggestedSchedule: generateOptimizedSchedule(pendingMaintenance, urgencyScore),
      };
    });

    maintenanceOptimization.sort((a, b) => b.urgencyScore - a.urgencyScore);

    return {
      optimizationType: 'Maintenance',
      generatedAt: new Date().toISOString(),
      vehicles: maintenanceOptimization,
      summary: {
        totalPendingItems: maintenanceOptimization.reduce((sum, v) => sum + v.pendingItems, 0),
        criticalVehicles: maintenanceOptimization.filter(v => v.priorityLevel === 'CRITICAL').length,
        totalActiveDTCs: maintenanceOptimization.reduce((sum, v) => sum + v.activeDTCs, 0),
        recommendedSchedule: generateFleetMaintenanceSchedule(maintenanceOptimization),
      },
    };
  } catch (error) {
    logger.error('Error optimizing maintenance', { userId, error: error.message });
    throw error;
  }
}

// Helper functions
function generateFuelRecommendations(harshBraking, harshAccel, speeding, currentEfficiency) {
  const recommendations = [];
  if (harshBraking > 5) recommendations.push('Reduce harsh braking to improve fuel efficiency by 5-10%');
  if (harshAccel > 5) recommendations.push('Smooth acceleration patterns to save 3-7% fuel');
  if (speeding > 5) recommendations.push('Maintain optimal speed to reduce fuel consumption by 8-12%');
  if (currentEfficiency < 12) recommendations.push('Consider vehicle maintenance check for low efficiency');
  return recommendations;
}

function calculateRouteEfficiency(trips) {
  if (trips.length === 0) return 100;
  
  // Calculate efficiency based on trip distance variance and patterns
  const distances = trips.map(t => t.distance || 0);
  const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
  const variance = distances.reduce((sum, d) => sum + Math.pow(d - avgDistance, 2), 0) / distances.length;
  
  // Lower variance indicates more consistent, efficient routes
  const efficiencyScore = Math.max(50, 100 - (variance / avgDistance) * 10);
  return efficiencyScore;
}

function generateRouteRecommendations(routeEfficiency, avgTripDistance) {
  const recommendations = [];
  if (routeEfficiency < 70) recommendations.push('Optimize route planning to reduce distance variance');
  if (avgTripDistance < 20) recommendations.push('Consider trip consolidation for shorter routes');
  if (routeEfficiency < 80) recommendations.push('Implement GPS-based route optimization');
  return recommendations;
}

function generateDriverBehaviorRecommendations(harshBraking, harshAccel, speeding, idleEvents) {
  const recommendations = [];
  if (harshBraking > 5) recommendations.push('Implement driver training for defensive driving');
  if (harshAccel > 5) recommendations.push('Coach drivers on smooth acceleration techniques');
  if (speeding > 5) recommendations.push('Enforce speed limit compliance monitoring');
  if (idleEvents > 10) recommendations.push('Reduce idle time through engine shutdown policies');
  return recommendations;
}

function getTrainingPriority(safetyScore, efficiencyScore) {
  const avgScore = (parseFloat(safetyScore) + parseFloat(efficiencyScore)) / 2;
  if (avgScore < 60) return 'IMMEDIATE';
  if (avgScore < 75) return 'HIGH';
  if (avgScore < 85) return 'MEDIUM';
  return 'LOW';
}

function generateCostRecommendations(fuelCost, maintenanceCost, costPerKm) {
  const recommendations = [];
  if (fuelCost > maintenanceCost * 2) recommendations.push('Focus on fuel efficiency improvements');
  if (maintenanceCost > fuelCost) recommendations.push('Review maintenance schedule and costs');
  if (costPerKm > 0.50) recommendations.push('Consider vehicle replacement for high-cost units');
  return recommendations;
}

function generateMaintenanceOptimizationRecommendations(pendingMaintenance, activeDTCs, urgencyScore) {
  const recommendations = [];
  if (urgencyScore > 50) recommendations.push('Schedule immediate maintenance for critical items');
  if (activeDTCs.length > 0) recommendations.push('Address active DTC codes to prevent further damage');
  if (pendingMaintenance.length > 5) recommendations.push('Consolidate maintenance items to reduce downtime');
  return recommendations;
}

function generateOptimizedSchedule(pendingMaintenance, urgencyScore) {
  const schedule = [];
  const now = new Date();
  
  pendingMaintenance.forEach(log => {
    const dueDate = new Date(log.dueDate);
    const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
    
    let scheduledDate = dueDate;
    if (urgencyScore > 50) {
      scheduledDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Within 7 days
    } else if (urgencyScore > 30) {
      scheduledDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // Within 14 days
    }
    
    schedule.push({
      type: log.type,
      dueDate: log.dueDate,
      suggestedDate: scheduledDate.toISOString().split('T')[0],
      priority: log.priority,
    });
  });
  
  return schedule;
}

function generateFleetMaintenanceSchedule(maintenanceOptimization) {
  const criticalVehicles = maintenanceOptimization.filter(v => v.priorityLevel === 'CRITICAL');
  const highPriorityVehicles = maintenanceOptimization.filter(v => v.priorityLevel === 'HIGH');
  
  return {
    thisWeek: criticalVehicles.map(v => v.plate),
    nextWeek: highPriorityVehicles.map(v => v.plate),
    thisMonth: [...criticalVehicles, ...highPriorityVehicles].map(v => v.plate),
  };
}
