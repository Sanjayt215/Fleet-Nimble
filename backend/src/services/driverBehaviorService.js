import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

/**
 * Detect harsh acceleration based on telemetry change rate.
 * Triggered when:
 * - Speed increase > 10 km/h in 2 seconds (5 km/h/s)
 * - RPM increase > 500 in 2 seconds
 */
export async function detectHarshAcceleration(vehicleId, currentTelemetry, previousTelemetry) {
  if (!previousTelemetry || !currentTelemetry) return null;

  const timeInterval = 2; // seconds
  const speedDelta = (currentTelemetry.speed ?? 0) - (previousTelemetry.speed ?? 0);
  const rpmDelta = (currentTelemetry.rpm ?? 0) - (previousTelemetry.rpm ?? 0);

  const speedAccel = speedDelta / timeInterval; // km/h per second
  const rpmAccel = rpmDelta / timeInterval;

  // Harsh if: speed increases > 5 km/h/s OR RPM increases > 250/s
  if (speedAccel > 5 || rpmAccel > 250) {
    return {
      type: 'HARSH_ACCEL',
      severity: speedAccel > 10 ? 'CRITICAL' : 'HIGH',
      metadata: {
        speedAccel: speedAccel.toFixed(2),
        rpmAccel: rpmAccel.toFixed(0),
        currentSpeed: currentTelemetry.speed,
        currentRpm: currentTelemetry.rpm,
      },
      latitude: currentTelemetry.latitude,
      longitude: currentTelemetry.longitude,
    };
  }

  return null;
}

/**
 * Detect harsh braking based on speed drop rate.
 * Triggered when:
 * - Speed decreases > 10 km/h in 2 seconds (5 km/h/s)
 */
export async function detectHarshBraking(vehicleId, currentTelemetry, previousTelemetry) {
  if (!previousTelemetry || !currentTelemetry) return null;

  const timeInterval = 2; // seconds
  const speedDelta = (previousTelemetry.speed ?? 0) - (currentTelemetry.speed ?? 0);

  const speedDecel = speedDelta / timeInterval; // km/h per second

  // Harsh if: speed decreases > 5 km/h/s
  if (speedDecel > 5) {
    return {
      type: 'HARSH_BRAKE',
      severity: speedDecel > 10 ? 'CRITICAL' : 'HIGH',
      metadata: {
        speedDecel: speedDecel.toFixed(2),
        previousSpeed: previousTelemetry.speed,
        currentSpeed: currentTelemetry.speed,
      },
      latitude: currentTelemetry.latitude,
      longitude: currentTelemetry.longitude,
    };
  }

  return null;
}

/**
 * Detect excessive idle (vehicle running but not moving for > 5 minutes).
 */
export async function detectExcessiveIdle(vehicleId) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  const events = await prisma.obdLiveData.findMany({
    where: {
      vehicleId,
      recordedAt: { gte: fiveMinutesAgo },
      speed: { equals: 0 },
      rpm: { gt: 0 },
    },
    orderBy: { recordedAt: 'asc' },
  });

  if (events.length >= 150) { // 150 readings = 2-3 min of data
    const oldestEvent = events[0];
    const newestEvent = events[events.length - 1];
    const idleDuration = (newestEvent.recordedAt.getTime() - oldestEvent.recordedAt.getTime()) / 1000 / 60;

    if (idleDuration >= 5) {
      return {
        type: 'IDLE',
        severity: idleDuration > 15 ? 'HIGH' : 'MEDIUM',
        metadata: {
          idleDurationMinutes: Math.round(idleDuration),
          rpmAvg: (events.reduce((sum, e) => sum + (e.rpm ?? 0), 0) / events.length).toFixed(0),
        },
        latitude: newestEvent.latitude,
        longitude: newestEvent.longitude,
      };
    }
  }

  return null;
}

/**
 * Detect speeding (vehicle speed > 110 km/h for more than 30 seconds).
 */
export async function detectSpeeding(vehicleId, currentSpeed) {
  const speedLimit = 110;

  if (currentSpeed < speedLimit) return null;

  const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
  const speeding = await prisma.obdLiveData.count({
    where: {
      vehicleId,
      recordedAt: { gte: thirtySecondsAgo },
      speed: { gte: speedLimit },
    },
  });

  if (speeding >= 15) { // 15 readings = ~30s of data
    return {
      type: 'SPEEDING',
      severity: currentSpeed > 130 ? 'CRITICAL' : 'HIGH',
      metadata: {
        currentSpeed: Math.round(currentSpeed),
        speedLimit,
        excessSpeed: Math.round(currentSpeed - speedLimit),
      },
    };
  }

  return null;
}

/**
 * Process driver behavior events from telemetry.
 * Called after each telemetry ingestion.
 */
export async function processDriverBehavior(vehicleId, telemetry, io) {
  if (!telemetry) return [];

  try {
    // Get previous telemetry for comparison
    const previousTelemetry = await prisma.obdLiveData.findFirst({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
      skip: 1, // Skip most recent (which is the current one)
      take: 1,
    });

    const events = [];

    // Check for harsh acceleration
    const harshAccel = await detectHarshAcceleration(vehicleId, telemetry, previousTelemetry);
    if (harshAccel) events.push(harshAccel);

    // Check for harsh braking
    const harshBrake = await detectHarshBraking(vehicleId, telemetry, previousTelemetry);
    if (harshBrake) events.push(harshBrake);

    // Check for speeding
    const speed = telemetry.speed ?? telemetry.gpsSpeed ?? 0;
    const speeding = await detectSpeeding(vehicleId, speed);
    if (speeding) events.push(speeding);

    // Check for excessive idle
    const idle = await detectExcessiveIdle(vehicleId);
    if (idle) events.push(idle);

    // Create events in database
    for (const event of events) {
      const existing = await prisma.driverBehaviorEvent.findFirst({
        where: {
          vehicleId,
          eventType: event.type,
          recordedAt: { gte: new Date(Date.now() - 60 * 1000) },
        },
      });

      if (!existing) {
        const dbEvent = await prisma.driverBehaviorEvent.create({
          data: {
            vehicleId,
            eventType: event.type,
            severity: event.severity || 'MEDIUM',
            metadata: event.metadata || {},
            latitude: event.latitude,
            longitude: event.longitude,
          },
        });

        // Broadcast event
        if (io) {
          const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { userId: true } });
          if (vehicle?.userId) {
            io.to(`vehicle:${vehicleId}`).emit('behavior:event', {
              vehicleId,
              eventType: event.type,
              severity: event.severity,
              recordedAt: dbEvent.recordedAt,
            });
            io.to(`user:${vehicle.userId}`).emit('behavior:event', {
              vehicleId,
              eventType: event.type,
              severity: event.severity,
              recordedAt: dbEvent.recordedAt,
            });
          }
        }
      }
    }

    return events;
  } catch (error) {
    logger.error('Driver behavior processing failed', { vehicleId, error: error.message });
    return [];
  }
}

/**
 * Update driver score based on behavior events in a period.
 */
export async function updateDriverScore(vehicleId, periodStart, periodEnd) {
  const [harshBraking, harshAcceleration, speeding, idle] = await Promise.all([
    prisma.driverBehaviorEvent.count({
      where: {
        vehicleId,
        eventType: 'HARSH_BRAKE',
        recordedAt: { gte: periodStart, lte: periodEnd },
      },
    }),
    prisma.driverBehaviorEvent.count({
      where: {
        vehicleId,
        eventType: 'HARSH_ACCEL',
        recordedAt: { gte: periodStart, lte: periodEnd },
      },
    }),
    prisma.driverBehaviorEvent.count({
      where: {
        vehicleId,
        eventType: 'SPEEDING',
        recordedAt: { gte: periodStart, lte: periodEnd },
      },
    }),
    prisma.driverBehaviorEvent.count({
      where: {
        vehicleId,
        eventType: 'IDLE',
        recordedAt: { gte: periodStart, lte: periodEnd },
      },
    }),
  ]);

  // Calculate score: start at 100, deduct for each event
  let score = 100;
  score -= harshBraking * 5;
  score -= harshAcceleration * 5;
  score -= speeding * 3;
  score -= idle * 2;
  score = Math.max(0, Math.min(100, score));

  const existing = await prisma.driverScore.findFirst({
    where: {
      vehicleId,
      periodStart: { lte: periodStart },
      periodEnd: { gte: periodEnd },
    },
  });

  if (existing) {
    return prisma.driverScore.update({
      where: { id: existing.id },
      data: {
        harshBraking,
        harshAcceleration,
        overspeedEvents: speeding,
        idleTime: idle,
        score,
      },
    });
  } else {
    return prisma.driverScore.create({
      data: {
        vehicleId,
        harshBraking,
        harshAcceleration,
        overspeedEvents: speeding,
        idleTime: idle,
        score,
        periodStart,
        periodEnd,
      },
    });
  }
}
