import { Router } from 'express';
import prisma from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/roles.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();
router.use(authenticate, requireAdmin);

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  roleId: true,
  companyId: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true } },
  _count: { select: { vehicles: true } },
};

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
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
});

router.patch('/users/:id/role', async (req, res, next) => {
  try {
    const { roleName } = req.body;
    if (req.params.id === req.user.id) {
      throw new AppError('Admins cannot change their own role', 400, 'VALIDATION_ERROR');
    }
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new AppError('Invalid role', 400, 'VALIDATION_ERROR');
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { roleId: role.id },
      select: USER_SELECT,
    });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

export default router;
