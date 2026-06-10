import prisma from '../utils/prisma.js';
import { cacheGet, cacheSet } from '../utils/redis.js';
import { parseLiveDataPayload } from '../utils/telemetryParser.js';
import { parseDtcResponse, getDtcDescription, getDtcSeverity } from '../utils/dtcDecoder.js';
import { evaluateTelemetry } from './alertEngine.js';
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

export async function saveLiveData(userId, role, payload, io) {
  await verifyVehicleAccess(payload.vehicleId, userId, role);
  const data = parseLiveDataPayload(payload);

  const record = await prisma.obdLiveData.create({
    data: { vehicleId: payload.vehicleId, ...data },
  });

  await cacheSet(`obd:latest:${payload.vehicleId}`, record, 60);
  await evaluateTelemetry(payload.vehicleId, data, io);

  if (io) {
    io.to(`vehicle:${payload.vehicleId}`).emit('live:update', record);
  }

  return record;
}

export async function getLatest(vehicleId, userId, role) {
  await verifyVehicleAccess(vehicleId, userId, role);
  const cached = await cacheGet(`obd:latest:${vehicleId}`);
  if (cached) return cached;

  return prisma.obdLiveData.findFirst({
    where: { vehicleId },
    orderBy: { recordedAt: 'desc' },
  });
}

export async function getHistory(vehicleId, userId, role, limit = 100) {
  await verifyVehicleAccess(vehicleId, userId, role);
  return prisma.obdLiveData.findMany({
    where: { vehicleId },
    orderBy: { recordedAt: 'desc' },
    take: limit,
  });
}

export async function saveDtcCodes(userId, role, { vehicleId, rawResponse, codes }, io) {
  await verifyVehicleAccess(vehicleId, userId, role);
  const parsedCodes = codes || parseDtcResponse(rawResponse);
  const saved = [];

  for (const code of parsedCodes) {
    const existing = await prisma.dtcCode.findFirst({
      where: { vehicleId, code, active: true },
    });
    if (!existing) {
      const dtc = await prisma.dtcCode.create({
        data: {
          vehicleId,
          code,
          description: getDtcDescription(code),
          severity: getDtcSeverity(code),
          active: true,
        },
      });
      saved.push(dtc);
      if (io) {
        io.to(`vehicle:${vehicleId}`).emit('dtc:new', dtc);
      }
    }
  }
  return saved;
}

export async function clearDtc(vehicleId, userId, role) {
  await verifyVehicleAccess(vehicleId, userId, role);
  await prisma.dtcCode.updateMany({
    where: { vehicleId, active: true },
    data: { active: false, clearedAt: new Date() },
  });
  return { success: true };
}

export async function getDtc(vehicleId, userId, role) {
  await verifyVehicleAccess(vehicleId, userId, role);
  return prisma.dtcCode.findMany({
    where: { vehicleId, active: true },
    orderBy: { detectedAt: 'desc' },
  });
}

export async function getDtcHistory(vehicleId, userId, role) {
  await verifyVehicleAccess(vehicleId, userId, role);
  return prisma.dtcCode.findMany({
    where: { vehicleId },
    orderBy: { detectedAt: 'desc' },
    take: 200,
  });
}
