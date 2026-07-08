import prisma from '../../utils/prisma.js';
import logger from '../../utils/logger.js';
import { detectIntent, extractEntities, INTENTS } from './aiIntentDetector.js';

const MAX_CONTEXT_TOKENS = 1500;
const APPROX_CHARS_PER_TOKEN = 4;
const MAX_CONTEXT_CHARS = MAX_CONTEXT_TOKENS * APPROX_CHARS_PER_TOKEN;

function getVehicleDisplayName(vehicle) {
  if (!vehicle) return 'Unknown Vehicle';
  return vehicle.vehicleName ||
         [vehicle.make, vehicle.model].filter(Boolean).join(' ') ||
         'Unknown Vehicle';
}

function getVehiclePlate(vehicle) {
  if (!vehicle) return 'No plate';
  return vehicle.registrationNumber ||
         vehicle.plateNumber ||
         vehicle.vin ||
         'No plate';
}

export class AIContextBuilder {
  constructor(userId, message, userVehicles = []) {
    this.userId = userId;
    this.message = message;
    this.userVehicles = userVehicles;
    this.intent = detectIntent(message);
    this.entities = extractEntities(message, userId, userVehicles);
    
    logger.info('AI_INTENT_DETECTED', { intent: this.intent, entities: this.entities });
  }
  
  async build() {
    let context;
    
    try {
      switch (this.intent) {
        case INTENTS.FLEET_SUMMARY:
          context = await this.buildFleetSummaryContext();
          break;
        case INTENTS.VEHICLE_DETAILS:
        case INTENTS.VEHICLE_SEARCH:
          context = await this.buildVehicleDetailsContext();
          break;
        case INTENTS.LIST_VEHICLES:
          context = await this.buildListVehiclesContext();
          break;
        case INTENTS.VEHICLE_COMPARISON:
          context = await this.buildVehicleComparisonContext();
          break;
        case INTENTS.DTC:
        case INTENTS.DTC_CODES:
          context = await this.buildDTCContext();
          break;
        case INTENTS.MAINTENANCE:
        case INTENTS.MAINTENANCE_DUE:
          context = await this.buildMaintenanceContext();
          break;
        case INTENTS.GPS:
        case INTENTS.GPS_TRACKING:
          context = await this.buildGPSContext();
          break;
        case INTENTS.ALERTS:
        case INTENTS.CRITICAL_ALERTS:
          context = await this.buildAlertsContext();
          break;
        case INTENTS.OFFLINE_VEHICLES:
          context = await this.buildOfflineVehiclesContext();
          break;
        case INTENTS.ONLINE_VEHICLES:
          context = await this.buildOnlineVehiclesContext();
          break;
        case INTENTS.STANDBY_VEHICLES:
          context = await this.buildStandbyVehiclesContext();
          break;
        case INTENTS.BATTERY:
          context = await this.buildBatteryContext();
          break;
        case INTENTS.FUEL:
          context = await this.buildFuelContext();
          break;
        case INTENTS.LIVE_DATA:
        case INTENTS.LIVE_DIAGNOSTICS:
          context = await this.buildLiveDiagnosticsContext();
          break;
        case INTENTS.PREDICTIVE_MAINTENANCE:
          context = await this.buildPredictiveMaintenanceContext();
          break;
        case INTENTS.WORK_ORDER:
          context = await this.buildWorkOrderContext();
          break;
        default:
          context = await this.buildMinimalContext();
      }
    } catch (error) {
      logger.error('AI_CONTEXT_BUILD_FAILED', { intent: this.intent, error: error.message, stack: error.stack });
      context = await this.buildFallbackContext();
    }
    
    const contextString = JSON.stringify(context, null, 2);
    const contextSize = contextString.length;
    
    logger.info('AI_CONTEXT_SIZE', { 
      chars: contextSize, 
      estimatedTokens: Math.ceil(contextSize / APPROX_CHARS_PER_TOKEN),
      maxTokens: MAX_CONTEXT_TOKENS 
    });
    
    if (contextSize > MAX_CONTEXT_CHARS) {
      logger.info('AI_CONTEXT_TRUNCATED', { original: contextSize, max: MAX_CONTEXT_CHARS });
      context = this.truncateContext(context);
    }
    
    return context;
  }
  
  /**
   * Fleet summary context - only counts and top items
   */
  async buildFleetSummaryContext() {
    try {
      const vehicles = await prisma.vehicle.findMany({
        where: { userId: this.userId, deletedAt: null },
        select: {
          id: true,
          vehicleName: true,
          registrationNumber: true,
          make: true,
          model: true,
          year: true,
          status: true,
          telemetryOnline: true,
          lastTelemetryAt: true,
          _count: { select: { alerts: true, dtcCodes: true, maintenanceLogs: true } },
        },
        take: 50,
      });
      
      const onlineCount = vehicles.filter(v => v.telemetryOnline === true).length;
      const offlineCount = vehicles.filter(v => v.telemetryOnline === false || v.status === 'OFFLINE').length;
      const standbyCount = vehicles.filter(v => v.status === 'STANDBY').length;
      
      const totalAlerts = vehicles.reduce((sum, v) => sum + v._count.alerts, 0);
      const totalDTCs = vehicles.reduce((sum, v) => sum + v._count.dtcCodes, 0);
      const totalMaintenance = vehicles.reduce((sum, v) => sum + v._count.maintenanceLogs, 0);
      
      // Top 3 vehicles with most alerts
      const topRiskyVehicles = vehicles
        .sort((a, b) => b._count.alerts - a._count.alerts)
        .slice(0, 3)
        .map(v => ({
          name: v.vehicleName,
          plate: v.registrationNumber,
          alertCount: v._count.alerts,
        }));
      
      // Top 3 vehicles with maintenance due
      const maintenanceDue = await prisma.maintenanceLog.findMany({
        where: {
          vehicle: { userId: this.userId, deletedAt: null },
          completed: false,
        },
        include: {
          vehicle: { select: { vehicleName: true, registrationNumber: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 3,
      });
      
      // Get latest telemetry timestamp
      const latestTelemetry = await prisma.telemetry.findFirst({
        where: {
          vehicle: { userId: this.userId, deletedAt: null },
        },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      });
      
      return {
        intent: this.intent,
        dataSource: 'database',
        fleet: {
          totalVehicles: vehicles.length,
          onlineCount,
          offlineCount,
          standbyCount,
          criticalAlertCount: totalAlerts,
          maintenanceDueCount: totalMaintenance,
          activeDtcCount: totalDTCs,
          topRiskyVehicles,
          maintenanceDue: maintenanceDue.map(m => ({
            vehicle: m.vehicle.vehicleName,
            plate: m.vehicle.registrationNumber,
            dueDate: m.dueDate,
          })),
          latestTelemetry: latestTelemetry?.timestamp || null,
        },
      };
    } catch (error) {
      logger.error('FLEET_SUMMARY_CONTEXT_ERROR', { error: error.message });
      // Return minimal context even on error
      return {
        intent: this.intent,
        dataSource: 'database_fallback',
        fleet: {
          totalVehicles: 0,
          onlineCount: 0,
          offlineCount: 0,
          standbyCount: 0,
          criticalAlertCount: 0,
          maintenanceDueCount: 0,
          activeDtcCount: 0,
          topRiskyVehicles: [],
          maintenanceDue: [],
          latestTelemetry: null,
          error: 'Unable to fetch complete fleet data',
        },
      };
    }
  }
  
  /**
   * Vehicle details context - only selected vehicle
   */
  async buildVehicleDetailsContext() {
    try {
      // Get vehicle from entities or first match
      let vehicle = this.entities.vehicles[0];
      
      if (!vehicle) {
        // Try to find vehicle by name in message using contains search
        const vehicleName = this.extractVehicleName();
        if (vehicleName) {
          vehicle = await prisma.vehicle.findFirst({
            where: { 
              userId: this.userId, 
              deletedAt: null,
              vehicleName: { contains: vehicleName, mode: 'insensitive' }
            },
            select: {
              id: true,
              vehicleName: true,
              registrationNumber: true,
              vin: true,
              make: true,
              model: true,
              year: true,
              odometer: true,
              status: true,
              telemetryOnline: true,
            },
          });
        }
        
        // If still not found, try searching by make, model, registrationNumber, or vin
        if (!vehicle) {
          const searchTerms = this.message.split(' ').filter(w => w.length > 2);
          vehicle = await prisma.vehicle.findFirst({
            where: { 
              userId: this.userId, 
              deletedAt: null,
              OR: [
                { vehicleName: { contains: this.message, mode: 'insensitive' } },
                { make: { contains: this.message, mode: 'insensitive' } },
                { model: { contains: this.message, mode: 'insensitive' } },
                { registrationNumber: { contains: this.message, mode: 'insensitive' } },
                { vin: { contains: this.message, mode: 'insensitive' } },
              ]
            },
            select: {
              id: true,
              vehicleName: true,
              registrationNumber: true,
              vin: true,
              make: true,
              model: true,
              year: true,
              odometer: true,
              status: true,
              telemetryOnline: true,
            },
          });
        }
      }
      
      if (!vehicle) {
        // Return list of user's vehicles instead of "not found"
        const userVehicles = await prisma.vehicle.findMany({
          where: { userId: this.userId, deletedAt: null },
          select: {
            vehicleName: true,
            registrationNumber: true,
            make: true,
            model: true,
          },
          take: 5,
        });
        
        return {
          intent: this.intent,
          dataSource: 'database',
          error: 'Vehicle not found',
          availableVehicles: userVehicles.map(v => ({
            name: v.vehicleName,
            plate: v.registrationNumber,
            make: v.make,
            model: v.model,
          })),
        };
      }
    
    // Latest telemetry only
    const latestTelemetry = await prisma.telemetry.findFirst({
      where: { vehicleId: vehicle.id },
      orderBy: { timestamp: 'desc' },
      select: {
        timestamp: true,
        batteryVoltage: true,
        coolantTemp: true,
        fuelLevel: true,
        engineRPM: true,
        speed: true,
        odometer: true,
      },
    });
    
    // Latest location only
    const latestLocation = await prisma.gPSLocation.findFirst({
      where: { vehicleId: vehicle.id },
      orderBy: { timestamp: 'desc' },
      select: {
        timestamp: true,
        latitude: true,
        longitude: true,
        address: true,
      },
    });
    
    // Latest 5 alerts only
    const alerts = await prisma.alert.findMany({
      where: { vehicleId: vehicle.id, read: false },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        type: true,
        severity: true,
        message: true,
        createdAt: true,
      },
    });
    
    // Latest 5 maintenance only
    const maintenance = await prisma.maintenanceLog.findMany({
      where: { vehicleId: vehicle.id, completed: false },
      orderBy: { dueDate: 'asc' },
      take: 5,
      select: {
        type: true,
        description: true,
        dueDate: true,
        priority: true,
      },
    });
    
    // Active DTCs only
    const dtcCodes = await prisma.dTCCode.findMany({
      where: { vehicleId: vehicle.id, active: true },
      select: {
        code: true,
        description: true,
        severity: true,
        detectedAt: true,
      },
    });
    
    return {
      intent: this.intent,
      dataSource: 'database',
      vehicle: {
        id: vehicle.id,
        name: vehicle.vehicleName,
        plate: vehicle.registrationNumber,
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        odometer: vehicle.odometer,
        status: vehicle.status || 'unknown',
        telemetryOnline: vehicle.telemetryOnline,
        latestTelemetry,
        latestLocation,
        alerts,
        maintenance,
        dtcCodes,
      },
    };
    } catch (error) {
      logger.error('VEHICLE_DETAILS_CONTEXT_ERROR', { error: error.message });
      return {
        intent: this.intent,
        dataSource: 'database_fallback',
        error: 'Unable to fetch vehicle details',
      };
    }
  }
  
  /**
   * Vehicle comparison context - only 2 vehicles
   */
  async buildVehicleComparisonContext() {
    try {
      const vehicles = this.entities.vehicles.slice(0, 2);
      
      if (vehicles.length < 2) {
        // Try to extract 2 vehicles from message
        const vehicleNames = this.extractMultipleVehicleNames();
        if (vehicleNames.length >= 2) {
          const foundVehicles = await Promise.all(
            vehicleNames.slice(0, 2).map(name =>
              prisma.vehicle.findFirst({
                where: { 
                  userId: this.userId, 
                  deletedAt: null,
                  vehicleName: { contains: name, mode: 'insensitive' }
                },
                select: {
                  id: true,
                  vehicleName: true,
                  registrationNumber: true,
                  make: true,
                  model: true,
                  year: true,
                  status: true,
                  telemetryOnline: true,
                },
              })
            )
          );
          vehicles.push(...foundVehicles.filter(v => v));
        }
      }
      
      if (vehicles.length < 2) {
        return { intent: this.intent, error: 'Need at least 2 vehicles for comparison', dataSource: 'none' };
      }
    
    const vehicleData = await Promise.all(
      vehicles.map(async (v) => {
        const telemetry = await prisma.telemetry.findFirst({
          where: { vehicleId: v.id },
          orderBy: { timestamp: 'desc' },
          select: {
            batteryVoltage: true,
            coolantTemp: true,
            fuelLevel: true,
          },
        });
        
        const alertCount = await prisma.alert.count({
          where: { vehicleId: v.id, read: false },
        });
        
        return {
          name: v.vehicleName,
          plate: v.registrationNumber,
          make: v.make,
          model: v.model,
          year: v.year,
          status: v.status || 'unknown',
          batteryVoltage: telemetry?.batteryVoltage,
          coolantTemp: telemetry?.coolantTemp,
          fuelLevel: telemetry?.fuelLevel,
          alertCount,
        };
      })
    );
    
    return {
      intent: this.intent,
      dataSource: 'database',
      vehicles: vehicleData,
    };
    } catch (error) {
      logger.error('VEHICLE_COMPARISON_CONTEXT_ERROR', { error: error.message });
      return {
        intent: this.intent,
        dataSource: 'database_fallback',
        error: 'Unable to fetch vehicle comparison data',
      };
    }
  }
  
  /**
   * DTC context - only DTC code and vehicle
   */
  async buildDTCContext() {
    try {
      const dtcCode = this.entities.dtcCode;
      
      let vehicle = this.entities.vehicles[0];
      if (!vehicle && this.entities.vin) {
        vehicle = await prisma.vehicle.findFirst({
          where: { 
            userId: this.userId, 
            deletedAt: null,
            vin: this.entities.vin 
          },
          select: { vehicleName: true, registrationNumber: true, make: true, model: true },
        });
      }
      
      // Get DTC info from database if available
      const dtcInfo = dtcCode
        ? await prisma.dTCCode.findFirst({
            where: { code: dtcCode },
            select: { code: true, description: true, severity: true },
          })
        : null;
      
      return {
        intent: this.intent,
        dataSource: 'database',
        dtc: {
          code: dtcCode,
          description: dtcInfo?.description || 'Unknown code',
          severity: dtcInfo?.severity || 'unknown',
          vehicle: vehicle ? {
            name: vehicle.vehicleName,
            plate: vehicle.registrationNumber,
            make: vehicle.make,
            model: vehicle.model,
          } : null,
        },
      };
    } catch (error) {
      logger.error('DTC_CONTEXT_ERROR', { error: error.message });
      return {
        intent: this.intent,
        dataSource: 'database_fallback',
        error: 'Unable to fetch DTC data',
      };
    }
  }
  
  /**
   * Live diagnostics context - current telemetry data
   */
  async buildLiveDiagnosticsContext() {
    try {
      let vehicle = this.entities.vehicles[0];

      if (!vehicle) {
        const vehicleName = this.extractVehicleName();
        if (vehicleName) {
          vehicle = await prisma.vehicle.findFirst({
            where: {
              userId: this.userId,
              deletedAt: null,
              vehicleName: { contains: vehicleName, mode: 'insensitive' }
            },
            select: { id: true, vehicleName: true, registrationNumber: true },
          });
        }
      }

      if (!vehicle) {
        const latestTelemetry = await prisma.telemetry.findFirst({
          where: { vehicle: { userId: this.userId, deletedAt: null } },
          orderBy: { timestamp: 'desc' },
          select: {
            timestamp: true,
            batteryVoltage: true,
            coolantTemp: true,
            fuelLevel: true,
            engineRPM: true,
            speed: true,
            odometer: true,
            vehicle: {
              select: { vehicleName: true, registrationNumber: true, make: true, model: true },
            },
          },
        });

        return {
          intent: this.intent,
          dataSource: 'database',
          diagnostics: latestTelemetry ? {
            vehicle: getVehicleDisplayName(latestTelemetry.vehicle),
            plate: getVehiclePlate(latestTelemetry.vehicle),
            timestamp: latestTelemetry.timestamp,
            batteryVoltage: latestTelemetry.batteryVoltage,
            coolantTemp: latestTelemetry.coolantTemp,
            fuelLevel: latestTelemetry.fuelLevel,
            engineRPM: latestTelemetry.engineRPM,
            speed: latestTelemetry.speed,
            odometer: latestTelemetry.odometer,
          } : null,
          note: !latestTelemetry ? 'No telemetry data available' : undefined,
        };
      }

      const latestTelemetry = await prisma.telemetry.findFirst({
        where: { vehicleId: vehicle.id },
        orderBy: { timestamp: 'desc' },
        select: {
          timestamp: true,
          batteryVoltage: true,
          coolantTemp: true,
          fuelLevel: true,
          engineRPM: true,
          speed: true,
          odometer: true,
        },
      });

      return {
        intent: this.intent,
        dataSource: 'database',
        vehicle: {
          id: vehicle.id,
          name: vehicle.vehicleName,
          plate: vehicle.registrationNumber,
        },
        diagnostics: latestTelemetry || { note: 'No telemetry data available' },
      };
    } catch (error) {
      logger.error('LIVE_DIAGNOSTICS_CONTEXT_ERROR', { error: error.message });
      return {
        intent: this.intent,
        dataSource: 'database_fallback',
        error: 'Unable to fetch diagnostic data',
      };
    }
  }

  /**
   * Maintenance context - only vehicles needing maintenance
   */
  async buildMaintenanceContext() {
    try {
      const maintenanceDue = await prisma.maintenanceLog.findMany({
        where: {
          vehicle: { userId: this.userId, deletedAt: null },
          completed: false,
        },
        include: {
          vehicle: {
            select: {
              vehicleName: true,
              registrationNumber: true,
              make: true,
              model: true,
            },
          },
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
      });
      
      return {
        intent: this.intent,
        dataSource: 'database',
        maintenance: maintenanceDue.map(m => ({
          vehicle: m.vehicle.vehicleName,
          plate: m.vehicle.registrationNumber,
          type: m.type,
          description: m.description,
          dueDate: m.dueDate,
          priority: m.priority,
        })),
      };
    } catch (error) {
      logger.error('MAINTENANCE_CONTEXT_ERROR', { error: error.message });
      return {
        intent: this.intent,
        dataSource: 'database_fallback',
        error: 'Unable to fetch maintenance data',
      };
    }
  }
  
  /**
   * GPS context - only location data
   */
  async buildGPSContext() {
    try {
      let vehicle = this.entities.vehicles[0];
      
      if (!vehicle) {
        const vehicleName = this.extractVehicleName();
        if (vehicleName) {
          vehicle = await prisma.vehicle.findFirst({
            where: { 
              userId: this.userId, 
              deletedAt: null,
              vehicleName: { contains: vehicleName, mode: 'insensitive' }
            },
            select: { id: true, vehicleName: true, registrationNumber: true },
          });
        }
      }
      
      if (!vehicle) {
        return { intent: this.intent, error: 'Vehicle not found', dataSource: 'none' };
      }
      
      const latestLocation = await prisma.gPSLocation.findFirst({
        where: { vehicleId: vehicle.id },
        orderBy: { timestamp: 'desc' },
        select: {
          timestamp: true,
          latitude: true,
          longitude: true,
          address: true,
        },
      });
      
      return {
        intent: this.intent,
        dataSource: 'database',
        vehicle: {
          id: vehicle.id,
          name: vehicle.vehicleName,
          plate: vehicle.registrationNumber,
        },
        location: latestLocation,
      };
    } catch (error) {
      logger.error('GPS_CONTEXT_ERROR', { error: error.message });
      return {
        intent: this.intent,
        dataSource: 'database_fallback',
        error: 'Unable to fetch GPS data',
      };
    }
  }
  
  /**
   * Alerts context - only alerts
   */
  async buildAlertsContext() {
    try {
      const severityFilter = this.entities.alertType;
      
      const alerts = await prisma.alert.findMany({
        where: {
          vehicle: { userId: this.userId, deletedAt: null },
          read: false,
          ...(severityFilter && { severity: severityFilter }),
        },
        include: {
          vehicle: {
            select: {
              vehicleName: true,
              registrationNumber: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      
      return {
        intent: this.intent,
        dataSource: 'database',
        alerts: alerts.map(a => ({
          vehicle: a.vehicle.vehicleName,
          plate: a.vehicle.registrationNumber,
          type: a.type,
          severity: a.severity,
          message: a.message,
          createdAt: a.createdAt,
        })),
      };
    } catch (error) {
      logger.error('ALERTS_CONTEXT_ERROR', { error: error.message });
      return {
        intent: this.intent,
        dataSource: 'database_fallback',
        error: 'Unable to fetch alerts data',
      };
    }
  }
  
  /**
   * Offline vehicles context
   */
  async buildOfflineVehiclesContext() {
    try {
      const offlineVehicles = await prisma.vehicle.findMany({
        where: {
          userId: this.userId,
          deletedAt: null,
          OR: [
            { telemetryOnline: false },
            { lastTelemetryAt: null },
            { lastTelemetryAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } },
            { status: 'OFFLINE' }
          ]
        },
        select: {
          vehicleName: true,
          registrationNumber: true,
          make: true,
          model: true,
          lastTelemetryAt: true,
        },
        take: 10,
      });
      
      return {
        intent: this.intent,
        dataSource: 'database',
        vehicles: offlineVehicles.map(v => ({
          name: v.vehicleName,
          plate: v.registrationNumber,
          make: v.make,
          model: v.model,
          lastSeen: v.lastTelemetryAt,
        })),
      };
    } catch (error) {
      logger.error('OFFLINE_VEHICLES_CONTEXT_ERROR', { error: error.message });
      return {
        intent: this.intent,
        dataSource: 'database_fallback',
        error: 'Unable to fetch offline vehicles data',
      };
    }
  }
  
  /**
   * List all vehicles context
   */
  async buildListVehiclesContext() {
    try {
      const vehicles = await prisma.vehicle.findMany({
        where: { userId: this.userId, deletedAt: null },
        select: {
          id: true,
          vehicleName: true,
          registrationNumber: true,
          make: true,
          model: true,
          year: true,
          status: true,
          telemetryOnline: true,
          lastTelemetryAt: true,
        },
        take: 50,
      });

      return {
        intent: this.intent,
        dataSource: 'database',
        vehicles: vehicles.map(v => ({
          name: getVehicleDisplayName(v),
          plate: getVehiclePlate(v),
          make: v.make,
          model: v.model,
          year: v.year,
          status: v.status || 'unknown',
          telemetryOnline: v.telemetryOnline,
          lastSeen: v.lastTelemetryAt,
        })),
      };
    } catch (error) {
      logger.error('LIST_VEHICLES_CONTEXT_ERROR', { error: error.message });
      return {
        intent: this.intent,
        dataSource: 'database_fallback',
        error: 'Unable to fetch vehicle list',
      };
    }
  }

  /**
   * Online vehicles context
   */
  async buildOnlineVehiclesContext() {
    try {
      const onlineVehicles = await prisma.vehicle.findMany({
        where: {
          userId: this.userId,
          deletedAt: null,
          telemetryOnline: true,
          status: { notIn: ['OFFLINE', 'STANDBY'] },
        },
        select: {
          vehicleName: true,
          registrationNumber: true,
          make: true,
          model: true,
          lastTelemetryAt: true,
        },
        take: 20,
      });

      return {
        intent: this.intent,
        dataSource: 'database',
        vehicles: onlineVehicles.map(v => ({
          name: getVehicleDisplayName(v),
          plate: getVehiclePlate(v),
          make: v.make,
          model: v.model,
          lastSeen: v.lastTelemetryAt,
        })),
      };
    } catch (error) {
      logger.error('ONLINE_VEHICLES_CONTEXT_ERROR', { error: error.message });
      return {
        intent: this.intent,
        dataSource: 'database_fallback',
        error: 'Unable to fetch online vehicles data',
      };
    }
  }

  /**
   * Standby vehicles context
   */
  async buildStandbyVehiclesContext() {
    try {
      const standbyVehicles = await prisma.vehicle.findMany({
        where: {
          userId: this.userId,
          deletedAt: null,
          status: 'STANDBY'
        },
        select: {
          vehicleName: true,
          registrationNumber: true,
          make: true,
          model: true,
          ignitionStatus: true,
        },
        take: 10,
      });
      
      return {
        intent: this.intent,
        dataSource: 'database',
        vehicles: standbyVehicles.map(v => ({
          name: v.vehicleName,
          plate: v.registrationNumber,
          make: v.make,
          model: v.model,
          ignition: v.ignitionStatus || 'off',
        })),
      };
    } catch (error) {
      logger.error('STANDBY_VEHICLES_CONTEXT_ERROR', { error: error.message });
      return {
        intent: this.intent,
        dataSource: 'database_fallback',
        error: 'Unable to fetch standby vehicles data',
      };
    }
  }
  
  /**
   * Battery context
   */
  async buildBatteryContext() {
    try {
      let vehicle = this.entities.vehicles[0];
      
      if (!vehicle) {
        const vehicleName = this.extractVehicleName();
        if (vehicleName) {
          vehicle = await prisma.vehicle.findFirst({
            where: { 
              userId: this.userId, 
              deletedAt: null,
              vehicleName: { contains: vehicleName, mode: 'insensitive' }
            },
            select: { id: true, vehicleName: true, registrationNumber: true },
          });
        }
      }
      
      if (!vehicle) {
        // Get all vehicles with battery data
        const vehicles = await prisma.vehicle.findMany({
          where: { userId: this.userId, deletedAt: null },
          select: { id: true, vehicleName: true, registrationNumber: true },
          take: 10,
        });
        
        const batteryData = await Promise.all(
          vehicles.map(async (v) => {
            const telemetry = await prisma.telemetry.findFirst({
              where: { vehicleId: v.id },
              orderBy: { timestamp: 'desc' },
              select: { batteryVoltage: true, timestamp: true },
            });
            
            return {
              name: v.vehicleName,
              plate: v.registrationNumber,
              voltage: telemetry?.batteryVoltage,
              timestamp: telemetry?.timestamp,
            };
          })
        );
        
        return {
          intent: this.intent,
          dataSource: 'database',
          vehicles: batteryData,
        };
      }
      
      const telemetry = await prisma.telemetry.findFirst({
        where: { vehicleId: vehicle.id },
        orderBy: { timestamp: 'desc' },
        select: { batteryVoltage: true, timestamp: true },
      });
      
      return {
        intent: this.intent,
        dataSource: 'database',
        vehicle: {
          id: vehicle.id,
          name: vehicle.vehicleName,
          plate: vehicle.registrationNumber,
        },
        battery: {
          voltage: telemetry?.batteryVoltage,
          timestamp: telemetry?.timestamp,
        },
      };
    } catch (error) {
      logger.error('BATTERY_CONTEXT_ERROR', { error: error.message });
      return {
        intent: this.intent,
        dataSource: 'database_fallback',
        error: 'Unable to fetch battery data',
      };
    }
  }
  
  /**
   * Fuel context
   */
  async buildFuelContext() {
    try {
      let vehicle = this.entities.vehicles[0];
      
      if (!vehicle) {
        const vehicleName = this.extractVehicleName();
        if (vehicleName) {
          vehicle = await prisma.vehicle.findFirst({
            where: { 
              userId: this.userId, 
              deletedAt: null,
              vehicleName: { contains: vehicleName, mode: 'insensitive' }
            },
            select: { id: true, vehicleName: true, registrationNumber: true },
          });
        }
      }
      
      if (!vehicle) {
        // Get all vehicles with fuel data
        const vehicles = await prisma.vehicle.findMany({
          where: { userId: this.userId, deletedAt: null },
          select: { id: true, vehicleName: true, registrationNumber: true },
          take: 10,
        });
        
        const fuelData = await Promise.all(
          vehicles.map(async (v) => {
            const telemetry = await prisma.telemetry.findFirst({
              where: { vehicleId: v.id },
              orderBy: { timestamp: 'desc' },
              select: { fuelLevel: true, timestamp: true },
            });
            
            return {
              name: v.vehicleName,
              plate: v.registrationNumber,
              fuelLevel: telemetry?.fuelLevel,
              timestamp: telemetry?.timestamp,
            };
          })
        );
        
        return {
          intent: this.intent,
          dataSource: 'database',
          vehicles: fuelData,
        };
      }
      
      const telemetry = await prisma.telemetry.findFirst({
        where: { vehicleId: vehicle.id },
        orderBy: { timestamp: 'desc' },
        select: { fuelLevel: true, timestamp: true },
      });
      
      return {
        intent: this.intent,
        dataSource: 'database',
        vehicle: {
          id: vehicle.id,
          name: vehicle.vehicleName,
          plate: vehicle.registrationNumber,
        },
        fuel: {
          level: telemetry?.fuelLevel,
          timestamp: telemetry?.timestamp,
        },
      };
    } catch (error) {
      logger.error('FUEL_CONTEXT_ERROR', { error: error.message });
      return {
        intent: this.intent,
        dataSource: 'database_fallback',
        error: 'Unable to fetch fuel data',
      };
    }
  }
  
  /**
   * Predictive maintenance context
   */
  async buildPredictiveMaintenanceContext() {
    try {
      const vehicles = await prisma.vehicle.findMany({
        where: { userId: this.userId, deletedAt: null },
        select: {
          id: true,
          vehicleName: true,
          registrationNumber: true,
          make: true,
          model: true,
          status: true,
          lastTelemetryAt: true,
        },
      });
      
      const vehicleScores = await Promise.all(
        vehicles.map(async (v) => {
          const criticalAlerts = await prisma.alert.count({
            where: { vehicleId: v.id, severity: 'CRITICAL', read: false },
          });
          
          const criticalDTCs = await prisma.dTCCode.count({
            where: { vehicleId: v.id, active: true, severity: 'CRITICAL' },
          });
          
          const overdueMaintenance = await prisma.maintenanceLog.count({
            where: {
              vehicleId: v.id,
              completed: false,
              dueDate: { lt: new Date() },
            },
          });
          
          const isOffline = v.status === 'OFFLINE';
          const offlineDays = v.lastTelemetryAt
            ? Math.floor((new Date() - new Date(v.lastTelemetryAt)) / (1000 * 60 * 60 * 24))
            : 0;
          
          const score = criticalAlerts * 10 + criticalDTCs * 8 + overdueMaintenance * 5 + (isOffline ? offlineDays * 2 : 0);
          
          return {
            name: v.vehicleName,
            plate: v.registrationNumber,
            make: v.make,
            model: v.model,
          score,
          criticalAlerts,
          criticalDTCs,
          overdueMaintenance,
          isOffline,
          offlineDays,
        };
      })
    );
    
    const topRisky = vehicleScores.sort((a, b) => b.score - a.score).slice(0, 5);
    
    return {
      intent: this.intent,
      dataSource: 'database',
      vehicles: topRisky,
    };
    } catch (error) {
      logger.error('PREDICTIVE_MAINTENANCE_CONTEXT_ERROR', { error: error.message });
      return {
        intent: this.intent,
        dataSource: 'database_fallback',
        error: 'Unable to fetch predictive maintenance data',
      };
    }
  }
  
  /**
   * Work order context
   */
  async buildWorkOrderContext() {
    try {
      let vehicle = this.entities.vehicles[0];

      if (!vehicle) {
        const vehicleName = this.extractVehicleName();
        if (vehicleName) {
          vehicle = await prisma.vehicle.findFirst({
            where: {
              userId: this.userId,
              deletedAt: null,
              vehicleName: { contains: vehicleName, mode: 'insensitive' }
            },
            select: { id: true, vehicleName: true, registrationNumber: true },
          });
        }
      }

      const where = vehicle
        ? { vehicleId: vehicle.id, completed: false }
        : { vehicle: { userId: this.userId, deletedAt: null }, completed: false };

      const workOrders = await prisma.maintenanceLog.findMany({
        where,
        include: {
          vehicle: {
            select: { vehicleName: true, registrationNumber: true },
          },
        },
        orderBy: { dueDate: 'asc' },
        take: 15,
      });

      return {
        intent: this.intent,
        dataSource: 'database',
        workOrders: workOrders.map(w => ({
          id: w.id,
          vehicle: getVehicleDisplayName(w.vehicle),
          plate: getVehiclePlate(w.vehicle),
          type: w.type,
          description: w.description,
          dueDate: w.dueDate,
          priority: w.priority || 'normal',
          notes: w.notes,
        })),
      };
    } catch (error) {
      logger.error('WORK_ORDER_CONTEXT_ERROR', { error: error.message });
      return {
        intent: this.intent,
        dataSource: 'database_fallback',
        error: 'Unable to fetch work order data',
      };
    }
  }

  /**
   * Minimal context for general queries
   */
  async buildMinimalContext() {
    try {
      const vehicleCount = await prisma.vehicle.count({
        where: { userId: this.userId, deletedAt: null },
      });
      
      return {
        intent: this.intent,
        dataSource: 'database',
        fleet: {
          totalVehicles: vehicleCount,
        },
      };
    } catch (error) {
      logger.error('MINIMAL_CONTEXT_ERROR', { error: error.message });
      return {
        intent: this.intent,
        dataSource: 'database_fallback',
        fleet: {
          totalVehicles: 0,
        },
      };
    }
  }
  
  /**
   * Fallback context when context building fails
   * Provides basic fleet data without complex queries
   */
  async buildFallbackContext() {
    try {
      const vehicles = await prisma.vehicle.findMany({
        where: { userId: this.userId, deletedAt: null },
        select: {
          vehicleName: true,
          registrationNumber: true,
          status: true,
          telemetryOnline: true,
        },
        take: 50,
      });
      
      const onlineCount = vehicles.filter(v => v.telemetryOnline === true).length;
      const offlineCount = vehicles.filter(v => v.telemetryOnline === false || v.status === 'OFFLINE').length;
      
      return {
        intent: this.intent,
        dataSource: 'database_fallback',
        fleet: {
          totalVehicles: vehicles.length,
          onlineCount,
          offlineCount,
          vehicles: vehicles.slice(0, 5).map(v => ({
            name: v.vehicleName,
            plate: v.registrationNumber,
            status: v.status,
          })),
        },
      };
    } catch (fallbackError) {
      logger.error('AI_CONTEXT_FALLBACK_FAILED', { error: fallbackError.message });
      
      // Ultimate fallback - return minimal context
      return {
        intent: this.intent,
        dataSource: 'minimal_fallback',
        fleet: {
          totalVehicles: 0,
          note: 'Unable to fetch fleet data',
        },
      };
    }
  }
  
  /**
   * Truncate context to fit within token limit
   */
  truncateContext(context) {
    if (context.fleet) {
      context.fleet.topRiskyVehicles = context.fleet.topRiskyVehicles?.slice(0, 1) || [];
      context.fleet.maintenanceDue = context.fleet.maintenanceDue?.slice(0, 1) || [];
    }
    
    if (context.vehicle) {
      context.vehicle.alerts = context.vehicle.alerts?.slice(0, 2) || [];
      context.vehicle.maintenance = context.vehicle.maintenance?.slice(0, 2) || [];
      context.vehicle.dtcCodes = context.vehicle.dtcCodes?.slice(0, 2) || [];
    }
    
    if (context.maintenance) {
      context.maintenance = context.maintenance?.slice(0, 5) || [];
    }
    
    if (context.alerts) {
      context.alerts = context.alerts?.slice(0, 5) || [];
    }
    
    if (context.vehicles) {
      context.vehicles = context.vehicles?.slice(0, 10) || [];
    }
    
    if (context.workOrders) {
      context.workOrders = context.workOrders?.slice(0, 5) || [];
    }
    
    return context;
  }
  
  /**
   * Extract vehicle name from message
   */
  extractVehicleName() {
    const words = this.message.split(' ');
    // Find words that might be vehicle names
    const vehicleNames = this.userVehicles.map(v => v.vehicleName?.toLowerCase() || '');
    for (const word of words) {
      for (const name of vehicleNames) {
        if (word.toLowerCase().includes(name)) {
          return name;
        }
      }
    }
    return null;
  }
  
  /**
   * Extract multiple vehicle names from message
   */
  extractMultipleVehicleNames() {
    const words = this.message.split(' ');
    const vehicleNames = this.userVehicles.map(v => v.vehicleName?.toLowerCase() || '');
    const foundNames = [];
    
    for (const word of words) {
      for (const name of vehicleNames) {
        if (word.toLowerCase().includes(name) && !foundNames.includes(name)) {
          foundNames.push(name);
        }
      }
    }
    
    return foundNames;
  }
}
