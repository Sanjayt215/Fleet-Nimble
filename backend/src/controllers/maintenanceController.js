import prisma from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export async function create(req, res, next) {
  try {
    const { vehicleId, serviceType, dueKm, dueDate, notes } = req.body;
    if (!vehicleId || !serviceType) {
      throw new AppError('vehicleId and serviceType required', 400, 'VALIDATION_ERROR');
    }
    await assertVehicle(req, vehicleId);

    const log = await prisma.maintenanceLog.create({
      data: {
        vehicleId,
        serviceType,
        dueKm: dueKm != null ? parseFloat(dueKm) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        notes,
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
    await assertVehicle(req, vehicleId);
    const logs = await prisma.maintenanceLog.findMany({
      where: { vehicleId },
      orderBy: [{ completed: 'asc' }, { dueDate: 'asc' }],
    });
    res.json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const log = await prisma.maintenanceLog.findUnique({
      where: { id: req.params.id },
      include: { vehicle: true },
    });
    if (!log) throw new AppError('Not found', 404, 'NOT_FOUND');
    if (req.user.role.name !== 'ADMIN' && log.vehicle.userId !== req.userId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    const { completed, notes, serviceType, dueKm, dueDate } = req.body;
    const updated = await prisma.maintenanceLog.update({
      where: { id: req.params.id },
      data: {
        ...(completed !== undefined && {
          completed: Boolean(completed),
          completedAt: completed ? new Date() : null,
        }),
        ...(notes !== undefined && { notes }),
        ...(serviceType !== undefined && { serviceType }),
        ...(dueKm !== undefined && { dueKm: parseFloat(dueKm) }),
        ...(dueDate !== undefined && { dueDate: new Date(dueDate) }),
      },
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
