import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

/**
 * Calculate fuel consumption rate based on recent telemetry.
 * Returns liters per km.
 */
export async function calculateFuelConsumptionRate(vehicleId) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const telemetry = await prisma.obdLiveData.findMany({
    where: {
      vehicleId,
      recordedAt: { gte: oneHourAgo },
      speed: { gt: 0 }, // Only moving
    },
    orderBy: { recordedAt: 'asc' },
    select: { recordedAt: true, fuelLevel: true, speed: true },
  });

  if (telemetry.length < 2) return null;

  const firstReading = telemetry[0];
  const lastReading = telemetry[telemetry.length - 1];

  const fuelUsed = (firstReading.fuelLevel ?? 0) - (lastReading.fuelLevel ?? 0);
  const timeHours = (lastReading.recordedAt.getTime() - firstReading.recordedAt.getTime()) / (1000 * 60 * 60);

  if (fuelUsed <= 0 || timeHours < 0.1) return null; // No consumption or insufficient time

  // Estimate distance from average speed and time
  const avgSpeed = telemetry.reduce((sum, t) => sum + (t.speed ?? 0), 0) / telemetry.length;
  const distance = avgSpeed * timeHours;

  if (distance < 1) return null;

  return fuelUsed / distance; // liters per km
};

/**
 * Detect refueling event.
 * Triggered when fuel level increases by > 10%.
 */
export async function detectRefuelingEvent(vehicleId, currentFuelLevel) {
  const tenSecondsAgo = new Date(Date.now() - 10 * 1000);

  const previousReading = await prisma.obdLiveData.findFirst({
    where: {
      vehicleId,
      recordedAt: { lt: tenSecondsAgo },
    },
    orderBy: { recordedAt: 'desc' },
    take: 1,
    select: { fuelLevel: true, recordedAt: true },
  });

  if (!previousReading) return null;

  const fuelIncrease = (currentFuelLevel ?? 0) - (previousReading.fuelLevel ?? 0);

  // Refuel if fuel level increased by more than 10%
  if (fuelIncrease > 10) {
    return {
      vehicleId,
      liters: fuelIncrease,
      cost: 0, // To be filled manually or by integration
      mileage: null, // To be filled from odometer
    };
  }

  return null;
}

/**
 * Process fuel trend and record refueling events.
 */
export async function processFuelTrend(vehicleId, currentTelemetry) {
  try {
    // Check for refueling
    const refuelEvent = await detectRefuelingEvent(vehicleId, currentTelemetry.fuelLevel ?? currentTelemetry.fuel_level);
    if (refuelEvent) {
      // Get odometer from live state
      const liveState = await prisma.vehicleLiveState.findUnique({ where: { vehicleId } });
      const fuelLog = await prisma.fuelLog.create({
        data: {
          vehicleId,
          liters: refuelEvent.liters,
          cost: refuelEvent.cost,
          mileage: liveState?.odometer ?? currentTelemetry.odometer,
        },
      });
      logger.info('Refueling event recorded', { vehicleId, liters: refuelEvent.liters, mileage: fuelLog.mileage });
      return { type: 'refuel', data: fuelLog };
    }

    // Calculate consumption rate
    const consumptionRate = await calculateFuelConsumptionRate(vehicleId);
    if (consumptionRate) {
      logger.debug('Fuel consumption calculated', { vehicleId, consumptionRate: consumptionRate.toFixed(4) });
    }

    return { type: 'consumption', data: consumptionRate };
  } catch (error) {
    logger.error('Fuel trend processing failed', { vehicleId, error: error.message });
    return null;
  }
}

/**
 * Get fuel trend analytics for a vehicle.
 */
export async function getFuelTrendAnalytics(vehicleId, days = 7) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [refuelings, odometer, liveState] = await Promise.all([
    prisma.fuelLog.findMany({
      where: {
        vehicleId,
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.obdLiveData.findFirst({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
      select: { recordedAt: true },
    }),
    prisma.vehicleLiveState.findUnique({
      where: { vehicleId },
      select: { fuelLevel: true, odometer: true },
    }),
  ]);

  const totalLitersRefueled = refuelings.reduce((sum, r) => sum + r.liters, 0);
  const averageLitersPerRefuel = refuelings.length > 0 ? (totalLitersRefueled / refuelings.length).toFixed(1) : 0;

  // Get distance traveled
  const oldestOdometer = await prisma.obdLiveData.findFirst({
    where: {
      vehicleId,
      recordedAt: { gte: startDate },
    },
    orderBy: { recordedAt: 'asc' },
    select: { recordedAt: true },
  });

  // Simplified: use trip logs for distance
  const trips = await prisma.tripLog.findMany({
    where: {
      vehicleId,
      startTime: { gte: startDate },
    },
  });
  const totalDistance = trips.reduce((sum, t) => sum + (t.distance ?? 0), 0);

  const avgFuelConsumption =
    totalDistance > 0 && totalLitersRefueled > 0
      ? (totalLitersRefueled / totalDistance).toFixed(2)
      : 'N/A';

  return {
    period: `Last ${days} days`,
    refuelingEvents: refuelings.length,
    totalLitersRefueled: totalLitersRefueled.toFixed(1),
    averageLitersPerRefuel,
    totalDistanceTraveled: totalDistance.toFixed(1),
    avgFuelConsumption,
    currentFuelLevel: (liveState?.fuelLevel ?? 0).toFixed(1),
    lastRefueling: refuelings[0]?.createdAt,
    refuelingHistory: refuelings.map((r) => ({
      date: r.createdAt,
      liters: r.liters,
      cost: r.cost,
      mileage: r.mileage,
    })),
  };
}

/**
 * Estimate range based on fuel level and consumption rate.
 */
export async function estimateRange(vehicleId) {
  const liveState = await prisma.vehicleLiveState.findUnique({ where: { vehicleId } });
  if (!liveState) return null;

  const consumptionRate = await calculateFuelConsumptionRate(vehicleId);
  if (!consumptionRate || consumptionRate <= 0) {
    // Use typical consumption rate: 0.08 liters per km
    const estimatedRange = (liveState.fuelLevel ?? 0) / 0.08;
    return Math.round(estimatedRange);
  }

  const range = (liveState.fuelLevel ?? 0) / consumptionRate;
  return Math.round(range);
}
