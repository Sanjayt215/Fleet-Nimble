import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { processTelemetryAlerts } from './alertEngine.js';
import { clamp as validateClamp, validateTelemetryField } from '../utils/telemetryValidator.js';

const INTERVAL_MS = 3000; // 3 second simulation tick (reduced for free-tier)
const REAL_TIMEOUT_MS = 60_000; // switch back to simulated after 60s no real data

// Per-vehicle simulation state (in-memory, not persisted)
const vehicleSimState = new Map(); // vehicleId -> { mode, coolantWarmup, stateTimer, heading }

const MODES = ['PARKED', 'IDLING', 'CITY', 'HIGHWAY'];
const MODE_WEIGHTS = [0.3, 0.2, 0.35, 0.15]; // probability of each mode

function weightedRandom(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function rand(min, max, decimals = 1) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Get or init per-vehicle sim state
 */
function getSimState(vehicleId, currentState) {
  if (!vehicleSimState.has(vehicleId)) {
    const mode = weightedRandom(MODES, MODE_WEIGHTS);
    vehicleSimState.set(vehicleId, {
      mode,
      stateTimer: Math.floor(Math.random() * 30) + 10, // ticks before mode change
      coolantWarmup: currentState?.coolantTemp ?? 30, // track warmup curve
      heading: rand(0, 360, 1), // GPS heading in degrees
      prevRpm: currentState?.rpm ?? 0,
      prevSpeed: currentState?.speed ?? 0,
    });
  }
  return vehicleSimState.get(vehicleId);
}

/**
 * Generate next tick telemetry based on current state and mode
 */
function simulateTick(current, simState) {
  const { mode } = simState;
  let { prevRpm, prevSpeed, coolantWarmup } = simState;

  const INTERVAL_HOURS = INTERVAL_MS / 1000 / 3600;

  let targetRpm, targetSpeed, targetLoad, targetThrottle;

  switch (mode) {
    case 'PARKED':
      targetRpm = 0;
      targetSpeed = 0;
      targetLoad = 0;
      targetThrottle = 0;
      break;
    case 'IDLING':
      targetRpm = rand(720, 880, 0);
      targetSpeed = 0;
      targetLoad = rand(8, 18, 1);
      targetThrottle = rand(2, 6, 1);
      break;
    case 'CITY':
      targetRpm = rand(1200, 2500, 0);
      targetSpeed = rand(15, 60, 1);
      targetLoad = rand(30, 65, 1);
      targetThrottle = rand(10, 40, 1);
      break;
    case 'HIGHWAY':
      targetRpm = rand(1800, 3200, 0);
      targetSpeed = rand(60, 100, 1);
      targetLoad = rand(45, 75, 1);
      targetThrottle = rand(25, 60, 1);
      break;
    default:
      targetRpm = 0; targetSpeed = 0; targetLoad = 0; targetThrottle = 0;
  }

  // Smooth transitions — RPM leads speed
  const rpmAlpha = 0.3;
  const speedAlpha = 0.2;
  const rpm = parseFloat(lerp(prevRpm, targetRpm, rpmAlpha).toFixed(0));
  const speed = parseFloat(lerp(prevSpeed, targetSpeed, speedAlpha).toFixed(1));

  simState.prevRpm = rpm;
  simState.prevSpeed = speed;

  // Coolant: warms up when engine running, cools when off
  const isRunning = rpm > 0;
  const coolantTarget = isRunning ? rand(78, 95, 1) : rand(28, 35, 1);
  const coolantAlpha = isRunning ? 0.02 : 0.005; // slow warmup, very slow cooldown
  coolantWarmup = parseFloat(lerp(coolantWarmup, coolantTarget, coolantAlpha).toFixed(1));
  simState.coolantWarmup = coolantWarmup;

  // Battery: rises when engine running (alternator), falls when parked
  const battTarget = isRunning ? rand(13.8, 14.2, 2) : rand(12.3, 12.6, 2);
  const battery = parseFloat(lerp(current.batteryVoltage, battTarget, 0.1).toFixed(2));

  // Fuel: decreases with speed/load
  const fuelBurnRate = isRunning
    ? (speed > 0 ? (speed * 0.0008 + rpm * 0.000005) : 0.0002)
    : 0;
  const fuel = parseFloat(clamp(current.fuelLevel - fuelBurnRate, 0, 100).toFixed(2));

  // Occasionally refuel when very low
  const fuelFinal = fuel < 5 ? rand(75, 95, 1) : fuel;

  // MAF: proportional to RPM + load
  const maf = isRunning ? parseFloat((rpm * targetLoad / 100 * 0.003 + rand(0.5, 1.5, 2)).toFixed(2)) : 0;

  // Intake temp: rises slightly with RPM
  const intakeTemp = parseFloat((current.intakeTemp + (isRunning ? rand(-0.2, 0.5, 1) : rand(-0.5, 0.1, 1))).toFixed(1));

  // Odometer: distance = speed * time
  const distanceKm = (speed / 3600) * (INTERVAL_MS / 1000); // km per tick
  const odometer = parseFloat((current.odometer + distanceKm).toFixed(3));

  // Engine hours
  const engineHours = isRunning
    ? parseFloat((current.engineHours + INTERVAL_HOURS).toFixed(4))
    : current.engineHours;

  // GPS movement
  let gpsLat = current.gpsLat;
  let gpsLng = current.gpsLng;
  if (speed > 0 && gpsLat != null && gpsLng != null) {
    // Move in heading direction
    const headingRad = (simState.heading * Math.PI) / 180;
    const distanceDeg = distanceKm / 111; // rough deg per km
    gpsLat = parseFloat((gpsLat + distanceDeg * Math.cos(headingRad)).toFixed(6));
    gpsLng = parseFloat((gpsLng + distanceDeg * Math.sin(headingRad)).toFixed(6));
    // Slight heading variation
    simState.heading = (simState.heading + rand(-5, 5, 1) + 360) % 360;
  }

  const vehicleStatus = speed > 1 ? 'MOVING' : rpm > 200 ? 'IDLING' : 'PARKED';

  // Validate all values before returning - ensures no NaN, Infinity, or out-of-bounds values
  return {
    rpm: validateTelemetryField('rpm', rpm),
    speed: validateTelemetryField('speed', speed),
    coolantTemp: validateTelemetryField('coolantTemp', coolantWarmup),
    batteryVoltage: validateTelemetryField('batteryVoltage', battery),
    fuelLevel: validateTelemetryField('fuelLevel', fuelFinal),
    engineLoad: validateTelemetryField('engineLoad', targetLoad),
    maf: validateTelemetryField('maf', maf),
    throttlePosition: validateTelemetryField('throttlePosition', targetThrottle),
    intakeTemp: validateTelemetryField('intakeTemp', intakeTemp),
    odometer: validateTelemetryField('odometer', odometer),
    engineHours: validateTelemetryField('engineHours', engineHours),
    gpsLat: validateTelemetryField('gpsLat', gpsLat),
    gpsLng: validateTelemetryField('gpsLng', gpsLng),
    ignitionStatus: isRunning,
    vehicleStatus,
    telemetrySource: 'SIMULATED',
    lastUpdate: new Date(),
  };
}

/**
 * Check for driver behavior events in a tick
 */
async function detectBehaviorEvents(vehicleId, prev, next) {
  const events = [];

  // Harsh acceleration: RPM spike > 1500 in one tick
  if (next.rpm - prev.rpm > 1500) {
    events.push({ eventType: 'HARSH_ACCEL', severity: 'MEDIUM', metadata: { rpm: next.rpm, prevRpm: prev.rpm } });
  }

  // Harsh braking: speed drop > 20 in one tick
  if (prev.speed - next.speed > 20) {
    events.push({ eventType: 'HARSH_BRAKE', severity: 'MEDIUM', metadata: { speed: next.speed, prevSpeed: prev.speed } });
  }

  // Excessive idle: running but no movement for this tick and engine load low
  if (next.rpm > 500 && next.speed === 0 && next.engineLoad < 20) {
    // Only log occasionally (1 in 30 ticks) to avoid flooding
    if (Math.random() < 0.033) {
      events.push({ eventType: 'IDLE', severity: 'LOW', metadata: { rpm: next.rpm, duration: '60s+' } });
    }
  }

  if (events.length) {
    await prisma.driverBehaviorEvent.createMany({
      data: events.map((e) => ({
        vehicleId,
        eventType: e.eventType,
        severity: e.severity,
        metadata: e.metadata,
        latitude: next.gpsLat,
        longitude: next.gpsLng,
        simGenerated: true,
      })),
      skipDuplicates: true,
    });
  }
}

/**
 * Check for threshold alerts in a tick
 */
async function checkAlerts(vehicleId, state, io) {
  const alerts = [];

  if (state.batteryVoltage < 11.8) {
    alerts.push({ alertType: 'LOW_BATTERY', message: `Low battery: ${state.batteryVoltage}V`, severity: 'HIGH' });
  }
  if (state.fuelLevel < 10) {
    alerts.push({ alertType: 'LOW_FUEL', message: `Fuel critical: ${state.fuelLevel.toFixed(1)}%`, severity: 'HIGH' });
  }
  if (state.coolantTemp > 105) {
    alerts.push({ alertType: 'HIGH_COOLANT', message: `Coolant overheating: ${state.coolantTemp}°C`, severity: 'CRITICAL' });
  }

  for (const a of alerts) {
    // Deduplicate: don't create same alert within 5 minutes
    const recent = await prisma.alert.findFirst({
      where: {
        vehicleId,
        alertType: a.alertType,
        createdAt: { gte: new Date(Date.now() - 5 * 60_000) },
      },
    });
    if (recent) continue;

    const alert = await prisma.alert.create({ data: { vehicleId, ...a } });
    if (io) {
      io.to(`vehicle:${vehicleId}`).emit('alert:new', alert);
    }
  }
}

let simulationTimer = null;
let fallbackTimer = null;
let ioRef = null;

/**
 * Run one simulation tick across all SIMULATED vehicles
 */
async function runSimulationTick() {
  try {
    // Get all SIMULATED live states
    const states = await prisma.vehicleLiveState.findMany({
      where: { telemetrySource: 'SIMULATED' },
      include: { vehicle: { select: { id: true, userId: true, deletedAt: true } } },
    });

    const activeStates = states.filter((s) => !s.vehicle?.deletedAt);

    if (!activeStates.length) return;

    for (const current of activeStates) {
      const vehicleId = current.vehicleId;
      const simState = getSimState(vehicleId, current);

      // Mode cycling: change mode after stateTimer ticks
      simState.stateTimer--;
      if (simState.stateTimer <= 0) {
        simState.mode = weightedRandom(MODES, MODE_WEIGHTS);
        simState.stateTimer = Math.floor(Math.random() * 60) + 20; // 20-80 ticks (40-160s)
      }

      const next = simulateTick(current, simState);
      const prev = { rpm: current.rpm, speed: current.speed };

      // Update DB
      await prisma.vehicleLiveState.update({
        where: { vehicleId },
        data: next,
      });

      // Detect behavior events
      await detectBehaviorEvents(vehicleId, prev, next);

      // Check threshold alerts (run occasionally - 1 in 10 ticks to avoid DB spam)
      if (Math.random() < 0.1) {
        await checkAlerts(vehicleId, next, ioRef);
      }

      // Emit live:update to connected frontends
      if (ioRef) {
        const payload = {
          vehicleId,
          ...next,
          // Map to OBD field names for frontend compatibility
          throttle: next.throttlePosition,
          engineLoad: next.engineLoad,
          coolantTemp: next.coolantTemp,
          batteryVoltage: next.batteryVoltage,
          fuelLevel: next.fuelLevel,
          recordedAt: next.lastUpdate,
          _simulated: true,
        };
        ioRef.to(`vehicle:${vehicleId}`).emit('live:update', payload);
        if (current.vehicle?.userId) {
          ioRef.to(`user:${current.vehicle.userId}`).emit('live:update', payload);
        }
      }
    }
  } catch (err) {
    logger.error('Simulation tick error', { err: err.message });
  }
}

/**
 * Check for REAL vehicles that haven't received data in 60s → switch back to SIMULATED
 */
async function checkRealFallback() {
  try {
    const threshold = new Date(Date.now() - REAL_TIMEOUT_MS);
    const stale = await prisma.vehicleLiveState.findMany({
      where: {
        telemetrySource: 'REAL',
        lastUpdate: { lt: threshold },
      },
      select: { vehicleId: true },
    });

    if (stale.length) {
      await prisma.vehicleLiveState.updateMany({
        where: { vehicleId: { in: stale.map((s) => s.vehicleId) } },
        data: { telemetrySource: 'SIMULATED' },
      });
      for (const { vehicleId } of stale) {
        vehicleSimState.delete(vehicleId); // reset sim state for fresh start
        logger.info('Vehicle fell back to SIMULATED', { vehicleId });
      }
    }
  } catch (err) {
    logger.error('Real telemetry fallback check error', { err: err.message });
  }
}

/**
 * Start the simulator. Call once at server startup.
 */
export function startSimulator(io) {
  if (simulationTimer) return; // already running
  ioRef = io;

  simulationTimer = setInterval(runSimulationTick, INTERVAL_MS);

  // Fallback check every 30 seconds
  fallbackTimer = setInterval(checkRealFallback, 30_000);

  logger.info('Telemetry Simulation Service started', { intervalMs: INTERVAL_MS });
}

export function stopSimulator() {
  if (simulationTimer) {
    clearInterval(simulationTimer);
    simulationTimer = null;
  }
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }
  logger.info('Telemetry Simulation Service stopped');
}

/**
 * Pause simulation for a specific vehicle (when REAL telemetry arrives)
 */
export function pauseVehicleSimulation(vehicleId) {
  vehicleSimState.delete(vehicleId);
}
