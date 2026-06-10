import prisma from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { getLatestObdCached } from '../services/cacheService.js';
import { ingestObdReading } from '../services/obdIngest.js';
import { broadcastLiveUpdate } from '../services/telemetryBroadcast.js';
import { buildTelemetryHealth } from '../services/vehicleTelemetryStatus.js';
import { updateLiveStateFromTelemetry, mapStateToLiveUpdate } from '../services/liveStateService.js';
import { processDriverBehavior } from '../services/driverBehaviorService.js';
import { processFuelTrend } from '../services/fuelTrendService.js';

export async function postLiveData(req, res, next) {
  try {
    const { vehicleId } = req.body;
    await assertVehicleAccess(req, vehicleId);

    const { record, telemetry } = await ingestObdReading(vehicleId, req.body, {
      deviceId: req.body.deviceId ?? req.body.device_id,
    });

    const liveState = await updateLiveStateFromTelemetry(vehicleId, telemetry, 'REAL');
    const io = req.app.get('io');
    await broadcastLiveUpdate(io, vehicleId, mapStateToLiveUpdate(liveState), telemetry, req.userId);

    // Process driver behavior and fuel trends
    await Promise.all([
      processDriverBehavior(vehicleId, telemetry, io),
      processFuelTrend(vehicleId, telemetry),
    ]);

    res.status(201).json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
}

export async function postLiveDataBatch(req, res, next) {
  try {
    const { vehicleId, readings, source } = req.body;
    await assertVehicleAccess(req, vehicleId);

    const io = req.app.get('io');
    const results = [];
    let lastTelemetry = null;

    for (const reading of readings) {
      const payload = { ...reading, vehicleId, source: reading.source ?? source ?? 'android' };
      const { record, telemetry } = await ingestObdReading(vehicleId, payload, {
        deviceId: payload.deviceId ?? payload.device_id,
      });
      results.push(record);
      lastTelemetry = telemetry;
    }

    const latest = results[results.length - 1];
    if (latest && lastTelemetry) {
      const liveState = await updateLiveStateFromTelemetry(vehicleId, lastTelemetry, 'REAL');
      await broadcastLiveUpdate(io, vehicleId, mapStateToLiveUpdate(liveState), lastTelemetry, req.userId);

      // Process driver behavior and fuel trends
      await Promise.all([
        processDriverBehavior(vehicleId, lastTelemetry, io),
        processFuelTrend(vehicleId, lastTelemetry),
      ]);
    }

    res.status(201).json({ success: true, data: { count: results.length, latest } });
  } catch (err) {
    next(err);
  }
}

export async function getLatest(req, res, next) {
  try {
    const { vehicleId } = req.params;
    await assertVehicleAccess(req, vehicleId);

    let data = await getLatestObdCached(vehicleId);
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { telematicsDevice: true, liveState: true },
    });

    const telemetryHealth = vehicle
      ? buildTelemetryHealth(vehicle, vehicle.telematicsDevice)
      : null;

    if (!data && vehicle?.liveState) {
      data = {
        id: vehicle.liveState.id,
        vehicleId: vehicle.liveState.vehicleId,
        rpm: vehicle.liveState.rpm,
        speed: vehicle.liveState.speed,
        coolantTemp: vehicle.liveState.coolantTemp,
        fuelLevel: vehicle.liveState.fuelLevel,
        batteryVoltage: vehicle.liveState.batteryVoltage,
        throttle: vehicle.liveState.throttlePosition,
        engineLoad: vehicle.liveState.engineLoad,
        maf: vehicle.liveState.maf,
        intakeTemp: vehicle.liveState.intakeTemp,
        latitude: vehicle.liveState.gpsLat,
        longitude: vehicle.liveState.gpsLng,
        recordedAt: vehicle.liveState.lastUpdate,
      };
    }

    const gps = await prisma.gpsLocation.findUnique({ where: { vehicleId } });

    res.json({
      success: true,
      data: data
        ? {
            ...data,
            gps,
            telemetryOnline: vehicle?.telemetryOnline ?? false,
            lastObdAt: vehicle?.lastObdAt,
            telemetryHealth,
          }
        : vehicle
          ? { telemetryOnline: vehicle.telemetryOnline, lastObdAt: vehicle.lastObdAt, telemetryHealth }
          : null,
    });
  } catch (err) {
    next(err);
  }
}

export async function getHistory(req, res, next) {
  try {
    const { vehicleId } = req.params;
    const { from, to, limit = 100 } = req.query;
    await assertVehicleAccess(req, vehicleId);

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

    const data = await prisma.obdLiveData.findMany({
      where,
      orderBy: { recordedAt: 'desc' },
      take: parseInt(limit, 10),
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function assertVehicleAccess(req, vehicleId) {
  const where = {
    id: vehicleId,
    deletedAt: null,
    ...(req.user.role.name !== 'ADMIN' ? { userId: req.userId } : {}),
  };
  const v = await prisma.vehicle.findFirst({ where });
  if (!v) throw new AppError('Vehicle not found', 404, 'NOT_FOUND');
  return v;
}
