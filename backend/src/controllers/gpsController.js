import prisma from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export async function updateGps(req, res, next) {
  try {
    const { tripId, vehicleId, latitude, longitude, timestamp } = req.body;
    if (latitude == null || longitude == null) {
      throw new AppError('latitude and longitude required', 400, 'VALIDATION_ERROR');
    }

    let trip;
    if (tripId) {
      trip = await prisma.tripLog.findUnique({ where: { id: tripId }, include: { vehicle: true } });
      if (!trip) throw new AppError('Trip not found', 404, 'NOT_FOUND');
      await assertVehicleOwner(req, trip.vehicle);
    } else if (vehicleId) {
      trip = await prisma.tripLog.findFirst({
        where: { vehicleId, endTime: null },
        orderBy: { startTime: 'desc' },
        include: { vehicle: true },
      });
      if (!trip) throw new AppError('No active trip', 404, 'NOT_FOUND');
      await assertVehicleOwner(req, trip.vehicle);
    } else {
      throw new AppError('tripId or vehicleId required', 400, 'VALIDATION_ERROR');
    }

    const point = await prisma.gpsHistory.create({
      data: {
        tripId: trip.id,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      },
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`vehicle:${trip.vehicleId}`).emit('trip:update', {
        tripId: trip.id,
        vehicleId: trip.vehicleId,
        gps: point,
      });
    }

    res.status(201).json({ success: true, data: point });
  } catch (err) {
    next(err);
  }
}

export async function getHistory(req, res, next) {
  try {
    const { tripId } = req.params;
    const trip = await prisma.tripLog.findUnique({
      where: { id: tripId },
      include: { vehicle: true },
    });
    if (!trip) throw new AppError('Trip not found', 404, 'NOT_FOUND');
    await assertVehicleOwner(req, trip.vehicle);

    const history = await prisma.gpsHistory.findMany({
      where: { tripId },
      orderBy: { timestamp: 'asc' },
    });
    res.json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
}

function assertVehicleOwner(req, vehicle) {
  if (req.user.role.name === 'ADMIN') return;
  if (vehicle.userId !== req.userId) {
    throw new AppError('Access denied', 403, 'FORBIDDEN');
  }
}
