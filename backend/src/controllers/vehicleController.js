import prisma from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { invalidateVehicleCache } from '../services/cacheService.js';
import { enrichVehicleWithTelemetry, enrichVehicleList } from '../services/vehicleTelemetryStatus.js';
import * as vehicleService from '../services/vehicleService.js';

export async function create(req, res, next) {
  try {
    const vehicle = await vehicleService.createVehicle(req.userId, {
      vin: req.body.vin,
      plateNumber: req.body.plateNumber,
      make: req.body.make,
      model: req.body.model,
      year: req.body.year,
      odometer: req.body.odometer,
      obdDeviceId: req.body.obdDeviceId,
    });
    await invalidateVehicleCache(req.userId);
    res.status(201).json({ success: true, data: vehicle });
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const where = {
      deletedAt: null,
      ...(req.user.role.name !== 'ADMIN' ? { userId: req.userId } : {}),
      ...(search
        ? {
            OR: [
              { make: { contains: search, mode: 'insensitive' } },
              { model: { contains: search, mode: 'insensitive' } },
              { plateNumber: { contains: search, mode: 'insensitive' } },
              { vin: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [vehicles, total] = await Promise.all([
      vehicleService.listVehicles(req.userId, req.user.role.name),
      prisma.vehicle.count({ where }),
    ]);
    res.json({
      success: true,
      data: enrichVehicleList(vehicles),
      meta: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMyVehicles(req, res, next) {
  try {
    const { userId } = req.user;
    const vehicles = await prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      include: { obdDevices: true, liveState: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: vehicles });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const vehicle = await findVehicle(req);
    res.json({ success: true, data: vehicle });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    await findVehicle(req);
    const { vin, plateNumber, make, model, year, odometer, obdDeviceId } = req.body;
    const vehicle = await prisma.vehicle.update({
      where: { id: req.params.id },
      data: {
        ...(vin !== undefined && { vin }),
        ...(plateNumber !== undefined && { plateNumber }),
        ...(make !== undefined && { make }),
        ...(model !== undefined && { model }),
        ...(year !== undefined && { year: parseInt(year, 10) }),
        ...(odometer !== undefined && { odometer: parseFloat(odometer) }),
        ...(obdDeviceId !== undefined && { obdDeviceId }),
      },
    });
    await invalidateVehicleCache(req.userId);
    res.json({ success: true, data: vehicle });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await findVehicle(req);
    await prisma.vehicle.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });
    await invalidateVehicleCache(req.userId);
    res.json({ success: true, message: 'Vehicle deleted' });
  } catch (err) {
    next(err);
  }
}

async function findVehicle(req) {
  const where = {
    id: req.params.id,
    deletedAt: null,
    ...(req.user.role.name !== 'ADMIN' ? { userId: req.userId } : {}),
  };
  const vehicle = await prisma.vehicle.findFirst({
    where,
    include: {
      _count: { select: { trips: true, dtcCodes: true, alerts: true } },
      liveData: { take: 1, orderBy: { recordedAt: 'desc' } },
      liveState: true,
      telematicsDevice: true,
      gpsLocation: true,
      company: { select: { id: true, slug: true, name: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!vehicle) throw new AppError('Vehicle not found', 404, 'NOT_FOUND');
  if (vehicle.liveState?.telemetrySource === 'REAL' && (!vehicle.liveData || vehicle.liveData.length === 0)) {
    vehicle.liveData = [
      {
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
      },
    ];
  }
  return enrichVehicleWithTelemetry(vehicle);
}
