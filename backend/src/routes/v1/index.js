import { Router } from 'express';
import deviceRoutes from './deviceRoutes.js';
import prisma from '../../utils/prisma.js';
import { authenticate } from '../../middleware/auth.js';
import { enrichVehicleList } from '../../services/vehicleTelemetryStatus.js';

const router = Router();

router.use('/devices', deviceRoutes);

router.get('/fleet/map', authenticate, async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const where = {
      deletedAt: null,
      OR: [{ userId: req.user.id }, ...(companyId ? [{ companyId }] : [])],
    };

    const vehicles = await prisma.vehicle.findMany({
      where,
      include: {
        telematicsDevice: {
          select: {
            deviceUid: true,
            status: true,
            lastHeartbeatAt: true,
            lastSeenAt: true,
          },
        },
        gpsLocation: true,
      },
      take: 500,
    });

    res.json({ success: true, data: enrichVehicleList(vehicles) });
  } catch (err) {
    next(err);
  }
});

export default router;
