import prisma from '../../utils/prisma.js';
import { detectIntent, extractEntities, INTENTS } from './aiIntentDetector.js';

const MAX_CONTEXT_TOKENS = 1500;
const APPROX_CHARS_PER_TOKEN = 4;
const MAX_CONTEXT_CHARS = MAX_CONTEXT_TOKENS * APPROX_CHARS_PER_TOKEN;

/**
 * AI Context Builder
 * Builds context based on detected intent and extracted entities
 * Strictly limits context to 1500 tokens maximum
 */
export class AIContextBuilder {
  constructor(userId, message, userVehicles = []) {
    this.userId = userId;
    this.message = message;
    this.userVehicles = userVehicles;
    this.intent = detectIntent(message);
    this.entities = extractEntities(message, userId, userVehicles);
    
    console.log('AI_INTENT_DETECTED', { intent: this.intent, entities: this.entities });
  }
  
  /**
   * Build context based on intent
   */
  async build() {
    let context;
    
    switch (this.intent) {
      case INTENTS.FLEET_SUMMARY:
        context = await this.buildFleetSummaryContext();
        break;
      case INTENTS.VEHICLE_DETAILS:
        context = await this.buildVehicleDetailsContext();
        break;
      case INTENTS.VEHICLE_COMPARISON:
        context = await this.buildVehicleComparisonContext();
        break;
      case INTENTS.DTC:
        context = await this.buildDTCContext();
        break;
      case INTENTS.MAINTENANCE:
        context = await this.buildMaintenanceContext();
        break;
      case INTENTS.GPS:
        context = await this.buildGPSContext();
        break;
      case INTENTS.ALERTS:
        context = await this.buildAlertsContext();
        break;
      case INTENTS.OFFLINE_VEHICLES:
        context = await this.buildOfflineVehiclesContext();
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
      case INTENTS.PREDICTIVE_MAINTENANCE:
        context = await this.buildPredictiveMaintenanceContext();
        break;
      default:
        context = await this.buildMinimalContext();
    }
    
    // Truncate if exceeds limit
    const contextString = JSON.stringify(context, null, 2);
    const contextSize = contextString.length;
    
    console.log('AI_CONTEXT_SIZE', { 
      chars: contextSize, 
      estimatedTokens: Math.ceil(contextSize / APPROX_CHARS_PER_TOKEN),
      maxTokens: MAX_CONTEXT_TOKENS 
    });
    
    if (contextSize > MAX_CONTEXT_CHARS) {
      console.log('AI_CONTEXT_TRUNCATED', { original: contextSize, max: MAX_CONTEXT_CHARS });
      context = this.truncateContext(context);
    }
    
    return context;
  }
  
  /**
   * Fleet summary context - only counts and top items
   */
  async buildFleetSummaryContext() {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId: this.userId, deletedAt: null },
      select: {
        id: true,
        name: true,
        plateNumber: true,
        make: true,
        model: true,
        year: true,
        liveState: { select: { status: true } },
        _count: { select: { alerts: true, dtcCodes: true, maintenanceLogs: true } },
      },
      take: 50,
    });
    
    const onlineCount = vehicles.filter(v => v.liveState?.status === 'online').length;
    const offlineCount = vehicles.filter(v => v.liveState?.status === 'offline').length;
    const standbyCount = vehicles.filter(v => v.liveState?.status === 'standby').length;
    
    const totalAlerts = vehicles.reduce((sum, v) => sum + v._count.alerts, 0);
    const totalDTCs = vehicles.reduce((sum, v) => sum + v._count.dtcCodes, 0);
    const totalMaintenance = vehicles.reduce((sum, v) => sum + v._count.maintenanceLogs, 0);
    
    // Top 3 vehicles with most alerts
    const topRiskyVehicles = vehicles
      .sort((a, b) => b._count.alerts - a._count.alerts)
      .slice(0, 3)
      .map(v => ({
        name: v.name,
        plate: v.plateNumber,
        alertCount: v._count.alerts,
      }));
    
    // Top 3 vehicles with maintenance due
    const maintenanceDue = await prisma.maintenanceLog.findMany({
      where: {
        vehicle: { userId: this.userId, deletedAt: null },
        completed: false,
      },
      include: {
        vehicle: { select: { name: true, plateNumber: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 3,
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
          vehicle: m.vehicle.name,
          plate: m.vehicle.plateNumber,
          dueDate: m.dueDate,
        })),
      },
    };
  }
  
  /**
   * Vehicle details context - only selected vehicle
   */
  async buildVehicleDetailsContext() {
    // Get vehicle from entities or first match
    let vehicle = this.entities.vehicles[0];
    
    if (!vehicle) {
      // Try to find vehicle by name in message
      const vehicleName = this.extractVehicleName();
      if (vehicleName) {
        vehicle = await prisma.vehicle.findFirst({
          where: { 
            userId: this.userId, 
            deletedAt: null,
            name: { contains: vehicleName, mode: 'insensitive' }
          },
          select: {
            id: true,
            name: true,
            plateNumber: true,
            vin: true,
            make: true,
            model: true,
            year: true,
            odometer: true,
            liveState: { select: { status: true } },
          },
        });
      }
    }
    
    if (!vehicle) {
      return { intent: this.intent, error: 'Vehicle not found', dataSource: 'none' };
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
        name: vehicle.name,
        plate: vehicle.plateNumber,
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        odometer: vehicle.odometer,
        status: vehicle.liveState?.status || 'unknown',
        latestTelemetry,
        latestLocation,
        alerts,
        maintenance,
        dtcCodes,
      },
    };
  }
  
  /**
   * Vehicle comparison context - only 2 vehicles
   */
  async buildVehicleComparisonContext() {
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
                name: { contains: name, mode: 'insensitive' }
              },
              select: {
                id: true,
                name: true,
                plateNumber: true,
                make: true,
                model: true,
                year: true,
                liveState: { select: { status: true } },
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
          name: v.name,
          plate: v.plateNumber,
          make: v.make,
          model: v.model,
          year: v.year,
          status: v.liveState?.status || 'unknown',
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
  }
  
  /**
   * DTC context - only DTC code and vehicle
   */
  async buildDTCContext() {
    const dtcCode = this.entities.dtcCode;
    
    let vehicle = this.entities.vehicles[0];
    if (!vehicle && this.entities.vin) {
      vehicle = await prisma.vehicle.findFirst({
        where: { 
          userId: this.userId, 
          deletedAt: null,
          vin: this.entities.vin 
        },
        select: { name: true, plateNumber: true, make: true, model: true },
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
          name: vehicle.name,
          plate: vehicle.plateNumber,
          make: vehicle.make,
          model: vehicle.model,
        } : null,
      },
    };
  }
  
  /**
   * Maintenance context - only vehicles needing maintenance
   */
  async buildMaintenanceContext() {
    const maintenanceDue = await prisma.maintenanceLog.findMany({
      where: {
        vehicle: { userId: this.userId, deletedAt: null },
        completed: false,
      },
      include: {
        vehicle: {
          select: {
            name: true,
            plateNumber: true,
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
        vehicle: m.vehicle.name,
        plate: m.vehicle.plateNumber,
        type: m.type,
        description: m.description,
        dueDate: m.dueDate,
        priority: m.priority,
      })),
    };
  }
  
  /**
   * GPS context - only location data
   */
  async buildGPSContext() {
    let vehicle = this.entities.vehicles[0];
    
    if (!vehicle) {
      const vehicleName = this.extractVehicleName();
      if (vehicleName) {
        vehicle = await prisma.vehicle.findFirst({
          where: { 
            userId: this.userId, 
            deletedAt: null,
            name: { contains: vehicleName, mode: 'insensitive' }
          },
          select: { id: true, name: true, plateNumber: true },
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
        name: vehicle.name,
        plate: vehicle.plateNumber,
      },
      location: latestLocation,
    };
  }
  
  /**
   * Alerts context - only alerts
   */
  async buildAlertsContext() {
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
            name: true,
            plateNumber: true,
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
        vehicle: a.vehicle.name,
        plate: a.vehicle.plateNumber,
        type: a.type,
        severity: a.severity,
        message: a.message,
        createdAt: a.createdAt,
      })),
    };
  }
  
  /**
   * Offline vehicles context
   */
  async buildOfflineVehiclesContext() {
    const offlineVehicles = await prisma.vehicle.findMany({
      where: {
        userId: this.userId,
        deletedAt: null,
        liveState: { status: 'offline' },
      },
      select: {
        name: true,
        plateNumber: true,
        make: true,
        model: true,
        lastObdAt: true,
      },
      take: 10,
    });
    
    return {
      intent: this.intent,
      dataSource: 'database',
      vehicles: offlineVehicles.map(v => ({
        name: v.name,
        plate: v.plateNumber,
        make: v.make,
        model: v.model,
        lastSeen: v.lastObdAt,
      })),
    };
  }
  
  /**
   * Standby vehicles context
   */
  async buildStandbyVehiclesContext() {
    const standbyVehicles = await prisma.vehicle.findMany({
      where: {
        userId: this.userId,
        deletedAt: null,
        liveState: { status: 'standby' },
      },
      select: {
        name: true,
        plateNumber: true,
        make: true,
        model: true,
        liveState: { select: { ignitionStatus: true } },
      },
      take: 10,
    });
    
    return {
      intent: this.intent,
      dataSource: 'database',
      vehicles: standbyVehicles.map(v => ({
        name: v.name,
        plate: v.plateNumber,
        make: v.make,
        model: v.model,
        ignition: v.liveState?.ignitionStatus || 'off',
      })),
    };
  }
  
  /**
   * Battery context
   */
  async buildBatteryContext() {
    let vehicle = this.entities.vehicles[0];
    
    if (!vehicle) {
      const vehicleName = this.extractVehicleName();
      if (vehicleName) {
        vehicle = await prisma.vehicle.findFirst({
          where: { 
            userId: this.userId, 
            deletedAt: null,
            name: { contains: vehicleName, mode: 'insensitive' }
          },
          select: { id: true, name: true, plateNumber: true },
        });
      }
    }
    
    if (!vehicle) {
      // Get all vehicles with battery data
      const vehicles = await prisma.vehicle.findMany({
        where: { userId: this.userId, deletedAt: null },
        select: { id: true, name: true, plateNumber: true },
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
            name: v.name,
            plate: v.plateNumber,
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
        name: vehicle.name,
        plate: vehicle.plateNumber,
      },
      battery: {
        voltage: telemetry?.batteryVoltage,
        timestamp: telemetry?.timestamp,
      },
    };
  }
  
  /**
   * Fuel context
   */
  async buildFuelContext() {
    let vehicle = this.entities.vehicles[0];
    
    if (!vehicle) {
      const vehicleName = this.extractVehicleName();
      if (vehicleName) {
        vehicle = await prisma.vehicle.findFirst({
          where: { 
            userId: this.userId, 
            deletedAt: null,
            name: { contains: vehicleName, mode: 'insensitive' }
          },
          select: { id: true, name: true, plateNumber: true },
        });
      }
    }
    
    if (!vehicle) {
      // Get all vehicles with fuel data
      const vehicles = await prisma.vehicle.findMany({
        where: { userId: this.userId, deletedAt: null },
        select: { id: true, name: true, plateNumber: true },
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
            name: v.name,
            plate: v.plateNumber,
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
        name: vehicle.name,
        plate: vehicle.plateNumber,
      },
      fuel: {
        level: telemetry?.fuelLevel,
        timestamp: telemetry?.timestamp,
      },
    };
  }
  
  /**
   * Predictive maintenance context
   */
  async buildPredictiveMaintenanceContext() {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId: this.userId, deletedAt: null },
      select: {
        id: true,
        name: true,
        plateNumber: true,
        make: true,
        model: true,
        liveState: { select: { status: true } },
        lastObdAt: true,
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
        
        const isOffline = v.liveState?.status === 'offline';
        const offlineDays = v.lastObdAt
          ? Math.floor((new Date() - new Date(v.lastObdAt)) / (1000 * 60 * 60 * 24))
          : 0;
        
        const score = criticalAlerts * 10 + criticalDTCs * 8 + overdueMaintenance * 5 + (isOffline ? offlineDays * 2 : 0);
        
        return {
          name: v.name,
          plate: v.plateNumber,
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
  }
  
  /**
   * Minimal context for general queries
   */
  async buildMinimalContext() {
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
  }
  
  /**
   * Truncate context to fit within token limit
   */
  truncateContext(context) {
    // Remove detailed arrays, keep only summaries
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
    
    return context;
  }
  
  /**
   * Extract vehicle name from message
   */
  extractVehicleName() {
    const words = this.message.split(' ');
    // Find words that might be vehicle names
    const vehicleNames = this.userVehicles.map(v => v.name.toLowerCase());
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
    const vehicleNames = this.userVehicles.map(v => v.name.toLowerCase());
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
