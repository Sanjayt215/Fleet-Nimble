import prisma from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

async function verifyVehicleAccess(vehicleId, userId, role) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, deletedAt: null },
  });
  if (!vehicle) throw new AppError('Vehicle not found', 404);
  if (role !== 'admin' && vehicle.userId !== userId) {
    throw new AppError('Access denied', 403);
  }
  return vehicle;
}

/**
 * GET /api/diagnostics/:vehicleId
 * Get live diagnostics for a single vehicle.
 * Includes: live state, latest OBD, DTC codes, alerts, fuel status, maintenance.
 */
export async function getLiveDiagnostics(req, res, next) {
  try {
    const { vehicleId } = req.params;
    await verifyVehicleAccess(vehicleId, req.userId, req.user.role.name);

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        liveState: true,
        liveData: { orderBy: { recordedAt: 'desc' }, take: 1 },
        dtcCodes: { where: { active: true } },
        alerts: { orderBy: { createdAt: 'desc' }, take: 5 },
        fuelLogs: { orderBy: { createdAt: 'desc' }, take: 1 },
        maintenanceLogs: { where: { completed: false }, take: 3 },
      },
    });

    const diagnostics = {
      vehicle: {
        id: vehicle.id,
        vin: vehicle.vin,
        plateNumber: vehicle.plateNumber,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        odometer: vehicle.odometer,
        telemetryOnline: vehicle.telemetryOnline,
        lastObdAt: vehicle.lastObdAt,
      },
      liveState: vehicle.liveState
        ? {
            telemetrySource: vehicle.liveState.telemetrySource,
            lastUpdate: vehicle.liveState.lastUpdate,
            rpm: vehicle.liveState.rpm,
            speed: vehicle.liveState.speed,
            coolantTemp: vehicle.liveState.coolantTemp,
            batteryVoltage: vehicle.liveState.batteryVoltage,
            fuelLevel: vehicle.liveState.fuelLevel,
            engineLoad: vehicle.liveState.engineLoad,
            throttle: vehicle.liveState.throttlePosition,
            engineHours: vehicle.liveState.engineHours,
            odometer: vehicle.liveState.odometer,
            gps: {
              lat: vehicle.liveState.gpsLat,
              lng: vehicle.liveState.gpsLng,
            },
            status: vehicle.liveState.vehicleStatus,
            ignitionOn: vehicle.liveState.ignitionStatus,
          }
        : null,
      dtcCodes: vehicle.dtcCodes.map((dtc) => ({
        code: dtc.code,
        description: dtc.description,
        status: dtc.status,
        severity: dtc.severity,
        detectedAt: dtc.detectedAt,
      })),
      alerts: vehicle.alerts.map((a) => ({
        id: a.id,
        type: a.alertType,
        message: a.message,
        severity: a.severity,
        read: a.read,
        createdAt: a.createdAt,
      })),
      fuel: vehicle.fuelLogs[0]
        ? {
            level: vehicle.liveState?.fuelLevel ?? 0,
            lastRefuel: vehicle.fuelLogs[0].createdAt,
            lastRefuelLiters: vehicle.fuelLogs[0].liters,
          }
        : { level: vehicle.liveState?.fuelLevel ?? 0 },
      maintenance: vehicle.maintenanceLogs.map((m) => ({
        id: m.id,
        serviceType: m.serviceType,
        dueKm: m.dueKm,
        dueDate: m.dueDate,
        completed: m.completed,
      })),
    };

    res.json({ success: true, data: diagnostics });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/diagnostics/fleet/overview
 * Get live diagnostics for all vehicles (fleet view).
 * Returns a grid of vehicles with basic live state.
 */
export async function getFleetDiagnosticsOverview(req, res, next) {
  try {
    const userId = req.user.role.name === 'ADMIN' ? undefined : req.userId;

    const vehicles = await prisma.vehicle.findMany({
      where: {
        deletedAt: null,
        ...(userId ? { userId } : {}),
      },
      include: {
        liveState: true,
        dtcCodes: { where: { active: true } },
        alerts: { where: { read: false } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const overview = vehicles.map((v) => ({
      id: v.id,
      plateNumber: v.plateNumber,
      make: v.make,
      model: v.model,
      odometer: v.odometer,
      telemetryOnline: v.telemetryOnline,
      liveState: v.liveState
        ? {
            status: v.liveState.vehicleStatus,
            speed: v.liveState.speed,
            rpm: v.liveState.rpm,
            fuelLevel: v.liveState.fuelLevel,
            temp: v.liveState.coolantTemp,
            source: v.liveState.telemetrySource,
            lastUpdate: v.liveState.lastUpdate,
            gps: {
              lat: v.liveState.gpsLat,
              lng: v.liveState.gpsLng,
            },
          }
        : null,
      activeDtcCount: v.dtcCodes.length,
      unreadAlertCount: v.alerts.length,
    }));

    res.json({ success: true, data: overview });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/diagnostics/:vehicleId/history
 * Get telemetry history for a vehicle (time series).
 */
export async function getTelemetryHistory(req, res, next) {
  try {
    const { vehicleId } = req.params;
    const { from, to, limit = 100 } = req.query;

    await verifyVehicleAccess(vehicleId, req.userId, req.user.role.name);

    const where = {
      vehicleId,
      ...(from || to
        ? {
            recordedAt: {
              ...(from && { gte: new Date(from) }),
              ...(to && { lte: new Date(to) }),
            },
          }
        : {}),
    };

    const history = await prisma.obdLiveData.findMany({
      where,
      orderBy: { recordedAt: 'desc' },
      take: parseInt(limit, 10),
      select: {
        recordedAt: true,
        rpm: true,
        speed: true,
        coolantTemp: true,
        fuelLevel: true,
        batteryVoltage: true,
        latitude: true,
        longitude: true,
        gpsAccuracy: true,
        engineLoad: true,
        throttle: true,
      },
    });

    res.json({
      success: true,
      data: {
        count: history.length,
        history: history.reverse(),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/diagnostics/:vehicleId/events
 * Get driver behavior and DTC events for a vehicle.
 */
export async function getVehicleEvents(req, res, next) {
  try {
    const { vehicleId } = req.params;
    const { type, from, to, limit = 50 } = req.query;

    await verifyVehicleAccess(vehicleId, req.userId, req.user.role.name);

    const where = {
      vehicleId,
      ...(from || to
        ? {
            recordedAt: {
              ...(from && { gte: new Date(from) }),
              ...(to && { lte: new Date(to) }),
            },
          }
        : {}),
    };

    let events = [];

    if (!type || type === 'behavior') {
      const behaviors = await prisma.driverBehaviorEvent.findMany({
        where,
        orderBy: { recordedAt: 'desc' },
        take: parseInt(limit, 10),
      });
      events = events.concat(
        behaviors.map((b) => ({
          type: 'behavior',
          eventType: b.eventType,
          severity: b.severity,
          recordedAt: b.recordedAt,
          latitude: b.latitude,
          longitude: b.longitude,
          metadata: b.metadata,
        }))
      );
    }

    if (!type || type === 'dtc') {
      const dtcs = await prisma.dtcCode.findMany({
        where: {
          vehicleId,
          ...(from || to
            ? {
                detectedAt: {
                  ...(from && { gte: new Date(from) }),
                  ...(to && { lte: new Date(to) }),
                },
              }
            : {}),
        },
        orderBy: { detectedAt: 'desc' },
        take: parseInt(limit, 10),
      });
      events = events.concat(
        dtcs.map((d) => ({
          type: 'dtc',
          code: d.code,
          description: d.description,
          severity: d.severity,
          recordedAt: d.detectedAt,
          status: d.status,
        }))
      );
    }

    res.json({
      success: true,
      data: {
        count: events.length,
        events: events.sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt)).slice(0, parseInt(limit, 10)),
      },
    });
  } catch (err) {
    next(err);
  }
}
