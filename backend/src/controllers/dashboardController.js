import prisma from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * GET /api/dashboard/kpis
 * Get key performance indicators for fleet.
 * Includes: online vehicles, moving vehicles, fleet utilization, fuel metrics, driver scores.
 */
export async function getFleetKpis(req, res, next) {
  try {
    const userId = req.user.role.name === 'ADMIN' ? undefined : req.userId;
    const where = {
      deletedAt: null,
      ...(userId ? { userId } : {}),
    };

    // Get all vehicles
    const totalVehicles = await prisma.vehicle.count({ where });

    // Get vehicles with live state
    const vehiclesWithLiveState = await prisma.vehicle.findMany({
      where,
      include: {
        liveState: true,
        alerts: { where: { read: false } },
        dtcCodes: { where: { active: true } },
      },
    });

    // Calculate KPIs
    const onlineVehicles = vehiclesWithLiveState.filter((v) => v.telemetryOnline).length;
    const movingVehicles = vehiclesWithLiveState.filter((v) => v.liveState?.vehicleStatus === 'MOVING').length;
    const idlingVehicles = vehiclesWithLiveState.filter((v) => v.liveState?.vehicleStatus === 'IDLING').length;
    const parkedVehicles = vehiclesWithLiveState.filter((v) => v.liveState?.vehicleStatus === 'PARKED').length;

    // Fuel metrics
    const fuelStates = vehiclesWithLiveState
      .map((v) => v.liveState?.fuelLevel ?? 0)
      .filter((f) => f != null);
    const avgFuelLevel = fuelStates.length > 0 ? fuelStates.reduce((a, b) => a + b) / fuelStates.length : 0;
    const lowFuelVehicles = vehiclesWithLiveState.filter((v) => (v.liveState?.fuelLevel ?? 0) < 25).length;

    // Alerts and issues
    const totalUnreadAlerts = vehiclesWithLiveState.reduce((sum, v) => sum + v.alerts.length, 0);
    const vehiclesWithDtc = vehiclesWithLiveState.filter((v) => v.dtcCodes.length > 0).length;
    const totalActiveDtcs = vehiclesWithLiveState.reduce((sum, v) => sum + v.dtcCodes.length, 0);

    // Temperature warnings (coolant temp > 95°C)
    const overheatingVehicles = vehiclesWithLiveState.filter((v) => (v.liveState?.coolantTemp ?? 0) > 95).length;

    // Battery warnings (voltage < 12V)
    const lowBatteryVehicles = vehiclesWithLiveState.filter((v) => (v.liveState?.batteryVoltage ?? 0) < 12).length;

    // Fleet utilization (moving / total * 100)
    const fleetUtilization = totalVehicles > 0 ? Math.round((movingVehicles / totalVehicles) * 100) : 0;

    // Telemetry source distribution
    const realTelemetryCount = vehiclesWithLiveState.filter((v) => v.liveState?.telemetrySource === 'REAL').length;
    const simulatedTelemetryCount = vehiclesWithLiveState.filter((v) => v.liveState?.telemetrySource === 'SIMULATED').length;

    // Driver scores (last 7 days)
    const driverScores = await prisma.driverScore.findMany({
      where: {
        ...where,
        periodStart: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { score: 'desc' },
      take: 10,
    });
    const avgDriverScore = driverScores.length > 0 ? driverScores.reduce((sum, s) => sum + s.score, 0) / driverScores.length : 0;

    const kpis = {
      fleet: {
        totalVehicles,
        onlineVehicles,
        offlineVehicles: totalVehicles - onlineVehicles,
      },
      activity: {
        movingVehicles,
        idlingVehicles,
        parkedVehicles,
        fleetUtilization: `${fleetUtilization}%`,
      },
      fuel: {
        avgFuelLevel: avgFuelLevel.toFixed(1),
        lowFuelVehicles,
        fuelTrendThisWeek: 'Calculating...',
      },
      health: {
        vehiclesWithDtc,
        totalActiveDtcs,
        overheatingVehicles,
        lowBatteryVehicles,
        unreadAlerts: totalUnreadAlerts,
      },
      telemetry: {
        realTelemetryCount,
        simulatedTelemetryCount,
      },
      drivers: {
        avgDriverScore: avgDriverScore.toFixed(1),
        topDrivers: driverScores.slice(0, 5),
      },
    };

    res.json({ success: true, data: kpis });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/dashboard/vehicle/:vehicleId/kpis
 * Get key performance indicators for a specific vehicle.
 */
export async function getVehicleKpis(req, res, next) {
  try {
    const { vehicleId } = req.params;
    const userId = req.user.role.name === 'ADMIN' ? undefined : req.userId;

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, deletedAt: null },
    });
    if (!vehicle) throw new AppError('Vehicle not found', 404);
    if (userId && vehicle.userId !== userId) throw new AppError('Access denied', 403);

    const [liveState, alerts, dtcs, trips, fuelLogs, driverScores, behaviorEvents] = await Promise.all([
      prisma.vehicleLiveState.findUnique({ where: { vehicleId } }),
      prisma.alert.findMany({ where: { vehicleId, read: false } }),
      prisma.dtcCode.findMany({ where: { vehicleId, active: true } }),
      prisma.tripLog.findMany({
        where: { vehicleId },
        orderBy: { startTime: 'desc' },
        take: 10,
      }),
      prisma.fuelLog.findMany({
        where: { vehicleId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.driverScore.findMany({
        where: { vehicleId },
        orderBy: { periodStart: 'desc' },
        take: 5,
      }),
      prisma.driverBehaviorEvent.findMany({
        where: { vehicleId },
        orderBy: { recordedAt: 'desc' },
        take: 20,
      }),
    ]);

    // Calculate trip metrics
    const thisWeekTrips = trips.filter((t) => t.startTime > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const totalDistanceThisWeek = thisWeekTrips.reduce((sum, t) => sum + (t.distance ?? 0), 0).toFixed(1);
    const totalTripsThisWeek = thisWeekTrips.length;
    const avgTripDistance = totalTripsThisWeek > 0 ? (totalDistanceThisWeek / totalTripsThisWeek).toFixed(1) : 0;

    // Calculate fuel metrics
    const fuelLevelTrend = fuelLogs.slice(0, 2).map((f) => f.liters);
    const fuelConsumptionPerKm = totalDistanceThisWeek > 0 ? ((fuelLevelTrend[0] ?? 0) / totalDistanceThisWeek).toFixed(2) : 0;

    // Driver behavior summary
    const harshBrakingCount = behaviorEvents.filter((e) => e.eventType === 'HARSH_BRAKE').length;
    const harshAccelCount = behaviorEvents.filter((e) => e.eventType === 'HARSH_ACCEL').length;
    const speeding = behaviorEvents.filter((e) => e.eventType === 'SPEEDING').length;

    const kpis = {
      vehicle: {
        id: vehicle.id,
        plateNumber: vehicle.plateNumber,
        make: vehicle.make,
        model: vehicle.model,
        odometer: vehicle.odometer,
      },
      status: {
        telemetryOnline: vehicle.telemetryOnline,
        lastObdAt: vehicle.lastObdAt,
        liveState: liveState
          ? {
              vehicleStatus: liveState.vehicleStatus,
              rpm: liveState.rpm,
              speed: liveState.speed,
              fuelLevel: liveState.fuelLevel.toFixed(1),
              temp: liveState.coolantTemp.toFixed(1),
              battery: liveState.batteryVoltage.toFixed(1),
            }
          : null,
      },
      trips: {
        totalTripsThisWeek,
        totalDistanceThisWeek,
        avgTripDistance,
        activeDtcs: dtcs.length,
      },
      fuel: {
        currentLevel: (liveState?.fuelLevel ?? 0).toFixed(1),
        consumptionPerKm: fuelConsumptionPerKm,
        lastRefuelAt: fuelLogs[0]?.createdAt,
        lastRefuelLiters: fuelLogs[0]?.liters,
      },
      behavior: {
        harshBrakingCount,
        harshAccelCount,
        speedingCount: speeding,
        driverScore: driverScores[0]?.score?.toFixed(1) ?? 'N/A',
      },
      alerts: {
        unreadCount: alerts.length,
        activeDtcCount: dtcs.length,
      },
    };

    res.json({ success: true, data: kpis });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/dashboard/alerts
 * Get summary of all active alerts across the fleet.
 */
export async function getAlertsSummary(req, res, next) {
  try {
    const userId = req.user.role.name === 'ADMIN' ? undefined : req.userId;

    const [unreadCount, bySeverity, byType, recentAlerts] = await Promise.all([
      prisma.alert.count({
        where: {
          read: false,
          vehicle: {
            deletedAt: null,
            ...(userId ? { userId } : {}),
          },
        },
      }),
      prisma.alert.groupBy({
        by: ['severity'],
        where: {
          read: false,
          vehicle: {
            deletedAt: null,
            ...(userId ? { userId } : {}),
          },
        },
        _count: true,
      }),
      prisma.alert.groupBy({
        by: ['alertType'],
        where: {
          read: false,
          vehicle: {
            deletedAt: null,
            ...(userId ? { userId } : {}),
          },
        },
        _count: true,
      }),
      prisma.alert.findMany({
        where: {
          vehicle: {
            deletedAt: null,
            ...(userId ? { userId } : {}),
          },
        },
        include: {
          vehicle: { select: { id: true, plateNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const summary = {
      unreadCount,
      bySeverity: Object.fromEntries(bySeverity.map((s) => [s.severity, s._count])),
      byType: Object.fromEntries(byType.map((t) => [t.alertType, t._count])),
      recentAlerts: recentAlerts.map((a) => ({
        id: a.id,
        vehicleId: a.vehicleId,
        plateNumber: a.vehicle.plateNumber,
        type: a.alertType,
        message: a.message,
        severity: a.severity,
        createdAt: a.createdAt,
        read: a.read,
      })),
    };

    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
}
