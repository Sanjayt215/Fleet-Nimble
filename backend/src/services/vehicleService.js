import prisma from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { cacheDel } from '../utils/redis.js';
import { mapStateToLiveUpdate } from './liveStateService.js';

export async function createVehicle(userId, data) {
  const odometer = data.odometer != null && !Number.isNaN(Number(data.odometer))
    ? Number(data.odometer)
    : 0;
  const engineHoursObd = data.engineHoursObd != null && !Number.isNaN(Number(data.engineHoursObd))
    ? Number(data.engineHoursObd)
    : undefined;

  return prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.create({
      data: {
        userId,
        vin: data.vin,
        plateNumber: data.plateNumber,
        make: data.make,
        model: data.model,
        year: data.year != null ? Number(data.year) : null,
        odometer,
        engineHoursObd,
        obdDeviceId: data.obdDeviceId,
      },
    });

    const vehicleWithCompany = await tx.vehicle.findUnique({
      where: { id: vehicle.id },
      include: { company: true },
    });

    await tx.fuelLog.create({
      data: {
        vehicleId: vehicle.id,
        liters: 50,
        cost: 0,
        mileage: odometer,
      },
    });

    await tx.maintenanceLog.create({
      data: {
        vehicleId: vehicle.id,
        serviceType: 'Initial service',
        dueKm: odometer + 5000,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        completed: false,
      },
    });

    return vehicle;
  });
}

export async function listVehicles(userId, role) {
  const where = role === 'admin' ? { deletedAt: null } : { userId, deletedAt: null };
  return prisma.vehicle.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      telematicsDevice: {
        select: {
          id: true,
          deviceUid: true,
          status: true,
          deviceType: true,
          lastHeartbeatAt: true,
          lastSeenAt: true,
          firmwareVersion: true,
        },
      },
      gpsLocation: { select: { lat: true, lng: true, recordedAt: true } },
      liveState: true,
      _count: { select: { dtcCodes: { where: { active: true } }, alerts: { where: { read: false } } } },
    },
  });
}

export async function getVehicle(id, userId, role) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, deletedAt: null },
    include: {
      liveData: { orderBy: { recordedAt: 'desc' }, take: 1 },
      liveState: true,
      dtcCodes: { where: { active: true } },
      maintenance: { where: { completed: false }, take: 5 },
      tripLogs: { orderBy: { startTime: 'desc' }, take: 5 },
    },
  });
  if (!vehicle) throw new AppError('Vehicle not found', 404);
  if (role !== 'admin' && vehicle.userId !== userId) {
    throw new AppError('Access denied', 403);
  }

  if (vehicle.liveState?.telemetrySource === 'REAL' && (!vehicle.liveData || vehicle.liveData.length === 0)) {
    vehicle.liveData = [mapStateToLiveUpdate(vehicle.liveState)];
  }

  return vehicle;
}

export async function updateVehicle(id, userId, role, data) {
  await getVehicle(id, userId, role);
  return prisma.vehicle.update({ where: { id }, data });
}

export async function deleteVehicle(id, userId, role) {
  await getVehicle(id, userId, role);
  await cacheDel(`obd:latest:${id}`);
  return prisma.vehicle.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
