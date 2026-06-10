import prisma from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { parseDtcResponse } from '../utils/dtcDecoder.js';
import { createDtcAlerts } from '../services/alertEngine.js';

export async function readDtc(req, res, next) {
  try {
    const { vehicleId, rawResponse, codes: providedCodes, status: dtcStatus } = req.body;
    if (!vehicleId) throw new AppError('vehicleId required', 400, 'VALIDATION_ERROR');
    await assertVehicle(req, vehicleId);

    const codes = providedCodes?.length
      ? providedCodes
      : rawResponse
        ? parseDtcResponse(rawResponse)
        : [];

    const io = req.app.get('io');
    await createDtcAlerts(vehicleId, codes, io, {
      status: dtcStatus === 'PENDING' ? 'PENDING' : 'CONFIRMED',
    });

    const active = await prisma.dtcCode.findMany({
      where: { vehicleId, active: true },
      orderBy: { detectedAt: 'desc' },
    });

    if (io) {
      for (const code of codes) {
        io.to(`vehicle:${vehicleId}`).emit('vehicle:dtcDetected', { vehicleId, code });
      }
    }

    res.json({ success: true, data: { codes, active } });
  } catch (err) {
    next(err);
  }
}

export async function clearDtc(req, res, next) {
  try {
    const { vehicleId } = req.body;
    if (!vehicleId) throw new AppError('vehicleId required', 400, 'VALIDATION_ERROR');
    await assertVehicle(req, vehicleId);

    await prisma.dtcCode.updateMany({
      where: { vehicleId, active: true },
      data: { active: false, clearedAt: new Date() },
    });

    res.json({ success: true, message: 'DTC codes cleared' });
  } catch (err) {
    next(err);
  }
}

export async function getActive(req, res, next) {
  try {
    const { vehicleId } = req.params;
    await assertVehicle(req, vehicleId);
    const codes = await prisma.dtcCode.findMany({
      where: { vehicleId, active: true },
      orderBy: { detectedAt: 'desc' },
    });
    res.json({ success: true, data: codes });
  } catch (err) {
    next(err);
  }
}

export async function getHistory(req, res, next) {
  try {
    const { vehicleId } = req.params;
    await assertVehicle(req, vehicleId);
    const codes = await prisma.dtcCode.findMany({
      where: { vehicleId },
      orderBy: { detectedAt: 'desc' },
      take: 100,
    });
    res.json({ success: true, data: codes });
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
