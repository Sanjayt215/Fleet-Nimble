import prisma from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export async function startTrip(req, res, next) {
  try {
    const { vehicleId, startLocation, latitude, longitude } = req.body;
    if (!vehicleId) throw new AppError('vehicleId required', 400, 'VALIDATION_ERROR');
    await assertVehicle(req, vehicleId);

    const trip = await prisma.tripLog.create({
      data: {
        vehicleId,
        startTime: new Date(),
        startLocation: startLocation || (latitude != null ? `${latitude},${longitude}` : null),
      },
    });

    if (latitude != null && longitude != null) {
      await prisma.gpsHistory.create({
        data: { tripId: trip.id, latitude, longitude },
      });
    }

    const io = req.app.get('io');
    if (io) io.to(`vehicle:${vehicleId}`).emit('trip:update', { ...trip, status: 'started' });

    res.status(201).json({ success: true, data: trip });
  } catch (err) {
    next(err);
  }
}

export async function endTrip(req, res, next) {
  try {
    const { tripId, endLocation, distance, avgSpeed, fuelUsed, latitude, longitude } = req.body;
    if (!tripId) throw new AppError('tripId required', 400, 'VALIDATION_ERROR');

    const existing = await prisma.tripLog.findUnique({
      where: { id: tripId },
      include: { vehicle: true },
    });
    if (!existing) throw new AppError('Trip not found', 404, 'NOT_FOUND');
    await assertVehicle(req, existing.vehicleId);

    const trip = await prisma.tripLog.update({
      where: { id: tripId },
      data: {
        endTime: new Date(),
        endLocation,
        distance: distance != null ? parseFloat(distance) : existing.distance,
        avgSpeed: avgSpeed != null ? parseFloat(avgSpeed) : null,
        fuelUsed: fuelUsed != null ? parseFloat(fuelUsed) : null,
      },
    });

    if (latitude != null && longitude != null) {
      await prisma.gpsHistory.create({
        data: { tripId, latitude, longitude },
      });
    }

    const io = req.app.get('io');
    if (io) io.to(`vehicle:${existing.vehicleId}`).emit('trip:update', { ...trip, status: 'ended' });

    res.json({ success: true, data: trip });
  } catch (err) {
    next(err);
  }
}

export async function listTrips(req, res, next) {
  try {
    const { vehicleId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    await assertVehicle(req, vehicleId);
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [trips, total] = await Promise.all([
      prisma.tripLog.findMany({
        where: { vehicleId },
        orderBy: { startTime: 'desc' },
        skip,
        take: parseInt(limit, 10),
        include: { _count: { select: { gpsHistory: true } } },
      }),
      prisma.tripLog.count({ where: { vehicleId } }),
    ]);
    res.json({ success: true, data: trips, meta: { total, page: parseInt(page, 10) } });
  } catch (err) {
    next(err);
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
