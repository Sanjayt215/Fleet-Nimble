/**
 * AI Predictions Service
 * Predicts component failures and maintenance needs using real telemetry data
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

/**
 * Predict battery failure
 */
export async function predictBatteryFailure(vehicleId) {
  try {
    const telemetry = await prisma.obdLiveData.findMany({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
      take: 20,
    });

    if (telemetry.length === 0) {
      return {
        prediction: 'No telemetry data available',
        confidence: 0,
        reason: 'Insufficient data',
        historicalTrend: 'Unknown',
        estimatedFailureDate: null,
        estimatedRepairCost: null,
        estimatedDowntime: null,
        recommendedAction: 'Collect more telemetry data',
      };
    }

    const voltages = telemetry.map(t => t.batteryVoltage || 0);
    const avgVoltage = voltages.reduce((sum, v) => sum + v, 0) / voltages.length;
    const minVoltage = Math.min(...voltages);
    const voltageTrend = calculateTrend(voltages);

    let daysToFailure = 30;
    let confidence = 50;
    let riskLevel = 'Low';

    if (avgVoltage < 11.5 || minVoltage < 11.0) {
      daysToFailure = 1;
      confidence = 95;
      riskLevel = 'Critical';
    } else if (avgVoltage < 12.0 || minVoltage < 11.5) {
      daysToFailure = 5;
      confidence = 85;
      riskLevel = 'High';
    } else if (avgVoltage < 12.4) {
      daysToFailure = 14;
      confidence = 70;
      riskLevel = 'Medium';
    }

    // Adjust confidence based on trend
    if (voltageTrend < -0.1) {
      confidence = Math.min(100, confidence + 10);
      daysToFailure = Math.max(1, daysToFailure - 3);
    }

    const estimatedFailureDate = new Date();
    estimatedFailureDate.setDate(estimatedFailureDate.getDate() + daysToFailure);

    return {
      prediction: `Battery ${riskLevel.toLowerCase()} risk of failure`,
      confidence,
      reason: `Average voltage: ${avgVoltage.toFixed(2)}V, Minimum: ${minVoltage.toFixed(2)}V, Trend: ${voltageTrend > 0 ? 'Stable' : 'Declining'}`,
      historicalTrend: voltageTrend > 0 ? 'Stable' : voltageTrend < -0.1 ? 'Rapid Decline' : 'Slow Decline',
      estimatedFailureDate: estimatedFailureDate.toISOString().split('T')[0],
      estimatedRepairCost: riskLevel === 'Critical' ? 150 : riskLevel === 'High' ? 120 : 100,
      estimatedDowntime: riskLevel === 'Critical' ? 4 : 2,
      recommendedAction: riskLevel === 'Critical' 
        ? 'Replace battery immediately' 
        : riskLevel === 'High' 
        ? 'Schedule battery replacement within 5 days' 
        : 'Monitor battery voltage weekly',
    };
  } catch (error) {
    logger.error('Error predicting battery failure', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Predict coolant failure/overheating
 */
export async function predictCoolantFailure(vehicleId) {
  try {
    const telemetry = await prisma.obdLiveData.findMany({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
      take: 20,
    });

    if (telemetry.length === 0) {
      return {
        prediction: 'No telemetry data available',
        confidence: 0,
        reason: 'Insufficient data',
        historicalTrend: 'Unknown',
        estimatedFailureDate: null,
        estimatedRepairCost: null,
        estimatedDowntime: null,
        recommendedAction: 'Collect more telemetry data',
      };
    }

    const temps = telemetry.map(t => t.coolantTemp || 0);
    const avgTemp = temps.reduce((sum, t) => sum + t, 0) / temps.length;
    const maxTemp = Math.max(...temps);
    const tempTrend = calculateTrend(temps);

    let daysToFailure = 30;
    let confidence = 50;
    let riskLevel = 'Low';

    if (maxTemp > 105 || avgTemp > 100) {
      daysToFailure = 1;
      confidence = 95;
      riskLevel = 'Critical';
    } else if (maxTemp > 100 || avgTemp > 95) {
      daysToFailure = 7;
      confidence = 85;
      riskLevel = 'High';
    } else if (maxTemp > 95 || avgTemp > 90) {
      daysToFailure = 21;
      confidence = 70;
      riskLevel = 'Medium';
    }

    if (tempTrend > 0.5) {
      confidence = Math.min(100, confidence + 10);
      daysToFailure = Math.max(1, daysToFailure - 5);
    }

    const estimatedFailureDate = new Date();
    estimatedFailureDate.setDate(estimatedFailureDate.getDate() + daysToFailure);

    return {
      prediction: `Cooling system ${riskLevel.toLowerCase()} risk of failure`,
      confidence,
      reason: `Average temp: ${avgTemp.toFixed(1)}°C, Maximum: ${maxTemp.toFixed(1)}°C, Trend: ${tempTrend > 0 ? 'Rising' : 'Stable'}`,
      historicalTrend: tempTrend > 0.5 ? 'Rapid Rise' : tempTrend > 0 ? 'Slow Rise' : 'Stable',
      estimatedFailureDate: estimatedFailureDate.toISOString().split('T')[0],
      estimatedRepairCost: riskLevel === 'Critical' ? 300 : riskLevel === 'High' ? 200 : 150,
      estimatedDowntime: riskLevel === 'Critical' ? 8 : 4,
      recommendedAction: riskLevel === 'Critical'
        ? 'Stop vehicle immediately, check cooling system'
        : riskLevel === 'High'
        ? 'Inspect radiator, water pump, and coolant level within 7 days'
        : 'Monitor coolant temperature weekly',
    };
  } catch (error) {
    logger.error('Error predicting coolant failure', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Predict brake wear
 */
export async function predictBrakeWear(vehicleId) {
  try {
    const behaviorEvents = await prisma.behaviorEvent.findMany({
      where: { vehicleId, eventType: 'HARSH_BRAKE' },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    const trips = await prisma.trip.findMany({
      where: { vehicleId },
      orderBy: { startTime: 'desc' },
      take: 30,
    });

    if (trips.length === 0) {
      return {
        prediction: 'No trip data available',
        confidence: 0,
        reason: 'Insufficient data',
        historicalTrend: 'Unknown',
        estimatedFailureDate: null,
        estimatedRepairCost: null,
        estimatedDowntime: null,
        recommendedAction: 'Collect more trip data',
      };
    }

    const harshBrakingRate = behaviorEvents.length / trips.length;
    const totalDistance = trips.reduce((sum, t) => sum + (t.distance || 0), 0);

    let daysToFailure = 180;
    let confidence = 60;
    let riskLevel = 'Low';

    if (harshBrakingRate > 0.3) {
      daysToFailure = 60;
      confidence = 80;
      riskLevel = 'High';
    } else if (harshBrakingRate > 0.15) {
      daysToFailure = 120;
      confidence = 70;
      riskLevel = 'Medium';
    }

    const estimatedFailureDate = new Date();
    estimatedFailureDate.setDate(estimatedFailureDate.getDate() + daysToFailure);

    return {
      prediction: `Brake pads ${riskLevel.toLowerCase()} wear risk`,
      confidence,
      reason: `Harsh braking rate: ${(harshBrakingRate * 100).toFixed(1)}%, Total distance: ${totalDistance.toFixed(0)}km`,
      historicalTrend: harshBrakingRate > 0.2 ? 'High Wear Pattern' : 'Normal Wear Pattern',
      estimatedFailureDate: estimatedFailureDate.toISOString().split('T')[0],
      estimatedRepairCost: riskLevel === 'High' ? 250 : 200,
      estimatedDowntime: 4,
      recommendedAction: riskLevel === 'High'
        ? 'Schedule brake inspection within 60 days'
        : 'Monitor brake wear and schedule inspection within 120 days',
    };
  } catch (error) {
    logger.error('Error predicting brake wear', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Predict tyre replacement
 */
export async function predictTyreReplacement(vehicleId) {
  try {
    const trips = await prisma.trip.findMany({
      where: { vehicleId },
      orderBy: { startTime: 'desc' },
      take: 50,
    });

    if (trips.length === 0) {
      return {
        prediction: 'No trip data available',
        confidence: 0,
        reason: 'Insufficient data',
        historicalTrend: 'Unknown',
        estimatedFailureDate: null,
        estimatedRepairCost: null,
        estimatedDowntime: null,
        recommendedAction: 'Collect more trip data',
      };
    }

    const totalDistance = trips.reduce((sum, t) => sum + (t.distance || 0), 0);
    const avgDistancePerTrip = totalDistance / trips.length;

    // Assuming tyre life is 40,000km
    const tyreLife = 40000;
    const remainingLife = tyreLife - totalDistance;
    const daysToFailure = remainingLife > 0 ? (remainingLife / avgDistancePerTrip) * 7 : 0;

    let confidence = 70;
    let riskLevel = 'Low';

    if (remainingLife < 5000) {
      confidence = 90;
      riskLevel = 'Critical';
    } else if (remainingLife < 10000) {
      confidence = 80;
      riskLevel = 'High';
    } else if (remainingLife < 20000) {
      confidence = 70;
      riskLevel = 'Medium';
    }

    const estimatedFailureDate = daysToFailure > 0 ? new Date() : new Date();
    estimatedFailureDate.setDate(estimatedFailureDate.getDate() + Math.max(1, daysToFailure));

    return {
      prediction: `Tyres ${riskLevel.toLowerCase()} replacement risk`,
      confidence,
      reason: `Total distance: ${totalDistance.toFixed(0)}km, Remaining life: ${remainingLife.toFixed(0)}km`,
      historicalTrend: remainingLife < 10000 ? 'Near End of Life' : 'Normal Wear',
      estimatedFailureDate: estimatedFailureDate.toISOString().split('T')[0],
      estimatedRepairCost: riskLevel === 'Critical' ? 600 : 500,
      estimatedDowntime: 4,
      recommendedAction: riskLevel === 'Critical'
        ? 'Replace tyres immediately'
        : riskLevel === 'High'
        ? 'Schedule tyre replacement within 30 days'
        : 'Monitor tyre wear and plan replacement',
    };
  } catch (error) {
    logger.error('Error predicting tyre replacement', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Predict alternator failure
 */
export async function predictAlternatorFailure(vehicleId) {
  try {
    const telemetry = await prisma.obdLiveData.findMany({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
      take: 20,
    });

    if (telemetry.length === 0) {
      return {
        prediction: 'No telemetry data available',
        confidence: 0,
        reason: 'Insufficient data',
        historicalTrend: 'Unknown',
        estimatedFailureDate: null,
        estimatedRepairCost: null,
        estimatedDowntime: null,
        recommendedAction: 'Collect more telemetry data',
      };
    }

    const voltages = telemetry.map(t => t.batteryVoltage || 0);
    const avgVoltage = voltages.reduce((sum, v) => sum + v, 0) / voltages.length;
    const voltageVariance = calculateVariance(voltages);

    // High voltage variance indicates alternator issues
    let daysToFailure = 90;
    let confidence = 50;
    let riskLevel = 'Low';

    if (voltageVariance > 2.0 || avgVoltage > 14.5) {
      daysToFailure = 14;
      confidence = 85;
      riskLevel = 'High';
    } else if (voltageVariance > 1.0) {
      daysToFailure = 45;
      confidence = 70;
      riskLevel = 'Medium';
    }

    const estimatedFailureDate = new Date();
    estimatedFailureDate.setDate(estimatedFailureDate.getDate() + daysToFailure);

    return {
      prediction: `Alternator ${riskLevel.toLowerCase()} failure risk`,
      confidence,
      reason: `Voltage variance: ${voltageVariance.toFixed(2)}V, Average: ${avgVoltage.toFixed(2)}V`,
      historicalTrend: voltageVariance > 1.5 ? 'Unstable Charging' : 'Stable Charging',
      estimatedFailureDate: estimatedFailureDate.toISOString().split('T')[0],
      estimatedRepairCost: riskLevel === 'High' ? 350 : 280,
      estimatedDowntime: 6,
      recommendedAction: riskLevel === 'High'
        ? 'Inspect alternator and voltage regulator within 14 days'
        : 'Monitor charging system voltage',
    };
  } catch (error) {
    logger.error('Error predicting alternator failure', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Predict engine overheating
 */
export async function predictEngineOverheating(vehicleId) {
  try {
    const telemetry = await prisma.obdLiveData.findMany({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
      take: 30,
    });

    const dtcCodes = await prisma.dtcCode.findMany({
      where: { vehicleId, active: true },
    });

    if (telemetry.length === 0) {
      return {
        prediction: 'No telemetry data available',
        confidence: 0,
        reason: 'Insufficient data',
        historicalTrend: 'Unknown',
        estimatedFailureDate: null,
        estimatedRepairCost: null,
        estimatedDowntime: null,
        recommendedAction: 'Collect more telemetry data',
      };
    }

    const temps = telemetry.map(t => t.coolantTemp || 0);
    const avgTemp = temps.reduce((sum, t) => sum + t, 0) / temps.length;
    const maxTemp = Math.max(...temps);
    const tempTrend = calculateTrend(temps);

    // Check for overheating DTCs
    const overheatingDTCs = dtcCodes.filter(d => 
      d.code.includes('0217') || d.code.includes('0218') || d.code.includes('0125')
    );

    let daysToFailure = 60;
    let confidence = 50;
    let riskLevel = 'Low';

    if (maxTemp > 110 || overheatingDTCs.length > 0) {
      daysToFailure = 3;
      confidence = 95;
      riskLevel = 'Critical';
    } else if (maxTemp > 105 || avgTemp > 100) {
      daysToFailure = 14;
      confidence = 85;
      riskLevel = 'High';
    } else if (tempTrend > 0.3) {
      daysToFailure = 30;
      confidence = 70;
      riskLevel = 'Medium';
    }

    const estimatedFailureDate = new Date();
    estimatedFailureDate.setDate(estimatedFailureDate.getDate() + daysToFailure);

    return {
      prediction: `Engine ${riskLevel.toLowerCase()} overheating risk`,
      confidence,
      reason: `Max temp: ${maxTemp.toFixed(1)}°C, Avg: ${avgTemp.toFixed(1)}°C, Trend: ${tempTrend > 0 ? 'Rising' : 'Stable'}`,
      historicalTrend: tempTrend > 0.5 ? 'Rapid Temperature Rise' : tempTrend > 0 ? 'Slow Temperature Rise' : 'Stable',
      estimatedFailureDate: estimatedFailureDate.toISOString().split('T')[0],
      estimatedRepairCost: riskLevel === 'Critical' ? 800 : riskLevel === 'High' ? 500 : 300,
      estimatedDowntime: riskLevel === 'Critical' ? 24 : 8,
      recommendedAction: riskLevel === 'Critical'
        ? 'Stop vehicle immediately, do not operate until cooling system is repaired'
        : riskLevel === 'High'
        ? 'Inspect cooling system within 14 days'
        : 'Monitor coolant temperature',
    };
  } catch (error) {
    logger.error('Error predicting engine overheating', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Predict transmission failure
 */
export async function predictTransmissionFailure(vehicleId) {
  try {
    const dtcCodes = await prisma.dtcCode.findMany({
      where: { vehicleId, active: true },
    });

    const behaviorEvents = await prisma.behaviorEvent.findMany({
      where: { vehicleId },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    // Check for transmission-related DTCs
    const transmissionDTCs = dtcCodes.filter(d => 
      d.code.startsWith('P07') || d.code.includes('0700')
    );

    const harshShifting = behaviorEvents.filter(e => e.eventType === 'HARSH_ACCEL').length;

    let daysToFailure = 180;
    let confidence = 40;
    let riskLevel = 'Low';

    if (transmissionDTCs.length > 0) {
      daysToFailure = 30;
      confidence = 85;
      riskLevel = 'High';
    } else if (harshShifting > 20) {
      daysToFailure = 90;
      confidence = 60;
      riskLevel = 'Medium';
    }

    const estimatedFailureDate = new Date();
    estimatedFailureDate.setDate(estimatedFailureDate.getDate() + daysToFailure);

    return {
      prediction: `Transmission ${riskLevel.toLowerCase()} failure risk`,
      confidence,
      reason: `Transmission DTCs: ${transmissionDTCs.length}, Harsh acceleration events: ${harshShifting}`,
      historicalTrend: transmissionDTCs.length > 0 ? 'Active Issues Detected' : 'No Active Issues',
      estimatedFailureDate: estimatedFailureDate.toISOString().split('T')[0],
      estimatedRepairCost: riskLevel === 'High' ? 2000 : 1500,
      estimatedDowntime: riskLevel === 'High' ? 48 : 24,
      recommendedAction: riskLevel === 'High'
        ? 'Schedule transmission inspection immediately'
        : 'Monitor transmission performance and avoid harsh acceleration',
    };
  } catch (error) {
    logger.error('Error predicting transmission failure', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Predict maintenance date
 */
export async function predictMaintenanceDate(vehicleId) {
  try {
    const maintenanceLogs = await prisma.maintenanceLog.findMany({
      where: { vehicleId, completed: false },
      orderBy: { dueDate: 'asc' },
    });

    const telemetry = await prisma.obdLiveData.findMany({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
      take: 10,
    });

    if (maintenanceLogs.length === 0) {
      // Predict based on mileage
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: vehicleId },
      });

      if (!vehicle) {
        return {
          prediction: 'Vehicle not found',
          confidence: 0,
          reason: 'Vehicle not found',
          historicalTrend: 'Unknown',
          estimatedFailureDate: null,
          estimatedRepairCost: null,
          estimatedDowntime: null,
          recommendedAction: 'Check vehicle exists',
        };
      }

      const odometer = vehicle.odometer || 0;
      const nextServiceInterval = 10000; // Every 10,000km
      const nextServiceMileage = Math.ceil(odometer / nextServiceInterval) * nextServiceInterval;
      const kmUntilService = nextServiceMileage - odometer;

      // Estimate days based on average daily usage (50km/day)
      const daysUntilService = kmUntilService / 50;

      const estimatedServiceDate = new Date();
      estimatedServiceDate.setDate(estimatedServiceDate.getDate() + daysUntilService);

      return {
        prediction: 'Next scheduled maintenance',
        confidence: 70,
        reason: `Current odometer: ${odometer}km, Next service at: ${nextServiceMileage}km`,
        historicalTrend: 'Predicted based on mileage',
        estimatedFailureDate: estimatedServiceDate.toISOString().split('T')[0],
        estimatedRepairCost: 150,
        estimatedDowntime: 2,
        recommendedAction: `Schedule maintenance at ${nextServiceMileage}km or by ${estimatedServiceDate.toISOString().split('T')[0]}`,
      };
    }

    const nextMaintenance = maintenanceLogs[0];
    const daysUntilDue = Math.ceil((new Date(nextMaintenance.dueDate) - new Date()) / (1000 * 60 * 60 * 24));

    // Adjust based on vehicle health
    let adjustedDays = daysUntilDue;
    if (telemetry.length > 0) {
      const avgCoolant = telemetry.reduce((sum, t) => sum + (t.coolantTemp || 0), 0) / telemetry.length;
      if (avgCoolant > 95) {
        adjustedDays = Math.max(1, daysUntilDue - 7);
      }
    }

    const estimatedDate = new Date();
    estimatedDate.setDate(estimatedDate.getDate() + adjustedDays);

    return {
      prediction: `Next maintenance: ${nextMaintenance.type}`,
      confidence: 85,
      reason: `Scheduled for: ${nextMaintenance.dueDate.split('T')[0]}, Priority: ${nextMaintenance.priority}`,
      historicalTrend: 'Scheduled maintenance',
      estimatedFailureDate: estimatedDate.toISOString().split('T')[0],
      estimatedRepairCost: nextMaintenance.estimatedCost || 150,
      estimatedDowntime: 2,
      recommendedAction: `Complete ${nextMaintenance.type} by ${estimatedDate.toISOString().split('T')[0]}`,
    };
  } catch (error) {
    logger.error('Error predicting maintenance date', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Get all predictions for a vehicle
 */
export async function getAllPredictions(vehicleId) {
  try {
    const [
      batteryPrediction,
      coolantPrediction,
      brakePrediction,
      tyrePrediction,
      alternatorPrediction,
      engineOverheatingPrediction,
      transmissionPrediction,
      maintenancePrediction,
    ] = await Promise.all([
      predictBatteryFailure(vehicleId),
      predictCoolantFailure(vehicleId),
      predictBrakeWear(vehicleId),
      predictTyreReplacement(vehicleId),
      predictAlternatorFailure(vehicleId),
      predictEngineOverheating(vehicleId),
      predictTransmissionFailure(vehicleId),
      predictMaintenanceDate(vehicleId),
    ]);

    return {
      battery: batteryPrediction,
      coolant: coolantPrediction,
      brakes: brakePrediction,
      tyres: tyrePrediction,
      alternator: alternatorPrediction,
      engine: engineOverheatingPrediction,
      transmission: transmissionPrediction,
      maintenance: maintenancePrediction,
    };
  } catch (error) {
    logger.error('Error getting all predictions', { vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Helper function to calculate trend
 */
function calculateTrend(values) {
  if (values.length < 2) return 0;
  const n = values.length;
  const sumX = (n * (n - 1)) / 2;
  const sumY = values.reduce((sum, val) => sum + val, 0);
  const sumXY = values.reduce((sum, val, idx) => sum + (idx * val), 0);
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return slope;
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
