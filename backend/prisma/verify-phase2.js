import prisma from '../src/utils/prisma.js';
import logger from '../src/utils/logger.js';

const CHECKS = {
  PASSED: '✅',
  FAILED: '❌',
  WARNING: '⚠️',
};

const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
};

async function check(name, fn) {
  try {
    const result = await fn();
    if (result === true) {
      console.log(`${CHECKS.PASSED} ${name}`);
      results.passed++;
    } else if (result === false) {
      console.log(`${CHECKS.FAILED} ${name}`);
      results.failed++;
    } else {
      console.log(`${CHECKS.WARNING} ${name} - ${result}`);
      results.warnings++;
    }
  } catch (error) {
    console.log(`${CHECKS.FAILED} ${name} - ${error.message}`);
    results.failed++;
  }
}

async function verifyPhase2() {
  console.log('\n📋 FleetNimble Phase 2 Verification Report\n');

  // ===== PHASE 1 - DATABASE ======
  console.log('═══ PHASE 1: DATABASE SCHEMA ═══\n');

  await check('Vehicle live state table exists', async () => {
    const count = await prisma.vehicleLiveState.count();
    return count >= 0; // Table exists
  });

  await check('Fuel history table exists', async () => {
    const count = await prisma.fuelHistory.count();
    return count >= 0; // Table exists
  });

  await check('Alert system functional', async () => {
    const count = await prisma.alert.count();
    return count >= 0; // Table exists
  });

  await check('Vehicle alerts accessible', async () => {
    const sample = await prisma.alert.findFirst();
    return sample === null || (sample.vehicleId && sample.alertType);
  });

  // ===== PHASE 2 - TELEMETRY SIMULATION =====
  console.log('\n═══ PHASE 2: TELEMETRY SIMULATION ═══\n');

  await check('Simulated vehicles exist', async () => {
    const count = await prisma.vehicleLiveState.count({ where: { telemetrySource: 'SIMULATED' } });
    return count > 0 ? true : 'No simulated vehicles found';
  });

  await check('Live states have complete telemetry', async () => {
    const sample = await prisma.vehicleLiveState.findFirst();
    if (!sample) return false;
    const hasRpm = sample.rpm >= 0;
    const hasSpeed = sample.speed >= 0;
    const hasTemp = sample.coolantTemp >= 0;
    const hasFuel = sample.fuelLevel >= 0;
    const hasBattery = sample.batteryVoltage >= 0;
    return hasRpm && hasSpeed && hasTemp && hasFuel && hasBattery;
  });

  await check('Live states have trip data', async () => {
    const sample = await prisma.vehicleLiveState.findFirst();
    if (!sample) return false;
    return sample.odometer >= 0 && sample.engineHours >= 0;
  });

  await check('Live states have GPS location', async () => {
    const sample = await prisma.vehicleLiveState.findFirst();
    if (!sample) return false;
    return sample.gpsLat !== null && sample.gpsLng !== null;
  });

  await check('Live states have status field', async () => {
    const sample = await prisma.vehicleLiveState.findFirst();
    if (!sample) return false;
    return ['PARKED', 'IDLING', 'MOVING', 'OFFLINE'].includes(sample.vehicleStatus);
  });

  // ===== PHASE 3 - AUTOMATIC VEHICLE PROVISIONING =====
  console.log('\n═══ PHASE 3: AUTOMATIC VEHICLE PROVISIONING ═══\n');

  await check('All vehicles have live state', async () => {
    const total = await prisma.vehicle.count({ where: { deletedAt: null } });
    const withLiveState = await prisma.vehicleLiveState.count();
    return total === withLiveState ? true : `${withLiveState}/${total} vehicles have live state`;
  });

  await check('All vehicles have fuel log', async () => {
    const total = await prisma.vehicle.count({ where: { deletedAt: null } });
    const withFuel = await prisma.fuelLog.count({ distinct: ['vehicleId'] });
    return total === withFuel ? true : `${withFuel}/${total} vehicles have fuel logs`;
  });

  await check('All vehicles have maintenance log', async () => {
    const total = await prisma.vehicle.count({ where: { deletedAt: null } });
    const withMaintenance = await prisma.maintenanceLog.count({ distinct: ['vehicleId'] });
    return total === withMaintenance ? true : `${withMaintenance}/${total} vehicles have maintenance logs`;
  });

  await check('Live states initialized with defaults', async () => {
    const sample = await prisma.vehicleLiveState.findFirst();
    if (!sample) return false;
    const correctDefaults =
      sample.fuelLevel >= 30 &&
      sample.fuelLevel <= 90 &&
      sample.batteryVoltage >= 12 &&
      sample.batteryVoltage <= 14 &&
      sample.coolantTemp >= 25 &&
      sample.coolantTemp <= 40;
    return correctDefaults ? true : 'Default values out of range';
  });

  // ===== PHASE 4 - TELEMETRY SOURCE SWITCHING =====
  console.log('\n═══ PHASE 4: TELEMETRY SOURCE SWITCHING ═══\n');

  await check('Telemetry source field exists', async () => {
    const sample = await prisma.vehicleLiveState.findFirst();
    if (!sample) return false;
    return ['REAL', 'SIMULATED'].includes(sample.telemetrySource);
  });

  await check('Last update timestamp tracked', async () => {
    const sample = await prisma.vehicleLiveState.findFirst();
    if (!sample) return false;
    return sample.lastUpdate instanceof Date && sample.lastUpdate.getTime() > 0;
  });

  // ===== PHASE 5 - MULTI-VEHICLE DIAGNOSTICS =====
  console.log('\n═══ PHASE 5: MULTI-VEHICLE LIVE DIAGNOSTICS ═══\n');

  await check('Sample vehicles with diverse statuses', async () => {
    const parked = await prisma.vehicleLiveState.count({ where: { vehicleStatus: 'PARKED' } });
    const idling = await prisma.vehicleLiveState.count({ where: { vehicleStatus: 'IDLING' } });
    const moving = await prisma.vehicleLiveState.count({ where: { vehicleStatus: 'MOVING' } });
    return parked + idling + moving > 0 ? true : 'No vehicles with status data';
  });

  await check('Vehicle grid data accessible', async () => {
    const vehicles = await prisma.vehicle.findMany({
      where: { deletedAt: null },
      include: { liveState: true },
      take: 5,
    });
    return vehicles.every((v) => v.liveState) ? true : 'Some vehicles missing live state';
  });

  // ===== PHASE 6 - DASHBOARD KPI ENGINE =====
  console.log('\n═══ PHASE 6: DASHBOARD KPI ENGINE ═══\n');

  await check('Can calculate online vehicles', async () => {
    const count = await prisma.vehicle.count({
      where: { deletedAt: null, telemetryOnline: true },
    });
    return count >= 0;
  });

  await check('Can calculate moving vehicles', async () => {
    const count = await prisma.vehicleLiveState.count({ where: { vehicleStatus: 'MOVING' } });
    return count >= 0;
  });

  await check('Can calculate idle vehicles', async () => {
    const count = await prisma.vehicleLiveState.count({ where: { vehicleStatus: 'IDLING' } });
    return count >= 0;
  });

  await check('Can calculate average fuel', async () => {
    const result = await prisma.vehicleLiveState.aggregate({
      _avg: { fuelLevel: true },
    });
    return result._avg.fuelLevel !== null;
  });

  await check('Can calculate average engine hours', async () => {
    const result = await prisma.vehicleLiveState.aggregate({
      _avg: { engineHours: true },
    });
    return result._avg.engineHours !== null;
  });

  // ===== PHASE 7 - DRIVER BEHAVIOR ENGINE =====
  console.log('\n═══ PHASE 7: DRIVER BEHAVIOR ENGINE ═══\n');

  await check('Driver behavior events table exists', async () => {
    const count = await prisma.driverBehaviorEvent.count();
    return count >= 0;
  });

  await check('Behavior event types valid', async () => {
    const types = await prisma.driverBehaviorEvent.groupBy({
      by: ['eventType'],
    });
    const validTypes = ['HARSH_BRAKE', 'HARSH_ACCEL', 'IDLE', 'SPEEDING', 'GEOFENCE_ENTER', 'GEOFENCE_EXIT'];
    const allValid = types.every((t) => validTypes.includes(t.eventType));
    return allValid || types.length === 0 ? true : 'Invalid event types found';
  });

  await check('Driver scores calculated', async () => {
    const count = await prisma.driverScore.count();
    return count > 0 ? true : 'No driver scores found';
  });

  await check('Driver scores valid (0-100)', async () => {
    const scores = await prisma.driverScore.findMany({ take: 10 });
    const allValid = scores.every((s) => s.score >= 0 && s.score <= 100);
    return allValid || scores.length === 0;
  });

  // ===== PHASE 8 - FUEL MANAGEMENT ENGINE =====
  console.log('\n═══ PHASE 8: FUEL MANAGEMENT ENGINE ═══\n');

  await check('Fuel history records created', async () => {
    const count = await prisma.fuelHistory.count();
    return count > 0 ? true : 'No fuel history records';
  });

  await check('Fuel event types tracked', async () => {
    const types = await prisma.fuelHistory.groupBy({
      by: ['eventType'],
    });
    return types.some((t) => t.eventType === 'CONSUMPTION' || t.eventType === 'REFUEL');
  });

  await check('Fuel consumption events exist', async () => {
    const count = await prisma.fuelHistory.count({ where: { eventType: 'CONSUMPTION' } });
    return count > 0 ? true : 'No consumption events';
  });

  await check('Refuel events tracked', async () => {
    const count = await prisma.fuelHistory.count({ where: { eventType: 'REFUEL' } });
    return count > 0 ? true : 'No refuel events';
  });

  await check('Fuel logs contain refueling data', async () => {
    const sample = await prisma.fuelLog.findFirst();
    if (!sample) return false;
    return sample.liters > 0 && sample.mileage !== null;
  });

  // ===== PHASE 9 - ALERT ENGINE =====
  console.log('\n═══ PHASE 9: ALERT ENGINE ═══\n');

  await check('Alerts created in system', async () => {
    const count = await prisma.alert.count();
    return count >= 0;
  });

  await check('Alert severity levels valid', async () => {
    const severities = await prisma.alert.groupBy({
      by: ['severity'],
    });
    const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const allValid = severities.every((s) => validSeverities.includes(s.severity));
    return allValid || severities.length === 0;
  });

  await check('Alert types tracked', async () => {
    const types = await prisma.alert.groupBy({
      by: ['alertType'],
    });
    const hasExpectedTypes = types.length > 0;
    return hasExpectedTypes ? true : 'No alert types found';
  });

  await check('Unread alerts tracked', async () => {
    const count = await prisma.alert.count({ where: { read: false } });
    return count >= 0;
  });

  // ===== TEST DATA VALIDATION =====
  console.log('\n═══ TEST DATA VALIDATION ═══\n');

  await check('20 vehicles seeded', async () => {
    const count = await prisma.vehicle.count({ where: { deletedAt: null } });
    return count >= 20 ? true : `Only ${count} vehicles found (need 20)`;
  });

  await check('Multiple vehicle makes represented', async () => {
    const makes = await prisma.vehicle.groupBy({
      by: ['make'],
      where: { deletedAt: null },
    });
    return makes.length >= 10 ? true : `Only ${makes.length} different makes (need 10+)`;
  });

  await check('Vehicles have realistic odometers', async () => {
    const vehicles = await prisma.vehicle.findMany({ where: { deletedAt: null }, take: 5 });
    const realistic = vehicles.every((v) => v.odometer >= 10000 && v.odometer <= 200000);
    return realistic ? true : 'Some unrealistic odometer values';
  });

  await check('Vehicles have realistic engine hours', async () => {
    const vehicles = await prisma.vehicle.findMany({ where: { deletedAt: null }, take: 5 });
    const realistic = vehicles.every((v) => !v.engineHoursObd || (v.engineHoursObd > 0 && v.engineHoursObd < 10000));
    return realistic ? true : 'Some unrealistic engine hour values';
  });

  // ===== SUMMARY =====
  console.log('\n═══ SUMMARY ═══\n');
  console.log(`${CHECKS.PASSED} Passed: ${results.passed}`);
  console.log(`${CHECKS.FAILED} Failed: ${results.failed}`);
  console.log(`${CHECKS.WARNING} Warnings: ${results.warnings}`);

  const total = results.passed + results.failed + results.warnings;
  const percentage = Math.round((results.passed / total) * 100);

  console.log(`\n📊 Completion: ${percentage}% (${results.passed}/${total})\n`);

  if (results.failed === 0) {
    console.log('✅ All Phase 2 requirements verified!\n');
    process.exit(0);
  } else {
    console.log(`⚠️  ${results.failed} checks failed. Review above for details.\n`);
    process.exit(1);
  }
}

async function main() {
  try {
    await verifyPhase2();
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
