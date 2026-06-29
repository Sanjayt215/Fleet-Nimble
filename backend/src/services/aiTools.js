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

  predict_battery_failure: {
    name: 'predict_battery_failure',
    description: 'Predict battery failure risk based on voltage trends and age',
    parameters: {
      type: 'object',
      properties: {
        vehicleId: { type: 'string', description: 'Vehicle ID' },
      },
    },
    handler: async (userId, params) => {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: params.vehicleId, userId, deletedAt: null },
      });

      if (!vehicle) return { error: 'Vehicle not found' };

      const telemetry = await prisma.obdLiveData.findMany({
        where: { vehicleId: params.vehicleId },
        orderBy: { recordedAt: 'desc' },
        take: 10,
      });

      if (telemetry.length === 0) {
        return { prediction: 'No telemetry data available', confidence: 'Low' };
      }

      const avgVoltage = telemetry.reduce((sum, t) => sum + (t.batteryVoltage || 0), 0) / telemetry.length;
      const minVoltage = Math.min(...telemetry.map(t => t.batteryVoltage || 0));

      let risk = 'Low';
      let daysToFailure = 30;
      let confidence = 85;

      if (avgVoltage < 11.5 || minVoltage < 11.0) {
        risk = 'Critical';
        daysToFailure = 1;
        confidence = 95;
      } else if (avgVoltage < 12.0 || minVoltage < 11.5) {
        risk = 'High';
        daysToFailure = 5;
        confidence = 90;
      } else if (avgVoltage < 12.4) {
        risk = 'Medium';
        daysToFailure = 14;
        confidence = 80;
      }

      return {
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        currentVoltage: avgVoltage.toFixed(2),
        minVoltage: minVoltage.toFixed(2),
        risk,
        daysToFailure,
        confidence,
        recommendation: risk === 'Critical' ? 'Replace battery immediately' : risk === 'High' ? 'Schedule battery replacement within 5 days' : 'Monitor battery voltage',
      };
    },
  },

  predict_coolant_overheating: {
    name: 'predict_coolant_overheating',
    description: 'Predict coolant overheating risk based on temperature trends',
    parameters: {
      type: 'object',
      properties: {
        vehicleId: { type: 'string', description: 'Vehicle ID' },
      },
    },
    handler: async (userId, params) => {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: params.vehicleId, userId, deletedAt: null },
      });

      if (!vehicle) return { error: 'Vehicle not found' };

      const telemetry = await prisma.obdLiveData.findMany({
        where: { vehicleId: params.vehicleId },
        orderBy: { recordedAt: 'desc' },
        take: 10,
      });

      if (telemetry.length === 0) {
        return { prediction: 'No telemetry data available', confidence: 'Low' };
      }

      const avgTemp = telemetry.reduce((sum, t) => sum + (t.coolantTemp || 0), 0) / telemetry.length;
      const maxTemp = Math.max(...telemetry.map(t => t.coolantTemp || 0));

      let risk = 'Low';
      let confidence = 85;

      if (maxTemp > 105 || avgTemp > 100) {
        risk = 'Critical';
        confidence = 95;
      } else if (maxTemp > 100 || avgTemp > 95) {
        risk = 'High';
        confidence = 90;
      } else if (maxTemp > 95 || avgTemp > 90) {
        risk = 'Medium';
        confidence = 80;
      }

      return {
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        currentTemp: avgTemp.toFixed(1),
        maxTemp: maxTemp.toFixed(1),
        risk,
        confidence,
        recommendation: risk === 'Critical' ? 'Stop vehicle immediately, check cooling system' : risk === 'High' ? 'Check coolant level and radiator' : 'Monitor coolant temperature',
      };
    },
  },

  compare_vehicles: {
    name: 'compare_vehicles',
    description: 'Compare two vehicles side-by-side on health, fuel, battery, and other metrics',
    parameters: {
      type: 'object',
      properties: {
        vehicleId1: { type: 'string', description: 'First Vehicle ID' },
        vehicleId2: { type: 'string', description: 'Second Vehicle ID' },
      },
    },
    handler: async (userId, params) => {
      const vehicles = await prisma.vehicle.findMany({
        where: {
          userId,
          deletedAt: null,
          id: { in: [params.vehicleId1, params.vehicleId2] },
        },
        include: {
          liveState: true,
          alerts: { where: { read: false } },
          dtcCodes: { where: { active: true } },
          gpsLocation: true,
        },
      });

      if (vehicles.length < 2) return { error: 'One or both vehicles not found' };

      const getTelemetry = async (vehicleId) => {
        const telemetry = await prisma.obdLiveData.findFirst({
          where: { vehicleId },
          orderBy: { recordedAt: 'desc' },
        });
        return telemetry;
      };

      const [v1, v2] = vehicles;
      const [t1, t2] = await Promise.all([
        getTelemetry(v1.id),
        getTelemetry(v2.id),
      ]);

      const calculateHealthScore = (vehicle, telemetry, alerts, dtcCodes) => {
        let score = 100;
        if (!vehicle.telemetryOnline) score -= 30;
        if (alerts.length > 0) score -= alerts.length * 10;
        if (dtcCodes.length > 0) score -= dtcCodes.length * 5;
        if (telemetry?.batteryVoltage < 12) score -= 15;
        if (telemetry?.coolantTemp > 100) score -= 20;
        return Math.max(0, score);
      };

      const comparison = vehicles.map((v) => {
        const telemetry = v.id === v1.id ? t1 : t2;
        const healthScore = calculateHealthScore(v, telemetry, v.alerts, v.dtcCodes);
        return {
          id: v.id,
          name: `${v.make} ${v.model}`,
          plate: v.plateNumber || v.vin,
          healthScore,
          online: v.telemetryOnline,
          ignition: v.liveState?.ignitionStatus ? 'ON' : 'OFF',
          status: v.liveState?.vehicleStatus,
          batteryVoltage: telemetry?.batteryVoltage || null,
          coolantTemp: telemetry?.coolantTemp || null,
          fuelLevel: telemetry?.fuelLevel || null,
          rpm: telemetry?.rpm || null,
          speed: telemetry?.speed || null,
          alerts: v.alerts.length,
          dtcCodes: v.dtcCodes.length,
          location: v.gpsLocation ? `${v.gpsLocation.latitude.toFixed(4)}, ${v.gpsLocation.longitude.toFixed(4)}` : 'No GPS',
        };
      });

      const winner = comparison[0].healthScore > comparison[1].healthScore ? comparison[0] : comparison[1];

      return {
        vehicles: comparison,
        winner: winner.name,
        recommendation: `${winner.name} has better overall health. Prioritize maintenance for the other vehicle.`,
      };
    },
  },

  analyze_root_cause: {
    name: 'analyze_root_cause',
    description: 'Analyze possible root causes for vehicle issues based on symptoms',
    parameters: {
      type: 'object',
      properties: {
        vehicleId: { type: 'string', description: 'Vehicle ID' },
        symptom: { type: 'string', description: 'Symptom description (e.g., high coolant, low battery, engine misfire)' },
      },
    },
    handler: async (userId, params) => {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: params.vehicleId, userId, deletedAt: null },
        include: { dtcCodes: { where: { active: true } } },
      });

      if (!vehicle) return { error: 'Vehicle not found' };

      const symptom = params.symptom.toLowerCase();
      let possibleCauses = [];

      if (symptom.includes('coolant') || symptom.includes('overheat') || symptom.includes('temperature')) {
        possibleCauses = [
          { cause: 'Radiator leak', confidence: 85 },
          { cause: 'Water pump failure', confidence: 75 },
          { cause: 'Low coolant level', confidence: 90 },
          { cause: 'Thermostat malfunction', confidence: 70 },
          { cause: 'Cooling fan failure', confidence: 65 },
          { cause: 'Head gasket leak', confidence: 40 },
        ];
      } else if (symptom.includes('battery') || symptom.includes('voltage')) {
        possibleCauses = [
          { cause: 'Battery age/degradation', confidence: 85 },
          { cause: 'Alternator failure', confidence: 75 },
          { cause: 'Parasitic drain', confidence: 60 },
          { cause: 'Corroded terminals', confidence: 70 },
          { cause: 'Loose belt', confidence: 50 },
        ];
      } else if (symptom.includes('engine') || symptom.includes('misfire') || symptom.includes('power')) {
        possibleCauses = [
          { cause: 'Fuel injector issue', confidence: 75 },
          { cause: 'Spark plug failure', confidence: 80 },
          { cause: 'Ignition coil failure', confidence: 70 },
          { cause: 'Air filter clogged', confidence: 60 },
          { cause: 'Fuel pump issue', confidence: 55 },
          { cause: 'Sensor malfunction', confidence: 65 },
        ];
      } else if (symptom.includes('brake')) {
        possibleCauses = [
          { cause: 'Worn brake pads', confidence: 90 },
          { cause: 'Low brake fluid', confidence: 85 },
          { cause: 'Brake line leak', confidence: 60 },
          { cause: 'Caliper stuck', confidence: 55 },
          { cause: 'ABS sensor fault', confidence: 50 },
        ];
      } else {
        possibleCauses = [
          { cause: 'General wear', confidence: 50 },
          { cause: 'Sensor malfunction', confidence: 45 },
          { cause: 'Maintenance overdue', confidence: 60 },
        ];
      }

      // Adjust confidence based on DTC codes
      vehicle.dtcCodes.forEach((dtc) => {
        if (dtc.code.startsWith('P0')) {
          possibleCauses.forEach((c) => c.confidence = Math.min(100, c.confidence + 10));
        }
      });

      possibleCauses.sort((a, b) => b.confidence - a.confidence);

      return {
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        symptom: params.symptom,
        possibleCauses: possibleCauses.slice(0, 5),
        activeDtcCodes: vehicle.dtcCodes.map((d) => d.code),
        recommendation: `Inspect ${possibleCauses[0].cause.toLowerCase()} first (confidence: ${possibleCauses[0].confidence}%)`,
      };
    },
  },

  get_driver_insights: {
    name: 'get_driver_insights',
    description: 'Get driver performance insights including score, fuel efficiency, harsh braking, acceleration',
    parameters: {
      type: 'object',
      properties: {
        vehicleId: { type: 'string', description: 'Vehicle ID' },
      },
    },
    handler: async (userId, params) => {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: params.vehicleId, userId, deletedAt: null },
      });

      if (!vehicle) return { error: 'Vehicle not found' };

      const behaviorEvents = await prisma.behaviorEvent.findMany({
        where: { vehicleId: params.vehicleId },
        orderBy: { timestamp: 'desc' },
        take: 100,
      });

      const harshBraking = behaviorEvents.filter((e) => e.eventType === 'HARSH_BRAKE').length;
      const harshAccel = behaviorEvents.filter((e) => e.eventType === 'HARSH_ACCEL').length;
      const speeding = behaviorEvents.filter((e) => e.eventType === 'SPEEDING').length;
      const idleEvents = behaviorEvents.filter((e) => e.eventType === 'IDLE').length;

      const trips = await prisma.trip.findMany({
        where: { vehicleId: params.vehicleId },
        orderBy: { startTime: 'desc' },
        take: 20,
      });

      const avgFuelEfficiency = trips.length > 0
        ? trips.reduce((sum, t) => sum + (t.fuelConsumption || 0), 0) / trips.length
        : 0;

      // Calculate driver score (0-100)
      let score = 100;
      score -= harshBraking * 5;
      score -= harshAccel * 3;
      score -= speeding * 2;
      score -= idleEvents * 1;
      score = Math.max(0, score);

      return {
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plateNumber || vehicle.vin,
        driverScore: score,
        fuelEfficiency: avgFuelEfficiency.toFixed(2),
        harshBraking,
        harshAcceleration: harshAccel,
        speeding,
        idleEvents,
        totalEvents: behaviorEvents.length,
        safetyScore: score > 80 ? 'Excellent' : score > 60 ? 'Good' : score > 40 ? 'Fair' : 'Poor',
        recommendation: score < 60 ? 'Driver training recommended' : score < 80 ? 'Monitor driving behavior' : 'Good driving performance',
      };
    },
  },

  get_nearest_vehicle: {
    name: 'get_nearest_vehicle',
    description: 'Find the nearest vehicle to a given location',
    parameters: {
      type: 'object',
      properties: {
        latitude: { type: 'number', description: 'Target latitude' },
        longitude: { type: 'number', description: 'Target longitude' },
      },
    },
    handler: async (userId, params) => {
      const vehicles = await prisma.vehicle.findMany({
        where: { userId, deletedAt: null },
        include: { gpsLocation: true },
      });

      const vehiclesWithLocation = vehicles.filter((v) => v.gpsLocation);

      if (vehiclesWithLocation.length === 0) {
        return { error: 'No vehicles with GPS location available' };
      }

      const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };

      const distances = vehiclesWithLocation.map((v) => ({
        vehicle: `${v.make} ${v.model}`,
        plate: v.plateNumber || v.vin,
        id: v.id,
        distance: calculateDistance(
          params.latitude,
          params.longitude,
          v.gpsLocation.latitude,
          v.gpsLocation.longitude
        ),
        location: {
          latitude: v.gpsLocation.latitude,
          longitude: v.gpsLocation.longitude,
        },
        online: v.telemetryOnline,
        ignition: v.liveState?.ignitionStatus ? 'ON' : 'OFF',
      }));

      distances.sort((a, b) => a.distance - b.distance);

      return {
        targetLocation: { latitude: params.latitude, longitude: params.longitude },
        nearestVehicles: distances.slice(0, 5),
        recommendation: `Nearest vehicle is ${distances[0].vehicle} (${distances[0].plate}) at ${distances[0].distance.toFixed(2)} km`,
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
