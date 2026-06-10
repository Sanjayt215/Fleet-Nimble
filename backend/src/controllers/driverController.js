import prisma from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export async function listScores(req, res, next) {
  try {
    const { vehicleId } = req.query;
    const vehicleWhere =
      req.user.role.name === 'ADMIN'
        ? { deletedAt: null, ...(vehicleId && { id: vehicleId }) }
        : { userId: req.userId, deletedAt: null, ...(vehicleId && { id: vehicleId }) };

    const vehicles = await prisma.vehicle.findMany({
      where: vehicleWhere,
      select: { id: true, make: true, model: true, plateNumber: true },
    });
    const ids = vehicles.map((v) => v.id);

    const scores = await prisma.driverScore.findMany({
      where: { vehicleId: { in: ids } },
      orderBy: { periodEnd: 'desc' },
      take: 50,
    });

    res.json({ success: true, data: { vehicles, scores } });
  } catch (err) {
    next(err);
  }
}

export async function upsertScore(req, res, next) {
  try {
    const { vehicleId, harshBraking, harshAcceleration, overspeedEvents, idleTime, score } = req.body;
    if (!vehicleId) throw new AppError('vehicleId required', 400, 'VALIDATION_ERROR');

    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        deletedAt: null,
        ...(req.user.role.name !== 'ADMIN' ? { userId: req.userId } : {}),
      },
    });
    if (!vehicle) throw new AppError('Vehicle not found', 404, 'NOT_FOUND');

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const record = await prisma.driverScore.create({
      data: {
        vehicleId,
        harshBraking: harshBraking ?? 0,
        harshAcceleration: harshAcceleration ?? 0,
        overspeedEvents: overspeedEvents ?? 0,
        idleTime: idleTime ?? 0,
        score: score ?? 100,
        periodStart,
        periodEnd,
      },
    });
    res.status(201).json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
}

export async function listUsers(req, res, next) {
  try {
    if (req.user.role.name !== 'ADMIN' && req.user.role.name !== 'MANAGER') {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      include: { role: true },
    });
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
}
