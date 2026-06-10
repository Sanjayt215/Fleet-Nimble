import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

// Default company GPS anchor (Madurai, Tamil Nadu - configurable)
const DEFAULT_LAT = 9.9252;
const DEFAULT_LNG = 78.1198;

function rand(min, max, decimals = 1) {
  const v = Math.random() * (max - min) + min;
  return parseFloat(v.toFixed(decimals));
}

/**
 * Generate realistic default live state for a newly created vehicle.
 * Vehicle starts PARKED with engine OFF.
 */
export function generateDefaultState(vehicle = {}) {
  const engineHours = rand(500, 5000, 1);
  const odometer = vehicle.odometer || rand(10000, 200000, 0);

  return {
    telemetrySource: 'SIMULATED',
    rpm: 0,
    speed: 0,
    coolantTemp: rand(28, 35, 1),       // ambient — engine cold
    batteryVoltage: rand(12.4, 12.6, 2), // resting voltage
    fuelLevel: rand(60, 95, 1),
    engineLoad: 0,
    maf: 0,
    throttlePosition: 0,
    intakeTemp: rand(28, 35, 1),
    engineHours,
    odometer,
    gpsLat: DEFAULT_LAT + rand(-0.05, 0.05, 5),
    gpsLng: DEFAULT_LNG + rand(-0.05, 0.05, 5),
    ignitionStatus: false,
    vehicleStatus: 'PARKED',
  };
}

/**
 * Create VehicleLiveState for a newly created vehicle.
 * Called from vehicleController.create().
 */
export async function initDigitalTwin(vehicleId, vehicleData = {}) {
  try {
    const existing = await prisma.vehicleLiveState.findUnique({ where: { vehicleId } });
    if (existing) return existing;

    const state = generateDefaultState(vehicleData);
    const twin = await prisma.vehicleLiveState.create({
      data: { vehicleId, ...state },
    });

    logger.info('Digital twin initialized', { vehicleId, source: 'SIMULATED' });
    return twin;
  } catch (err) {
    logger.error('Failed to init digital twin', { vehicleId, err: err.message });
    throw err;
  }
}

/**
 * Get the live state for a vehicle, or create it if missing (backfill).
 */
export async function getOrCreateTwin(vehicleId) {
  let twin = await prisma.vehicleLiveState.findUnique({ where: { vehicleId } });
  if (!twin) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { odometer: true },
    });
    twin = await initDigitalTwin(vehicleId, vehicle || {});
  }
  return twin;
}

/**
 * Switch a vehicle to REAL telemetry source (called when MQTT/OBD data arrives).
 */
export async function switchToRealTelemetry(vehicleId, telemetryData) {
  const {
    rpm, speed, coolantTemp, batteryVoltage, fuelLevel,
    engineLoad, maf, throttle, intakeTemp,
    latitude, longitude,
  } = telemetryData;

  await prisma.vehicleLiveState.upsert({
    where: { vehicleId },
    update: {
      telemetrySource: 'REAL',
      lastUpdate: new Date(),
      ...(rpm != null && { rpm }),
      ...(speed != null && { speed }),
      ...(coolantTemp != null && { coolantTemp }),
      ...(batteryVoltage != null && { batteryVoltage }),
      ...(fuelLevel != null && { fuelLevel }),
      ...(engineLoad != null && { engineLoad }),
      ...(maf != null && { maf }),
      ...(throttle != null && { throttlePosition: throttle }),
      ...(intakeTemp != null && { intakeTemp }),
      ...(latitude != null && { gpsLat: latitude }),
      ...(longitude != null && { gpsLng: longitude }),
      vehicleStatus: speed > 1 ? 'MOVING' : rpm > 200 ? 'IDLING' : 'PARKED',
      ignitionStatus: rpm > 0,
    },
    create: {
      vehicleId,
      telemetrySource: 'REAL',
      rpm: rpm ?? 0,
      speed: speed ?? 0,
      coolantTemp: coolantTemp ?? 80,
      batteryVoltage: batteryVoltage ?? 13.8,
      fuelLevel: fuelLevel ?? 70,
      engineLoad: engineLoad ?? 0,
      maf: maf ?? 3,
      throttlePosition: throttle ?? 0,
      intakeTemp: intakeTemp ?? 35,
      engineHours: 1000,
      odometer: 50000,
      gpsLat: latitude,
      gpsLng: longitude,
      ignitionStatus: (rpm ?? 0) > 0,
      vehicleStatus: (speed ?? 0) > 1 ? 'MOVING' : (rpm ?? 0) > 200 ? 'IDLING' : 'PARKED',
    },
  });
}

/**
 * Switch a vehicle back to SIMULATED if real telemetry timed out.
 */
export async function switchToSimulated(vehicleId) {
  await prisma.vehicleLiveState.update({
    where: { vehicleId },
    data: { telemetrySource: 'SIMULATED' },
  });
  logger.info('Switched back to SIMULATED', { vehicleId });
}

/**
 * Backfill twins for all vehicles that don't have one yet.
 */
export async function backfillAllTwins() {
  const vehicles = await prisma.vehicle.findMany({
    where: { deletedAt: null },
    select: { id: true, odometer: true },
  });

  let created = 0;
  for (const v of vehicles) {
    const existing = await prisma.vehicleLiveState.findUnique({ where: { vehicleId: v.id } });
    if (!existing) {
      await initDigitalTwin(v.id, v);
      created++;
    }
  }

  if (created > 0) logger.info('Digital twin backfill complete', { created });
  return created;
}
