import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

/**
 * AI Tool System
 * Automatically retrieves fleet data based on user intent
 */

export const AI_TOOLS = {
  get_vehicle_status: {
    name: 'get_vehicle_status',
    description: 'Get current status of a vehicle including ignition, telemetry online status, and last update time',
    parameters: {
      type: 'object',
      properties: {
        vehicleId: { type: 'string', description: 'Vehicle ID (optional, if not provided returns all vehicles)' },
      },
    },
    handler: async (userId, params) => {
      const vehicles = await prisma.vehicle.findMany({
        where: {
          userId,
          deletedAt: null,
          ...(params.vehicleId ? { id: params.vehicleId } : {}),
        },
        include: {
          liveState: true,
          telematicsDevice: true,
        },
      });

      return vehicles.map((v) => ({
        id: v.id,
        name: `${v.make} ${v.model}`,
        plate: v.plateNumber || v.vin,
        ignition: v.liveState?.ignitionStatus ? 'ON' : 'OFF',
        status: v.liveState?.vehicleStatus || 'UNKNOWN',
        telemetryOnline: v.telemetryOnline,
        lastUpdate: v.liveState?.lastUpdate || v.lastObdAt,
        telemetrySource: v.liveState?.telemetrySource,
      }));
    },
  },

  get_latest_telemetry: {
    name: 'get_latest_telemetry',
    description: 'Get latest OBD telemetry data for a vehicle including RPM, speed, coolant temp, fuel level, battery voltage',
    parameters: {
      type: 'object',
      properties: {
        vehicleId: { type: 'string', description: 'Vehicle ID (optional, if not provided returns all vehicles)' },
      },
    },
    handler: async (userId, params) => {
      const vehicles = await prisma.vehicle.findMany({
        where: {
          userId,
          deletedAt: null,
          ...(params.vehicleId ? { id: params.vehicleId } : {}),
        },
      });

      const telemetryData = await Promise.all(
        vehicles.map(async (v) => {
          const telemetry = await prisma.obdLiveData.findFirst({
            where: { vehicleId: v.id },
            orderBy: { recordedAt: 'desc' },
          });

          return {
            vehicleId: v.id,
            vehicleName: `${v.make} ${v.model}`,
            plate: v.plateNumber || v.vin,
            telemetry: telemetry ? {
              rpm: telemetry.rpm,
              speed: telemetry.speed,
              coolantTemp: telemetry.coolantTemp,
              fuelLevel: telemetry.fuelLevel,
              batteryVoltage: telemetry.batteryVoltage,
              engineLoad: telemetry.engineLoad,
              throttle: telemetry.throttle,
              intakeTemp: telemetry.intakeTemp,
              maf: telemetry.maf,
              recordedAt: telemetry.recordedAt,
            } : null,
          };
        })
      );

      return telemetryData;
    },
  },

  get_gps_location: {
    name: 'get_gps_location',
    description: 'Get latest GPS location for a vehicle',
    parameters: {
      type: 'object',
      properties: {
        vehicleId: { type: 'string', description: 'Vehicle ID (optional, if not provided returns all vehicles)' },
      },
    },
    handler: async (userId, params) => {
      const vehicles = await prisma.vehicle.findMany({
        where: {
          userId,
          deletedAt: null,
          ...(params.vehicleId ? { id: params.vehicleId } : {}),
        },
        include: {
          gpsLocation: true,
        },
      });

      return vehicles.map((v) => ({
        vehicleId: v.id,
        vehicleName: `${v.make} ${v.model}`,
        plate: v.plateNumber || v.vin,
        gps: v.gpsLocation ? {
          lat: v.gpsLocation.lat,
          lng: v.gpsLocation.lng,
          recordedAt: v.gpsLocation.recordedAt,
        } : null,
      }));
    },
  },

  get_alerts: {
    name: 'get_alerts',
    description: 'Get alerts for vehicles including unread alerts',
    parameters: {
      type: 'object',
      properties: {
        vehicleId: { type: 'string', description: 'Vehicle ID (optional)' },
        unreadOnly: { type: 'boolean', description: 'Only return unread alerts (default: false)' },
      },
    },
    handler: async (userId, params) => {
      const alerts = await prisma.alert.findMany({
        where: {
          vehicle: {
            userId,
            deletedAt: null,
            ...(params.vehicleId ? { id: params.vehicleId } : {}),
          },
          ...(params.unreadOnly ? { read: false } : {}),
        },
        include: {
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              plateNumber: true,
              vin: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return alerts.map((a) => ({
        id: a.id,
        type: a.alertType,
        message: a.message,
        severity: a.severity,
        read: a.read,
        createdAt: a.createdAt,
        vehicle: a.vehicle,
      }));
    },
  },

  get_dtc_codes: {
    name: 'get_dtc_codes',
    description: 'Get DTC (Diagnostic Trouble Codes) for vehicles',
    parameters: {
      type: 'object',
      properties: {
        vehicleId: { type: 'string', description: 'Vehicle ID (optional)' },
        activeOnly: { type: 'boolean', description: 'Only return active DTC codes (default: true)' },
      },
    },
    handler: async (userId, params) => {
      const dtcCodes = await prisma.dTCCode.findMany({
        where: {
          vehicle: {
            userId,
            deletedAt: null,
            ...(params.vehicleId ? { id: params.vehicleId } : {}),
          },
          ...(params.activeOnly !== false ? { active: true } : {}),
        },
        include: {
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              plateNumber: true,
              vin: true,
            },
          },
        },
        orderBy: { detectedAt: 'desc' },
      });

      return dtcCodes.map((dtc) => ({
        id: dtc.id,
        code: dtc.code,
        description: dtc.description,
        severity: dtc.severity,
        active: dtc.active,
        detectedAt: dtc.detectedAt,
        clearedAt: dtc.clearedAt,
        vehicle: dtc.vehicle,
      }));
    },
  },

  get_maintenance: {
    name: 'get_maintenance',
    description: 'Get maintenance records and upcoming maintenance for vehicles',
    parameters: {
      type: 'object',
      properties: {
        vehicleId: { type: 'string', description: 'Vehicle ID (optional)' },
        pendingOnly: { type: 'boolean', description: 'Only return pending maintenance (default: false)' },
      },
    },
    handler: async (userId, params) => {
      const maintenance = await prisma.maintenanceLog.findMany({
        where: {
          vehicle: {
            userId,
            deletedAt: null,
            ...(params.vehicleId ? { id: params.vehicleId } : {}),
          },
          ...(params.pendingOnly ? { completed: false } : {}),
        },
        include: {
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              plateNumber: true,
              vin: true,
            },
          },
        },
        orderBy: [
          { completed: 'asc' },
          { dueDate: 'asc' },
        ],
      });

      return maintenance.map((m) => ({
        id: m.id,
        serviceType: m.serviceType,
        description: m.description,
        dueKm: m.dueKm,
        dueDate: m.dueDate,
        completed: m.completed,
        completedAt: m.completedAt,
        cost: m.cost,
        notes: m.notes,
        vehicle: m.vehicle,
      }));
    },
  },

  get_trips: {
    name: 'get_trips',
    description: 'Get trip data for vehicles including distance, duration, fuel consumption',
    parameters: {
      type: 'object',
      properties: {
        vehicleId: { type: 'string', description: 'Vehicle ID (optional)' },
        limit: { type: 'number', description: 'Number of trips to return (default: 20)' },
      },
    },
    handler: async (userId, params) => {
      const limit = params.limit || 20;
      const trips = await prisma.trip.findMany({
        where: {
          vehicle: {
            userId,
            deletedAt: null,
            ...(params.vehicleId ? { id: params.vehicleId } : {}),
          },
        },
        include: {
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              plateNumber: true,
              vin: true,
            },
          },
        },
        orderBy: { startTime: 'desc' },
        take: limit,
      });

      return trips.map((t) => ({
        id: t.id,
        distance: t.distance,
        duration: t.duration,
        fuelConsumed: t.fuelConsumed,
        avgSpeed: t.avgSpeed,
        maxSpeed: t.maxSpeed,
        startTime: t.startTime,
        endTime: t.endTime,
        startLocation: t.startLocation,
        endLocation: t.endLocation,
        vehicle: t.vehicle,
      }));
    },
  },

  get_fuel_history: {
    name: 'get_fuel_history',
    description: 'Get fuel consumption and refueling history',
    parameters: {
      type: 'object',
      properties: {
        vehicleId: { type: 'string', description: 'Vehicle ID (optional)' },
        limit: { type: 'number', description: 'Number of records to return (default: 20)' },
      },
    },
    handler: async (userId, params) => {
      const limit = params.limit || 20;
      const fuelHistory = await prisma.fuelHistory.findMany({
        where: {
          vehicle: {
            userId,
            deletedAt: null,
            ...(params.vehicleId ? { id: params.vehicleId } : {}),
          },
        },
        include: {
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              plateNumber: true,
              vin: true,
            },
          },
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      return fuelHistory.map((f) => ({
        id: f.id,
        fuelBefore: f.fuelBefore,
        fuelAfter: f.fuelAfter,
        litersAdded: f.litersAdded,
        eventType: f.eventType,
        source: f.source,
        timestamp: f.timestamp,
        vehicle: f.vehicle,
      }));
    },
  },

  get_fleet_summary: {
    name: 'get_fleet_summary',
    description: 'Get overall fleet summary including vehicle counts, online status, alerts, and KPIs',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async (userId) => {
      const vehicles = await prisma.vehicle.findMany({
        where: { userId, deletedAt: null },
        include: {
          liveState: true,
          alerts: { where: { read: false } },
          dtcCodes: { where: { active: true } },
        },
      });

      const totalVehicles = vehicles.length;
      const onlineVehicles = vehicles.filter((v) => v.telemetryOnline).length;
      const offlineVehicles = totalVehicles - onlineVehicles;
      const ignitionOn = vehicles.filter((v) => v.liveState?.ignitionStatus).length;
      const ignitionOff = totalVehicles - ignitionOn;
      const unreadAlerts = vehicles.reduce((sum, v) => sum + v.alerts.length, 0);
      const activeDtcCodes = vehicles.reduce((sum, v) => sum + v.dtcCodes.length, 0);

      return {
        totalVehicles,
        onlineVehicles,
        offlineVehicles,
        ignitionOn,
        ignitionOff,
        unreadAlerts,
        activeDtcCodes,
        vehicles: vehicles.map((v) => ({
          id: v.id,
          name: `${v.make} ${v.model}`,
          plate: v.plateNumber || v.vin,
          online: v.telemetryOnline,
          ignition: v.liveState?.ignitionStatus ? 'ON' : 'OFF',
          status: v.liveState?.vehicleStatus,
        })),
      };
    },
  },
};

/**
 * Execute an AI tool
 */
export async function executeTool(userId, toolName, params) {
  const tool = AI_TOOLS[toolName];
  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  try {
    logger.info('Executing AI tool', { toolName, userId, params });
    const result = await tool.handler(userId, params);
    return result;
  } catch (error) {
    logger.error('Error executing AI tool', { toolName, userId, error: error.message });
    throw error;
  }
}

/**
 * Get available tools for AI
 */
export function getAvailableTools() {
  return Object.values(AI_TOOLS).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}
