import prisma from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { normalizeTelemetry } from '../services/telemetryParser.js';
import { setLatestObdCached } from '../services/cacheService.js';

// OBD BACKUP — paginated raw backup records
export async function getObdBackup(req, res, next) {
  try {
    const { vehicleId } = req.params;
    const { from, to, limit = 50, page = 1 } = req.query;
    await assertVehicle(req, vehicleId);

    const where = {
      vehicleId,
      ...(from || to
        ? {
            createdAt: {
              ...(from && { gte: new Date(from) }),
              ...(to && { lte: new Date(to) }),
            },
          }
        : {}),
    };

    const take = parseInt(limit, 10);
    const skip = (parseInt(page, 10) - 1) * take;
    const [records, total] = await Promise.all([
      prisma.obdRawBackup.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.obdRawBackup.count({ where }),
    ]);

    res.json({ success: true, data: records, meta: { total, page: parseInt(page, 10), limit: take } });
  } catch (err) {
    next(err);
  }
}

// OBD BACKUP — bulk offline sync upload
export async function bulkObdUpload(req, res, next) {
  try {
    const { vehicleId, readings } = req.body;
    if (!vehicleId || !Array.isArray(readings)) {
      throw new AppError('vehicleId and readings array required', 400, 'VALIDATION_ERROR');
    }
    await assertVehicle(req, vehicleId);

    let inserted = 0;
    let skipped = 0;

    await prisma.$transaction(async (tx) => {
      for (const raw of readings) {
        try {
          const telemetry = normalizeTelemetry({ vehicleId, ...raw });
          const record = await tx.obdLiveData.create({
            data: { vehicleId, ...telemetry },
          });
          await tx.obdRawBackup.create({
            data: {
              vehicleId,
              rawPayload: { vehicleId, ...raw },
              source: raw.source ?? 'android',
              processedAt: new Date(),
            },
          });
          if (telemetry.latitude != null && telemetry.longitude != null) {
            await tx.gpsLocation.upsert({
              where: { vehicleId },
              update: {
                lat: telemetry.latitude,
                lng: telemetry.longitude,
                altitude: telemetry.altitude,
                accuracy: telemetry.gpsAccuracy,
                heading: telemetry.heading,
                speed: telemetry.gpsSpeed,
                recordedAt: new Date(),
              },
              create: {
                vehicleId,
                lat: telemetry.latitude,
                lng: telemetry.longitude,
                altitude: telemetry.altitude,
                accuracy: telemetry.gpsAccuracy,
                heading: telemetry.heading,
                speed: telemetry.gpsSpeed,
              },
            });
          }
          if (inserted === readings.length - 1) {
            await setLatestObdCached(vehicleId, record);
          }
          inserted++;
        } catch {
          skipped++;
        }
      }
    });

    res.json({ success: true, data: { inserted, skipped } });
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
