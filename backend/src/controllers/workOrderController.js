import prisma from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export async function list(req, res, next) {
  try {
    const { vehicleId, status, page = 1, limit = 20 } = req.query;
    const vehicleWhere =
      req.user.role.name === 'ADMIN' ? { deletedAt: null } : { userId: req.userId, deletedAt: null };
    const vehicles = await prisma.vehicle.findMany({ where: vehicleWhere, select: { id: true } });
    const ids = vehicles.map((v) => v.id);

    const where = {
      vehicleId: vehicleId ? vehicleId : { in: ids },
      ...(status && { status }),
    };
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [orders, total] = await Promise.all([
      prisma.workOrder.findMany({
        where,
        include: { vehicle: { select: { make: true, model: true, plateNumber: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit, 10),
      }),
      prisma.workOrder.count({ where }),
    ]);
    res.json({ success: true, data: orders, meta: { total } });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { vehicleId, description, status, assignedTo, cost } = req.body;
    if (!vehicleId || !description) {
      throw new AppError('vehicleId and description required', 400, 'VALIDATION_ERROR');
    }
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        deletedAt: null,
        ...(req.user.role.name !== 'ADMIN' ? { userId: req.userId } : {}),
      },
    });
    if (!vehicle) throw new AppError('Vehicle not found', 404, 'NOT_FOUND');

    const order = await prisma.workOrder.create({
      data: { vehicleId, description, status, assignedTo, cost: cost != null ? parseFloat(cost) : null },
    });
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const order = await prisma.workOrder.findUnique({
      where: { id: req.params.id },
      include: { vehicle: true },
    });
    if (!order) throw new AppError('Not found', 404, 'NOT_FOUND');
    if (req.user.role.name !== 'ADMIN' && order.vehicle.userId !== req.userId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    const { description, status, assignedTo, cost } = req.body;
    const updated = await prisma.workOrder.update({
      where: { id: req.params.id },
      data: {
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(assignedTo !== undefined && { assignedTo }),
        ...(cost !== undefined && { cost: parseFloat(cost) }),
      },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}
