import prisma from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { getOrCreateTwin } from '../services/digitalTwinService.js';

/**
 * GET /twin/:vehicleId — return live state for a single vehicle
 */
export async function getTwin(req, res, next) {
  try {
    const { vehicleId } = req.params;
    // Access check
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        deletedAt: null,
        ...(req.user.role.name !== 'ADMIN' ? { userId: req.userId } : {}),
      },
    });
    if (!vehicle) throw new AppError('Vehicle not found', 404, 'NOT_FOUND');

    const twin = await getOrCreateTwin(vehicleId);
    res.json({ success: true, data: twin });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /twin — return live state for all user vehicles (fleet view)
 */
export async function getAllTwins(req, res, next) {
  try {
    const where = {
      deletedAt: null,
      ...(req.user.role.name !== 'ADMIN' ? { userId: req.userId } : {}),
    };

    const vehicles = await prisma.vehicle.findMany({
      where,
      select: {
        id: true, make: true, model: true, plateNumber: true, vin: true,
        liveState: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Backfill any missing twins inline
    const results = await Promise.all(
      vehicles.map(async (v) => {
        const liveState = v.liveState || (await getOrCreateTwin(v.id));
        return { ...v, liveState };
      })
    );

    // Fleet KPIs
    const now = Date.now();
    const online = results.filter((v) => now - new Date(v.liveState?.lastUpdate).getTime() < 30_000);
    const moving = results.filter((v) => v.liveState?.vehicleStatus === 'MOVING');
    const avgFuel = results.reduce((s, v) => s + (v.liveState?.fuelLevel ?? 0), 0) / (results.length || 1);
    const avgRpm = results.filter((v) => v.liveState?.rpm > 0).reduce((s, v) => s + (v.liveState?.rpm ?? 0), 0) / (moving.length || 1);

    res.json({
      success: true,
      data: results,
      kpis: {
        total: results.length,
        online: online.length,
        moving: moving.length,
        utilization: results.length ? parseFloat(((moving.length / results.length) * 100).toFixed(1)) : 0,
        avgFuel: parseFloat(avgFuel.toFixed(1)),
        avgRpm: parseFloat(avgRpm.toFixed(0)),
      },
    });
  } catch (err) {
    next(err);
  }
}
