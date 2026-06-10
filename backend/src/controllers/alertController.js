import prisma from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export async function list(req, res, next) {
  try {
    const { vehicleId } = req.params;
    const { unreadOnly, page = 1, limit = 50 } = req.query;
    await assertVehicle(req, vehicleId);
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const where = {
      vehicleId,
      ...(unreadOnly === 'true' ? { read: false } : {}),
    };
    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: parseInt(limit, 10) }),
      prisma.alert.count({ where }),
    ]);
    res.json({ success: true, data: alerts, meta: { total } });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { vehicleId, alertType, message, severity } = req.body;
    if (!vehicleId || !message) {
      throw new AppError('vehicleId and message required', 400, 'VALIDATION_ERROR');
    }
    await assertVehicle(req, vehicleId);
    const alert = await prisma.alert.create({
      data: { vehicleId, alertType: alertType || 'CUSTOM', message, severity: severity || 'MEDIUM' },
    });
    const io = req.app.get('io');
    if (io) io.to(`vehicle:${vehicleId}`).emit('alert:new', alert);
    res.status(201).json({ success: true, data: alert });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req, res, next) {
  try {
    const alert = await prisma.alert.findUnique({
      where: { id: req.params.id },
      include: { vehicle: true },
    });
    if (!alert) throw new AppError('Not found', 404, 'NOT_FOUND');
    if (req.user.role.name !== 'ADMIN' && alert.vehicle.userId !== req.userId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    const updated = await prisma.alert.update({
      where: { id: req.params.id },
      data: { read: true },
    });
    res.json({ success: true, data: updated });
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
