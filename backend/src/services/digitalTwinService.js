import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

// Default company GPS anchor (Madurai, Tamil Nadu - configurable)
const DEFAULT_LAT = 9.9252;
const DEFAULT_LNG = 78.1198;

/**
 * Generate realistic default live state for a newly created vehicle.
 * Vehicle starts PARKED with engine OFF.
 */
export function generateDefaultState() {
  // Digital twin auto-generation is disabled.
  return null;
}

/**
 * Create VehicleLiveState for a newly created vehicle.
 * Auto-generation is disabled to preserve only real telemetry ingestion.
 */
export async function initDigitalTwin(vehicleId) {
  const existing = await prisma.vehicleLiveState.findUnique({ where: { vehicleId } });
  if (existing) return existing;

  logger.info('Digital twin initialization skipped for vehicle', { vehicleId });
  return null;
}

/**
 * Get the live state for a vehicle, or create it if missing (backfill).
 */
export async function getOrCreateTwin(vehicleId) {
  const twin = await prisma.vehicleLiveState.findUnique({ where: { vehicleId } });
  if (!twin) {
    logger.info('Digital twin fetch skipped because no live state exists', { vehicleId });
    return null;
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
    latitude, longitude, engineHours, odometer,
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
      engineHours: engineHours ?? 0,
      odometer: odometer ?? 0,
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
  logger.info('Switch to SIMULATED skipped for vehicle', { vehicleId });
}

/**
 * Backfill twins for all vehicles that don't have one yet.
 * Disabled to avoid generating fake telemetry records.
 */
export async function backfillAllTwins() {
  logger.info('Digital twin backfill skipped');
  return 0;
}
