import { Router } from 'express';
import prisma from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/roles.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/stats', async (_req, res, next) => {
  try {
    const [users, vehicles, activeDtc, openWorkOrders] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.vehicle.count({ where: { deletedAt: null } }),
      prisma.dtcCode.count({ where: { active: true } }),
      prisma.workOrder.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    ]);
    res.json({ success: true, data: { users, vehicles, activeDtc, openWorkOrders } });
  } catch (err) {
    next(err);
  }
});

router.get('/users', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      include: { role: true, _count: { select: { vehicles: true } } },
    });
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
});

router.patch('/users/:id/role', async (req, res, next) => {
  try {
    const { roleName } = req.body;
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new AppError('Invalid role', 400, 'VALIDATION_ERROR');
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { roleId: role.id },
      include: { role: true },
    });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

export default router;
