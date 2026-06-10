import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { provisionDevice, listCompanyDevices } from '../../services/deviceProvisioningService.js';
import prisma from '../../utils/prisma.js';
import { AppError } from '../../middleware/errorHandler.js';

const router = Router();

router.use(authenticate);

function requireManager(req, res, next) {
  const role = req.user?.role?.name;
  if (!['ADMIN', 'MANAGER'].includes(role)) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  next();
}

async function assertVehicleAccess(req, vehicleId) {
  const where = {
    id: vehicleId,
    deletedAt: null,
    ...(req.user.role.name !== 'ADMIN' ? { userId: req.user.id } : {}),
  };
  const vehicle = await prisma.vehicle.findFirst({ where, include: { telematicsDevice: true } });
  if (!vehicle) throw new AppError('Vehicle not found', 404, 'NOT_FOUND');
  return vehicle;
}

router.post('/provision', requireManager, async (req, res, next) => {
  try {
    const { vehicleId, deviceType } = req.body;
    if (!vehicleId) {
      return res.status(400).json({ success: false, error: 'vehicleId required' });
    }

    const result = await provisionDevice({
      vehicleId,
      companyId: req.user.companyId,
      deviceType: deviceType || 'MOBILE_APP',
      userId: req.user.id,
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/** Mobile app: provision MQTT device for a vehicle the user owns (or admin). */
router.post('/provision-mobile', async (req, res, next) => {
  try {
    const { vehicleId, deviceType } = req.body;
    if (!vehicleId) {
      return res.status(400).json({ success: false, error: 'vehicleId required' });
    }

    const vehicle = await assertVehicleAccess(req, vehicleId);
    if (vehicle.telematicsDevice) {
      const company = await prisma.company.findUnique({ where: { id: vehicle.companyId } });
      return res.json({
        success: true,
        data: {
          alreadyProvisioned: true,
          device: {
            id: vehicle.telematicsDevice.id,
            deviceUid: vehicle.telematicsDevice.deviceUid,
            mqttClientId: vehicle.telematicsDevice.mqttClientId,
            status: vehicle.telematicsDevice.status,
            vehicleId,
          },
          mqtt: {
            tenantId: company?.slug ?? 'default',
            brokerUrl: process.env.MQTT_PUBLIC_URL || process.env.MQTT_URL || 'mqtt://localhost:1883',
          },
        },
      });
    }

    const result = await provisionDevice({
      vehicleId,
      companyId: vehicle.companyId || req.user.companyId,
      deviceType: deviceType || 'MOBILE_APP',
      userId: req.user.id,
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        ...result,
        mqtt: {
          ...result.mqtt,
          brokerUrl: process.env.MQTT_PUBLIC_URL || process.env.MQTT_URL || 'mqtt://localhost:1883',
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireManager, async (req, res, next) => {
  try {
    const companyId = req.user.companyId || '00000000-0000-0000-0000-000000000010';
    const devices = await listCompanyDevices(companyId);
    res.json({ success: true, data: devices });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireManager, async (req, res, next) => {
  try {
    const device = await prisma.telematicsDevice.findUnique({
      where: { id: req.params.id },
      include: {
        vehicle: { select: { id: true, plateNumber: true, make: true, model: true } },
        company: { select: { id: true, slug: true, name: true } },
      },
    });
    if (!device) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: device });
  } catch (err) {
    next(err);
  }
});

export default router;
