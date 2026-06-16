import prisma from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export async function fuelReport(req, res, next) {
  try {
    const { vehicleId } = req.params;
    await assertVehicle(req, vehicleId);
    const logs = await prisma.fuelLog.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
    });
    const totalLiters = logs.reduce((s, l) => s + l.liters, 0);
    const totalCost = logs.reduce((s, l) => s + (l.cost || 0), 0);
    res.json({
      success: true,
      data: { logs, summary: { totalLiters, totalCost, entries: logs.length } },
    });
  } catch (err) {
    next(err);
  }
}

export async function tripsReport(req, res, next) {
  try {
    const { vehicleId } = req.params;
    await assertVehicle(req, vehicleId);
    const trips = await prisma.tripLog.findMany({
      where: { vehicleId, endTime: { not: null } },
      orderBy: { startTime: 'desc' },
      take: 100,
    });
    const totalDistance = trips.reduce((s, t) => s + t.distance, 0);
    const avgSpeed =
      trips.filter((t) => t.avgSpeed).reduce((s, t) => s + t.avgSpeed, 0) /
        (trips.filter((t) => t.avgSpeed).length || 1);
    res.json({
      success: true,
      data: { trips, summary: { totalDistance, avgSpeed, tripCount: trips.length } },
    });
  } catch (err) {
    next(err);
  }
}

export async function maintenanceReport(req, res, next) {
  try {
    const { vehicleId } = req.params;
    await assertVehicle(req, vehicleId);
    const [pending, completed] = await Promise.all([
      prisma.maintenanceLog.findMany({ where: { vehicleId, completed: false } }),
      prisma.maintenanceLog.findMany({
        where: { vehicleId, completed: true },
        orderBy: { completedAt: 'desc' },
        take: 20,
      }),
    ]);
    res.json({ success: true, data: { pending, completed } });
  } catch (err) {
    next(err);
  }
}

export async function diagnosticsReport(req, res, next) {
  try {
    const { vehicleId } = req.params;
    await assertVehicle(req, vehicleId);
    const [dtc, liveSamples, alerts] = await Promise.all([
      prisma.dtcCode.findMany({ where: { vehicleId }, orderBy: { detectedAt: 'desc' }, take: 50 }),
      prisma.obdLiveData.findMany({
        where: { vehicleId },
        orderBy: { recordedAt: 'desc' },
        take: 200,
      }),
      prisma.alert.findMany({
        where: { vehicleId, alertType: { in: ['DTC_DETECTED', 'HIGH_RPM', 'OVERHEAT', 'OVERSPEED'] } },
        take: 50,
      }),
    ]);
    res.json({ success: true, data: { dtc, liveSamples, alerts } });
  } catch (err) {
    next(err);
  }
}

export async function dashboardStats(req, res, next) {
  try {
    const vehicleWhere =
      req.user.role.name === 'ADMIN' ? { deletedAt: null } : { userId: req.userId, deletedAt: null };
    const vehicles = await prisma.vehicle.findMany({
      where: vehicleWhere,
      select: { id: true, telemetryOnline: true, lastObdAt: true },
    });
    const ids = vehicles.map((v) => v.id);
    const now = Date.now();
    const thirtySecondsAgo = new Date(now - 30_000);

    // Use vehicle_live_state for KPIs
    const liveStates = await prisma.vehicleLiveState.findMany({
      where: { vehicleId: { in: ids } },
    });

    const realLiveStates = liveStates.filter((s) => s.telemetrySource === 'REAL');
    const connectedVehicles = liveStates.filter(
      (s) => new Date(s.lastUpdate).getTime() > now - 120_000
    ).length;
    const onlineVehicles = realLiveStates.filter(
      (s) => new Date(s.lastUpdate).getTime() > now - 30_000
    ).length;
    const movingVehicles = realLiveStates.filter((s) => s.vehicleStatus === 'MOVING').length;
    const vehicleCount = vehicles.length;
    const activeTrips = await prisma.tripLog.count({
      where: { vehicleId: { in: ids }, endTime: null },
    });
    const maintenanceAlerts = await prisma.maintenanceLog.count({
      where: {
        vehicleId: { in: ids },
        completed: false,
        OR: [{ dueDate: { lte: new Date() } }, { dueDate: { lte: new Date(now + 7 * 86400000) } }],
      },
    });
    const fleetUtilization = vehicleCount > 0 ? Math.round((movingVehicles / vehicleCount) * 100) : 0;
    const avgFuel = liveStates.length
      ? parseFloat((liveStates.reduce((s, l) => s + l.fuelLevel, 0) / liveStates.length).toFixed(1))
      : 0;
    const avgRpm = liveStates.length
      ? parseFloat((liveStates.reduce((s, l) => s + l.rpm, 0) / liveStates.length).toFixed(0))
      : 0;

    const thirtyDaysAgo = new Date(now - 30 * 86400000);
    const sevenDaysAgo = new Date(now - 7 * 86400000);

    const [
      activeDtc,
      pendingDtc,
      unreadAlerts,
      recentTrips,
      maintenanceDue,
      fuelSummary,
      driverEvents,
      recentAlerts,
    ] = await Promise.all([
      prisma.dtcCode.count({ where: { vehicleId: { in: ids }, active: true } }),
      prisma.dtcCode.count({
        where: { vehicleId: { in: ids }, active: true, status: 'PENDING' },
      }),
      prisma.alert.count({ where: { vehicleId: { in: ids }, read: false } }),
      prisma.tripLog.count({
        where: { vehicleId: { in: ids }, startTime: { gte: sevenDaysAgo } },
      }),
      prisma.maintenanceLog.count({
        where: {
          vehicleId: { in: ids },
          completed: false,
          OR: [{ dueDate: { lte: new Date() } }, { dueDate: { lte: new Date(now + 7 * 86400000) } }],
        },
      }),
      prisma.fuelLog.aggregate({
        where: { vehicleId: { in: ids }, createdAt: { gte: thirtyDaysAgo } },
        _sum: { liters: true, cost: true },
      }),
      prisma.driverBehaviorEvent.count({
        where: { vehicleId: { in: ids }, recordedAt: { gte: sevenDaysAgo } },
      }),
      prisma.alert.findMany({
        where: { vehicleId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);

    res.json({
      success: true,
      data: {
        vehicleCount,
        connectedVehicles,
        onlineVehicles,
        movingVehicles,
        activeTrips,
        fleetUtilization,
        avgFuel,
        avgRpm,
        activeDtc,
        pendingDtc,
        unreadAlerts,
        maintenanceAlerts,
        recentTrips,
        maintenanceDue,
        fuelLiters30d: fuelSummary._sum.liters ?? 0,
        fuelCost30d: fuelSummary._sum.cost ?? 0,
        driverEvents7d: driverEvents,
        recentAlerts,
      },
    });
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

export async function behaviorEventsReport(req, res, next) {
  try {
    const vehicleWhere =
      req.user.role.name === 'ADMIN' ? { deletedAt: null } : { userId: req.userId, deletedAt: null };
    const vehicles = await prisma.vehicle.findMany({ where: vehicleWhere, select: { id: true } });
    const ids = vehicles.map((v) => v.id);
    const limit = parseInt(req.query.limit ?? '100', 10);
    const events = await prisma.driverBehaviorEvent.findMany({
      where: { vehicleId: { in: ids } },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });
    res.json({ success: true, data: events });
  } catch (err) {
    next(err);
  }
}
