import prisma from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

async function verifyVehicle(vehicleId, userId, role) {
  const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, deletedAt: null } });
  if (!v) throw new AppError('Vehicle not found', 404);
  if (role !== 'admin' && v.userId !== userId) throw new AppError('Access denied', 403);
  return v;
}

export async function startTrip(userId, role, { vehicleId, startLocation, latitude, longitude }) {
  await verifyVehicle(vehicleId, userId, role);
  const active = await prisma.tripLog.findFirst({
    where: { vehicleId, status: 'active' },
  });
  if (active) return active;

  const trip = await prisma.tripLog.create({
    data: {
      vehicleId,
      startTime: new Date(),
      startLocation,
      status: 'active',
    },
  });

  if (latitude != null && longitude != null) {
    await prisma.gpsHistory.create({
      data: { tripId: trip.id, latitude, longitude },
    });
  }
  return trip;
}

export async function endTrip(userId, role, { tripId, endLocation, distance, avgSpeed, fuelUsed }) {
  const trip = await prisma.tripLog.findUnique({ where: { id: tripId } });
  if (!trip) throw new AppError('Trip not found', 404);
  await verifyVehicle(trip.vehicleId, userId, role);

  return prisma.tripLog.update({
    where: { id: tripId },
    data: {
      endTime: new Date(),
      endLocation,
      distance: distance ?? trip.distance,
      avgSpeed,
      fuelUsed,
      status: 'completed',
    },
  });
}

export async function getTrips(vehicleId, userId, role) {
  await verifyVehicle(vehicleId, userId, role);
  return prisma.tripLog.findMany({
    where: { vehicleId },
    orderBy: { startTime: 'desc' },
    take: 50,
  });
}

export async function updateGps(userId, role, { tripId, latitude, longitude, speed }, io) {
  const trip = await prisma.tripLog.findUnique({ where: { id: tripId } });
  if (!trip || trip.status !== 'active') throw new AppError('Active trip not found', 404);
  await verifyVehicle(trip.vehicleId, userId, role);

  const point = await prisma.gpsHistory.create({
    data: { tripId, latitude, longitude, speed },
  });

  if (io) {
    io.to(`vehicle:${trip.vehicleId}`).emit('trip:update', { tripId, point });
  }
  return point;
}

export async function getGpsHistory(tripId, userId, role) {
  const trip = await prisma.tripLog.findUnique({
    where: { id: tripId },
    include: { vehicle: true },
  });
  if (!trip) throw new AppError('Trip not found', 404);
  if (role !== 'admin' && trip.vehicle.userId !== userId) {
    throw new AppError('Access denied', 403);
  }
  return prisma.gpsHistory.findMany({
    where: { tripId },
    orderBy: { timestamp: 'asc' },
  });
}
