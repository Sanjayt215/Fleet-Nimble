/**
 * AI Smart Notifications Service
 * Provides predictive alerts and intelligent notifications for fleet operations
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { getAllPredictions } from './aiPredictions.js';
import { calculateAllVehicleHealthScores } from './aiAnalysisEngine.js';

/**
 * Notification types
 */
export const NOTIFICATION_TYPES = {
  PREDICTIVE_ALERT: 'predictive_alert',
  BATTERY_WARNING: 'battery_warning',
  COOLANT_WARNING: 'coolant_warning',
  ENGINE_WARNING: 'engine_warning',
  FUEL_WARNING: 'fuel_warning',
  MAINTENANCE_REMINDER: 'maintenance_reminder',
  INSURANCE_REMINDER: 'insurance_reminder',
  REGISTRATION_REMINDER: 'registration_reminder',
};

/**
 * Notification priorities
 */
export const NOTIFICATION_PRIORITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
};

/**
 * Generate predictive alerts based on AI predictions
 */
export async function generatePredictiveAlerts(userId) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, make: true, model: true, plateNumber: true, vin: true },
    });

    const alerts = [];

    for (const vehicle of vehicles) {
      try {
        const predictions = await getAllPredictions(vehicle.id);
        
        // Check for high-confidence predictions
        if (predictions.battery.confidence > 80 && predictions.battery.prediction.toLowerCase().includes('failure')) {
          alerts.push({
            type: NOTIFICATION_TYPES.BATTERY_WARNING,
            priority: predictions.battery.confidence > 90 ? NOTIFICATION_PRIORITY.CRITICAL : NOTIFICATION_PRIORITY.HIGH,
            vehicleId: vehicle.id,
            vehicle: `${vehicle.make} ${vehicle.model}`,
            plate: vehicle.plateNumber || vehicle.vin,
            message: `Battery failure predicted with ${predictions.battery.confidence}% confidence. Estimated failure: ${predictions.battery.estimatedFailureDate}`,
            confidence: predictions.battery.confidence,
            estimatedFailureDate: predictions.battery.estimatedFailureDate,
            recommendedAction: predictions.battery.recommendedAction,
            estimatedCost: predictions.battery.estimatedRepairCost,
            estimatedDowntime: predictions.battery.estimatedDowntime,
          });
        }

        if (predictions.coolant.confidence > 80 && predictions.coolant.prediction.toLowerCase().includes('failure')) {
          alerts.push({
            type: NOTIFICATION_TYPES.COOLANT_WARNING,
            priority: predictions.coolant.confidence > 90 ? NOTIFICATION_PRIORITY.CRITICAL : NOTIFICATION_PRIORITY.HIGH,
            vehicleId: vehicle.id,
            vehicle: `${vehicle.make} ${vehicle.model}`,
            plate: vehicle.plateNumber || vehicle.vin,
            message: `Coolant system failure predicted with ${predictions.coolant.confidence}% confidence. Estimated failure: ${predictions.coolant.estimatedFailureDate}`,
            confidence: predictions.coolant.confidence,
            estimatedFailureDate: predictions.coolant.estimatedFailureDate,
            recommendedAction: predictions.coolant.recommendedAction,
            estimatedCost: predictions.coolant.estimatedRepairCost,
            estimatedDowntime: predictions.coolant.estimatedDowntime,
          });
        }

        if (predictions.engineOverheating.confidence > 80 && predictions.engineOverheating.prediction.toLowerCase().includes('overheat')) {
          alerts.push({
            type: NOTIFICATION_TYPES.ENGINE_WARNING,
            priority: predictions.engineOverheating.confidence > 90 ? NOTIFICATION_PRIORITY.CRITICAL : NOTIFICATION_PRIORITY.HIGH,
            vehicleId: vehicle.id,
            vehicle: `${vehicle.make} ${vehicle.model}`,
            plate: vehicle.plateNumber || vehicle.vin,
            message: `Engine overheating predicted with ${predictions.engineOverheating.confidence}% confidence. Estimated failure: ${predictions.engineOverheating.estimatedFailureDate}`,
            confidence: predictions.engineOverheating.confidence,
            estimatedFailureDate: predictions.engineOverheating.estimatedFailureDate,
            recommendedAction: predictions.engineOverheating.recommendedAction,
            estimatedCost: predictions.engineOverheating.estimatedRepairCost,
            estimatedDowntime: predictions.engineOverheating.estimatedDowntime,
          });
        }
      } catch (error) {
        logger.error('Error generating predictive alert for vehicle', { vehicleId: vehicle.id, error: error.message });
      }
    }

    logger.info('Predictive alerts generated', { userId, alertCount: alerts.length });

    return alerts;
  } catch (error) {
    logger.error('Error generating predictive alerts', { userId, error: error.message });
    throw error;
  }
}

/**
 * Generate battery warning
 */
export async function generateBatteryWarning(userId, vehicleId) {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, userId, deletedAt: null },
      include: { liveData: { orderBy: { timestamp: 'desc' }, take: 1 } },
    });

    if (!vehicle || !vehicle.liveData || vehicle.liveData.length === 0) {
      return null;
    }

    const latestData = vehicle.liveData[0];
    const batteryVoltage = latestData.batteryVoltage || 0;

    let warning = null;
    if (batteryVoltage < 11.5) {
      warning = {
        type: NOTIFICATION_TYPES.BATTERY_WARNING,
        priority: NOTIFICATION_PRIORITY.CRITICAL,
        vehicleId: vehicle.id,
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        message: `Critical battery voltage: ${batteryVoltage.toFixed(1)}V. Immediate attention required.`,
        currentVoltage: batteryVoltage,
        recommendedAction: 'Charge or replace battery immediately',
        timestamp: new Date().toISOString(),
      };
    } else if (batteryVoltage < 12.0) {
      warning = {
        type: NOTIFICATION_TYPES.BATTERY_WARNING,
        priority: NOTIFICATION_PRIORITY.HIGH,
        vehicleId: vehicle.id,
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        message: `Low battery voltage: ${batteryVoltage.toFixed(1)}V. Battery should be charged soon.`,
        currentVoltage: batteryVoltage,
        recommendedAction: 'Charge battery within 24 hours',
        timestamp: new Date().toISOString(),
      };
    } else if (batteryVoltage < 12.5) {
      warning = {
        type: NOTIFICATION_TYPES.BATTERY_WARNING,
        priority: NOTIFICATION_PRIORITY.MEDIUM,
        vehicleId: vehicle.id,
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        message: `Battery voltage below optimal: ${batteryVoltage.toFixed(1)}V. Monitor battery health.`,
        currentVoltage: batteryVoltage,
        recommendedAction: 'Monitor battery voltage',
        timestamp: new Date().toISOString(),
      };
    }

    return warning;
  } catch (error) {
    logger.error('Error generating battery warning', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Generate coolant warning
 */
export async function generateCoolantWarning(userId, vehicleId) {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, userId, deletedAt: null },
      include: { liveData: { orderBy: { timestamp: 'desc' }, take: 1 } },
    });

    if (!vehicle || !vehicle.liveData || vehicle.liveData.length === 0) {
      return null;
    }

    const latestData = vehicle.liveData[0];
    const coolantTemp = latestData.coolantTemp || 0;

    let warning = null;
    if (coolantTemp > 105) {
      warning = {
        type: NOTIFICATION_TYPES.COOLANT_WARNING,
        priority: NOTIFICATION_PRIORITY.CRITICAL,
        vehicleId: vehicle.id,
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        message: `Critical coolant temperature: ${coolantTemp.toFixed(1)}°C. Engine may overheat.`,
        currentTemp: coolantTemp,
        recommendedAction: 'Stop vehicle immediately and check cooling system',
        timestamp: new Date().toISOString(),
      };
    } else if (coolantTemp > 100) {
      warning = {
        type: NOTIFICATION_TYPES.COOLANT_WARNING,
        priority: NOTIFICATION_PRIORITY.HIGH,
        vehicleId: vehicle.id,
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        message: `High coolant temperature: ${coolantTemp.toFixed(1)}°C. Monitor closely.`,
        currentTemp: coolantTemp,
        recommendedAction: 'Reduce load and check coolant level',
        timestamp: new Date().toISOString(),
      };
    } else if (coolantTemp > 95) {
      warning = {
        type: NOTIFICATION_TYPES.COOLANT_WARNING,
        priority: NOTIFICATION_PRIORITY.MEDIUM,
        vehicleId: vehicle.id,
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        message: `Elevated coolant temperature: ${coolantTemp.toFixed(1)}°C.`,
        currentTemp: coolantTemp,
        recommendedAction: 'Monitor coolant temperature',
        timestamp: new Date().toISOString(),
      };
    }

    return warning;
  } catch (error) {
    logger.error('Error generating coolant warning', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Generate engine warning
 */
export async function generateEngineWarning(userId, vehicleId) {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, userId, deletedAt: null },
      include: {
        dtcCodes: { where: { active: true } },
        liveData: { orderBy: { timestamp: 'desc' }, take: 1 },
      },
    });

    if (!vehicle) {
      return null;
    }

    const warnings = [];
    const activeDTCs = vehicle.dtcCodes.filter(dtc => dtc.active);

    if (activeDTCs.length > 0) {
      const criticalDTCs = activeDTCs.filter(dtc => dtc.code.startsWith('P0') || dtc.code.startsWith('P2'));
      if (criticalDTCs.length > 0) {
        warnings.push({
          type: NOTIFICATION_TYPES.ENGINE_WARNING,
          priority: NOTIFICATION_PRIORITY.HIGH,
          vehicleId: vehicle.id,
          vehicle: `${vehicle.make} ${vehicle.model}`,
          plate: vehicle.plateNumber || vehicle.vin,
          message: `${criticalDTCs.length} critical engine DTC codes detected: ${criticalDTCs.map(d => d.code).join(', ')}`,
          dtcCodes: criticalDTCs.map(d => d.code),
          recommendedAction: 'Schedule diagnostic inspection immediately',
          timestamp: new Date().toISOString(),
        });
      }
    }

    if (vehicle.liveData && vehicle.liveData.length > 0) {
      const latestData = vehicle.liveData[0];
      const rpm = latestData.rpm || 0;
      
      if (rpm > 6000) {
        warnings.push({
          type: NOTIFICATION_TYPES.ENGINE_WARNING,
          priority: NOTIFICATION_PRIORITY.MEDIUM,
          vehicleId: vehicle.id,
          vehicle: `${vehicle.make} ${vehicle.model}`,
          plate: vehicle.plateNumber || vehicle.vin,
          message: `High RPM detected: ${rpm}. Reduce engine speed.`,
          currentRPM: rpm,
          recommendedAction: 'Reduce engine speed to prevent damage',
          timestamp: new Date().toISOString(),
        });
      }
    }

    return warnings.length > 0 ? warnings : null;
  } catch (error) {
    logger.error('Error generating engine warning', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Generate fuel warning
 */
export async function generateFuelWarning(userId, vehicleId) {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, userId, deletedAt: null },
      include: { liveData: { orderBy: { timestamp: 'desc' }, take: 1 } },
    });

    if (!vehicle || !vehicle.liveData || vehicle.liveData.length === 0) {
      return null;
    }

    const latestData = vehicle.liveData[0];
    const fuelLevel = latestData.fuelLevel || 0;

    let warning = null;
    if (fuelLevel < 10) {
      warning = {
        type: NOTIFICATION_TYPES.FUEL_WARNING,
        priority: NOTIFICATION_PRIORITY.CRITICAL,
        vehicleId: vehicle.id,
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        message: `Critical fuel level: ${fuelLevel.toFixed(1)}%. Refuel immediately.`,
        currentFuelLevel: fuelLevel,
        recommendedAction: 'Refuel immediately',
        timestamp: new Date().toISOString(),
      };
    } else if (fuelLevel < 20) {
      warning = {
        type: NOTIFICATION_TYPES.FUEL_WARNING,
        priority: NOTIFICATION_PRIORITY.HIGH,
        vehicleId: vehicle.id,
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        message: `Low fuel level: ${fuelLevel.toFixed(1)}%. Plan to refuel soon.`,
        currentFuelLevel: fuelLevel,
        recommendedAction: 'Refuel within 50 km',
        timestamp: new Date().toISOString(),
      };
    }

    return warning;
  } catch (error) {
    logger.error('Error generating fuel warning', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Generate maintenance reminder
 */
export async function generateMaintenanceReminder(userId, vehicleId) {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, userId, deletedAt: null },
      include: {
        maintenanceLogs: {
          where: { completed: false },
          orderBy: { dueDate: 'asc' },
          take: 5,
        },
      },
    });

    if (!vehicle || vehicle.maintenanceLogs.length === 0) {
      return null;
    }

    const now = new Date();
    const reminders = [];

    for (const maintenance of vehicle.maintenanceLogs) {
      const dueDate = new Date(maintenance.dueDate);
      const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

      let priority = NOTIFICATION_PRIORITY.LOW;
      if (daysUntilDue <= 0) priority = NOTIFICATION_PRIORITY.CRITICAL;
      else if (daysUntilDue <= 3) priority = NOTIFICATION_PRIORITY.HIGH;
      else if (daysUntilDue <= 7) priority = NOTIFICATION_PRIORITY.MEDIUM;

      reminders.push({
        type: NOTIFICATION_TYPES.MAINTENANCE_REMINDER,
        priority,
        vehicleId: vehicle.id,
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        message: `Maintenance due: ${maintenance.type}. Due date: ${dueDate.toISOString().split('T')[0]} (${daysUntilDue} days)`,
        maintenanceType: maintenance.type,
        dueDate: maintenance.dueDate,
        daysUntilDue,
        priority: maintenance.priority,
        estimatedCost: maintenance.estimatedCost,
        timestamp: new Date().toISOString(),
      });
    }

    return reminders;
  } catch (error) {
    logger.error('Error generating maintenance reminder', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Generate insurance reminder
 */
export async function generateInsuranceReminder(userId, vehicleId) {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, userId, deletedAt: null },
    });

    if (!vehicle) {
      return null;
    }

    // In production, this would check actual insurance expiry date
    // For now, simulate based on vehicle registration
    const insuranceExpiry = new Date(vehicle.createdAt);
    insuranceExpiry.setFullYear(insuranceExpiry.getFullYear() + 1);

    const now = new Date();
    const daysUntilExpiry = Math.ceil((insuranceExpiry - now) / (1000 * 60 * 60 * 24));

    let reminder = null;
    if (daysUntilExpiry <= 0) {
      reminder = {
        type: NOTIFICATION_TYPES.INSURANCE_REMINDER,
        priority: NOTIFICATION_PRIORITY.CRITICAL,
        vehicleId: vehicle.id,
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        message: `Insurance expired on ${insuranceExpiry.toISOString().split('T')[0]}. Renew immediately.`,
        expiryDate: insuranceExpiry.toISOString().split('T')[0],
        daysUntilExpiry,
        recommendedAction: 'Renew insurance immediately',
        timestamp: new Date().toISOString(),
      };
    } else if (daysUntilExpiry <= 30) {
      reminder = {
        type: NOTIFICATION_TYPES.INSURANCE_REMINDER,
        priority: NOTIFICATION_PRIORITY.HIGH,
        vehicleId: vehicle.id,
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        message: `Insurance expires on ${insuranceExpiry.toISOString().split('T')[0]} (${daysUntilExpiry} days). Renew soon.`,
        expiryDate: insuranceExpiry.toISOString().split('T')[0],
        daysUntilExpiry,
        recommendedAction: 'Renew insurance before expiry',
        timestamp: new Date().toISOString(),
      };
    } else if (daysUntilExpiry <= 60) {
      reminder = {
        type: NOTIFICATION_TYPES.INSURANCE_REMINDER,
        priority: NOTIFICATION_PRIORITY.MEDIUM,
        vehicleId: vehicle.id,
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        message: `Insurance expires on ${insuranceExpiry.toISOString().split('T')[0]} (${daysUntilExpiry} days).`,
        expiryDate: insuranceExpiry.toISOString().split('T')[0],
        daysUntilExpiry,
        recommendedAction: 'Plan insurance renewal',
        timestamp: new Date().toISOString(),
      };
    }

    return reminder;
  } catch (error) {
    logger.error('Error generating insurance reminder', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Generate registration reminder
 */
export async function generateRegistrationReminder(userId, vehicleId) {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, userId, deletedAt: null },
    });

    if (!vehicle) {
      return null;
    }

    // In production, this would check actual registration expiry date
    // For now, simulate based on vehicle creation
    const registrationExpiry = new Date(vehicle.createdAt);
    registrationExpiry.setFullYear(registrationExpiry.getFullYear() + 1);

    const now = new Date();
    const daysUntilExpiry = Math.ceil((registrationExpiry - now) / (1000 * 60 * 60 * 24));

    let reminder = null;
    if (daysUntilExpiry <= 0) {
      reminder = {
        type: NOTIFICATION_TYPES.REGISTRATION_REMINDER,
        priority: NOTIFICATION_PRIORITY.CRITICAL,
        vehicleId: vehicle.id,
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        message: `Vehicle registration expired on ${registrationExpiry.toISOString().split('T')[0]}. Renew immediately.`,
        expiryDate: registrationExpiry.toISOString().split('T')[0],
        daysUntilExpiry,
        recommendedAction: 'Renew registration immediately',
        timestamp: new Date().toISOString(),
      };
    } else if (daysUntilExpiry <= 30) {
      reminder = {
        type: NOTIFICATION_TYPES.REGISTRATION_REMINDER,
        priority: NOTIFICATION_PRIORITY.HIGH,
        vehicleId: vehicle.id,
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        message: `Vehicle registration expires on ${registrationExpiry.toISOString().split('T')[0]} (${daysUntilExpiry} days). Renew soon.`,
        expiryDate: registrationExpiry.toISOString().split('T')[0],
        daysUntilExpiry,
        recommendedAction: 'Renew registration before expiry',
        timestamp: new Date().toISOString(),
      };
    } else if (daysUntilExpiry <= 60) {
      reminder = {
        type: NOTIFICATION_TYPES.REGISTRATION_REMINDER,
        priority: NOTIFICATION_PRIORITY.MEDIUM,
        vehicleId: vehicle.id,
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        message: `Vehicle registration expires on ${registrationExpiry.toISOString().split('T')[0]} (${daysUntilExpiry} days).`,
        expiryDate: registrationExpiry.toISOString().split('T')[0],
        daysUntilExpiry,
        recommendedAction: 'Plan registration renewal',
        timestamp: new Date().toISOString(),
      };
    }

    return reminder;
  } catch (error) {
    logger.error('Error generating registration reminder', { userId, vehicleId, error: error.message });
    throw error;
  }
}

/**
 * Generate all smart notifications for a user
 */
export async function generateAllSmartNotifications(userId) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      select: { id: true },
    });

    const allNotifications = [];

    // Generate predictive alerts
    const predictiveAlerts = await generatePredictiveAlerts(userId);
    allNotifications.push(...predictiveAlerts);

    // Generate vehicle-specific notifications
    for (const vehicle of vehicles) {
      const [batteryWarning, coolantWarning, engineWarning, fuelWarning, maintenanceReminder, insuranceReminder, registrationReminder] = await Promise.all([
        generateBatteryWarning(userId, vehicle.id),
        generateCoolantWarning(userId, vehicle.id),
        generateEngineWarning(userId, vehicle.id),
        generateFuelWarning(userId, vehicle.id),
        generateMaintenanceReminder(userId, vehicle.id),
        generateInsuranceReminder(userId, vehicle.id),
        generateRegistrationReminder(userId, vehicle.id),
      ]);

      if (batteryWarning) allNotifications.push(batteryWarning);
      if (coolantWarning) allNotifications.push(coolantWarning);
      if (engineWarning) {
        if (Array.isArray(engineWarning)) {
          allNotifications.push(...engineWarning);
        } else {
          allNotifications.push(engineWarning);
        }
      }
      if (fuelWarning) allNotifications.push(fuelWarning);
      if (maintenanceReminder) {
        if (Array.isArray(maintenanceReminder)) {
          allNotifications.push(...maintenanceReminder);
        } else {
          allNotifications.push(maintenanceReminder);
        }
      }
      if (insuranceReminder) allNotifications.push(insuranceReminder);
      if (registrationReminder) allNotifications.push(registrationReminder);
    }

    // Sort by priority
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    allNotifications.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    logger.info('All smart notifications generated', { userId, notificationCount: allNotifications.length });

    return {
      userId,
      generatedAt: new Date().toISOString(),
      totalNotifications: allNotifications.length,
      criticalCount: allNotifications.filter(n => n.priority === NOTIFICATION_PRIORITY.CRITICAL).length,
      highCount: allNotifications.filter(n => n.priority === NOTIFICATION_PRIORITY.HIGH).length,
      mediumCount: allNotifications.filter(n => n.priority === NOTIFICATION_PRIORITY.MEDIUM).length,
      lowCount: allNotifications.filter(n => n.priority === NOTIFICATION_PRIORITY.LOW).length,
      notifications: allNotifications,
    };
  } catch (error) {
    logger.error('Error generating all smart notifications', { userId, error: error.message });
    throw error;
  }
}

/**
 * Schedule smart notifications check (runs every hour)
 */
let smartNotificationsInterval = null;

export function scheduleSmartNotificationsCheck() {
  if (smartNotificationsInterval) return;
  
  smartNotificationsInterval = setInterval(async () => {
    try {
      const users = await prisma.user.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });

      for (const user of users) {
        try {
          const notifications = await generateAllSmartNotifications(user.id);
          
          // Save critical and high priority notifications to database
          const criticalNotifications = notifications.notifications.filter(
            n => n.priority === NOTIFICATION_PRIORITY.CRITICAL || n.priority === NOTIFICATION_PRIORITY.HIGH
          );

          for (const notification of criticalNotifications) {
            await prisma.notification.create({
              data: {
                userId: user.id,
                message: notification.message,
                type: notification.type,
                priority: notification.priority,
                read: false,
                metadata: notification,
              },
            });
          }

          logger.info('Smart notifications saved for user', { userId: user.id, count: criticalNotifications.length });
        } catch (error) {
          logger.error('Failed to generate notifications for user', { userId: user.id, error: error.message });
        }
      }
    } catch (error) {
      logger.error('Error in smart notifications check', { error: error.message });
    }
  }, 60 * 60 * 1000); // Every hour

  logger.info('Smart notifications check scheduled');
}

export function stopSmartNotificationsCheck() {
  if (smartNotificationsInterval) {
    clearInterval(smartNotificationsInterval);
    smartNotificationsInterval = null;
  }
}
