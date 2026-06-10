import prisma from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import * as tripService from '../services/tripService.js';

async function verifyVehicle(vehicleId, userId, role) {
  const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, deletedAt: null } });
  if (!v) throw new AppError('Vehicle not found', 404);
  if (role !== 'admin' && v.userId !== userId) throw new AppError('Access denied', 403);
  return v;
}

export async function startTrip(req, res, next) {
  try {
    const trip = await tripService.startTrip(req.user.id, req.user.role, req.body);
    res.status(201).json({ success: true, data: trip });
  } catch (err) {
    next(err);
  }
}

export async function endTrip(req, res, next) {
  try {
    const trip = await tripService.endTrip(req.user.id, req.user.role, req.body);
    res.json({ success: true, data: trip });
  } catch (err) {
    next(err);
  }
}

export async function getTrips(req, res, next) {
  try {
    const trips = await tripService.getTrips(req.params.vehicleId, req.user.id, req.user.role);
    res.json({ success: true, data: trips });
  } catch (err) {
    next(err);
  }
}

export async function updateGps(req, res, next) {
  try {
    const io = req.app.get('io');
    const point = await tripService.updateGps(req.user.id, req.user.role, req.body, io);
    res.json({ success: true, data: point });
  } catch (err) {
    next(err);
  }
}

export async function getGpsHistory(req, res, next) {
  try {
    const history = await tripService.getGpsHistory(req.params.tripId, req.user.id, req.user.role);
    res.json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
}

export async function createFuel(req, res, next) {
  try {
    await verifyVehicle(req.body.vehicleId, req.user.id, req.user.role);
    const log = await prisma.fuelLog.create({ data: req.body });
    res.status(201).json({ success: true, data: log });
  } catch (err) {
    next(err);
  }
}

export async function getFuel(req, res, next) {
  try {
    await verifyVehicle(req.params.vehicleId, req.user.id, req.user.role);
    const logs = await prisma.fuelLog.findMany({
      where: { vehicleId: req.params.vehicleId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
}

export async function createMaintenance(req, res, next) {
  try {
    await verifyVehicle(req.body.vehicleId, req.user.id, req.user.role);
    const log = await prisma.maintenanceLog.create({ data: req.body });
    res.status(201).json({ success: true, data: log });
  } catch (err) {
    next(err);
  }
}

export async function getMaintenance(req, res, next) {
  try {
    await verifyVehicle(req.params.vehicleId, req.user.id, req.user.role);
    const logs = await prisma.maintenanceLog.findMany({
      where: { vehicleId: req.params.vehicleId },
      orderBy: { dueDate: 'asc' },
    });
    res.json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
}

export async function updateMaintenance(req, res, next) {
  try {
    const item = await prisma.maintenanceLog.findUnique({ where: { id: req.params.id } });
    if (!item) throw new AppError('Not found', 404);
    await verifyVehicle(item.vehicleId, req.user.id, req.user.role);
    const updated = await prisma.maintenanceLog.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function getAlerts(req, res, next) {
  try {
    await verifyVehicle(req.params.vehicleId, req.user.id, req.user.role);
    const alerts = await prisma.alert.findMany({
      where: { vehicleId: req.params.vehicleId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: alerts });
  } catch (err) {
    next(err);
  }
}

export async function createAlert(req, res, next) {
  try {
    await verifyVehicle(req.body.vehicleId, req.user.id, req.user.role);
    const alert = await prisma.alert.create({ data: req.body });
    const io = req.app.get('io');
    io?.to(`vehicle:${req.body.vehicleId}`).emit('alert:new', alert);
    res.status(201).json({ success: true, data: alert });
  } catch (err) {
    next(err);
  }
}

export async function markAlertRead(req, res, next) {
  try {
    const alert = await prisma.alert.update({
      where: { id: req.params.id },
      data: { read: true },
    });
    res.json({ success: true, data: alert });
  } catch (err) {
    next(err);
  }
}

export async function getDrivers(req, res, next) {
  try {
    const drivers = await prisma.user.findMany({
      where: { role: { name: { in: ['driver', 'manager'] } }, deletedAt: null },
      select: { id: true, name: true, email: true, role: { select: { name: true } } },
    });
    res.json({ success: true, data: drivers });
  } catch (err) {
    next(err);
  }
}

export async function getWorkOrders(req, res, next) {
  try {
    const where = req.user.role === 'admin'
      ? {}
      : { vehicle: { userId: req.user.id } };
    const orders = await prisma.workOrder.findMany({
      where,
      include: { vehicle: { select: { plateNumber: true, make: true, model: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
}

export async function createWorkOrder(req, res, next) {
  try {
    await verifyVehicle(req.body.vehicleId, req.user.id, req.user.role);
    const order = await prisma.workOrder.create({ data: req.body });
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}

export async function getReports(req, res, next) {
  try {
    const { vehicleId } = req.params;
    const { type } = req.params;
    await verifyVehicle(vehicleId, req.user.id, req.user.role);

    let data;
    switch (type) {
      case 'fuel':
        data = await prisma.fuelLog.findMany({ where: { vehicleId }, orderBy: { createdAt: 'desc' } });
        break;
      case 'trips':
        data = await prisma.tripLog.findMany({ where: { vehicleId }, orderBy: { startTime: 'desc' } });
        break;
      case 'maintenance':
        data = await prisma.maintenanceLog.findMany({ where: { vehicleId } });
        break;
      case 'diagnostics':
        data = {
          live: await prisma.obdLiveData.findMany({ where: { vehicleId }, take: 50, orderBy: { recordedAt: 'desc' } }),
          dtc: await prisma.dtcCode.findMany({ where: { vehicleId }, orderBy: { detectedAt: 'desc' } }),
        };
        break;
      default:
        throw new AppError('Invalid report type', 400);
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function adminStats(req, res, next) {
  try {
    const [users, vehicles, alerts, trips, dtcs] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.vehicle.count({ where: { deletedAt: null } }),
      prisma.alert.count({ where: { read: false } }),
      prisma.tripLog.count(),
      prisma.dtcCode.count({ where: { active: true } }),
    ]);
    res.json({
      success: true,
      data: { users, vehicles, alerts, trips, activeDtcs: dtcs },
    });
  } catch (err) {
    next(err);
  }
}

export async function adminUsers(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      include: { role: true },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        role: { select: { name: true } },
      },
    });
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
}
