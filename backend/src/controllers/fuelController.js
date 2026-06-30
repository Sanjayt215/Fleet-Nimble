import prisma from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export async function create(req, res, next) {
  try {
    const { vehicleId, liters, cost, mileage } = req.body;
    if (!vehicleId || liters == null) {
      throw new AppError('vehicleId and liters required', 400, 'VALIDATION_ERROR');
    }
    await assertVehicle(req, vehicleId);

    const log = await prisma.fuelLog.create({
      data: {
        vehicleId,
        liters: parseFloat(liters),
        cost: cost != null ? parseFloat(cost) : null,
        mileage: mileage != null ? parseFloat(mileage) : null,
      },
    });
    res.status(201).json({ success: true, data: log });
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const { vehicleId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    await assertVehicle(req, vehicleId);
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [logs, total] = await Promise.all([
      prisma.fuelLog.findMany({
        where: { vehicleId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit, 10),
      }),
      prisma.fuelLog.count({ where: { vehicleId } }),
    ]);
    res.json({ success: true, data: logs, meta: { total } });
  } catch (err) {
    next(err);
  }
}

export async function getVehicleFuelData(req, res, next) {
  try {
    const { vehicleId } = req.params;
    
    // Get latest fuel level from telemetry
    const latestTelemetry = await prisma.telemetry.findFirst({
      where: { vehicleId },
      orderBy: { timestamp: 'desc' },
      select: {
        fuelLevel: true,
        timestamp: true,
      },
    });

    // Get recent fuel logs
    const fuelLogs = await prisma.fuelLog.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        liters: true,
        cost: true,
        mileage: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      data: {
        vehicleId,
        fuelLevel: latestTelemetry?.fuelLevel ?? null,
        lastUpdated: latestTelemetry?.timestamp ?? null,
        fuelHistory: fuelLogs,
      },
    });
  } catch (err) {
    // Return 200 with empty values instead of 404
    res.json({
      success: true,
      data: {
        vehicleId: req.params.vehicleId,
        fuelLevel: null,
        lastUpdated: null,
        fuelHistory: [],
      },
    });
  }
}

async function assertVehicle(req, vehicleId) {
  const where = {
    id: vehicleId,
    deletedAt: null,
    ...(req.user.role.name !== 'ADMIN' ? { userId: req.userId } : {}),
  };
  const v = await prisma.vehicle.findFirst({ where });
  if (!v) throw new AppError('Vehicle not found', 404, 'NOT_FOUND');
}
