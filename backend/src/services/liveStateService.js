import prisma from '../utils/prisma.js';
import { broadcastLiveUpdate } from './telemetryBroadcast.js';
import logger from '../utils/logger.js';
import { validateTelemetryField } from '../utils/telemetryValidator.js';

const DEFAULT_COMPANY_LOCATION = { lat: 37.773972, lng: -122.431297 };
const CYCLE_SECONDS = 2;
const KM_PER_SEC = 1 / 3600;
const DEG_PER_KM = 1 / 111;
const VEHICLE_STATES = {
  OFF: 'OFF',
  IDLE: 'IDLE',
  CITY_DRIVING: 'CITY_DRIVING',
  TRAFFIC: 'TRAFFIC',
  HIGHWAY: 'HIGHWAY',
  PARKING: 'PARKING',
};

const STATE_TRANSITIONS = {
  OFF: { IDLE: 0.85, PARKING: 0.1, OFF: 0.05 },
  IDLE: { CITY_DRIVING: 0.55, TRAFFIC: 0.15, PARKING: 0.1, OFF: 0.05, IDLE: 0.15 },
  CITY_DRIVING: { TRAFFIC: 0.2, HIGHWAY: 0.2, PARKING: 0.1, IDLE: 0.25, CITY_DRIVING: 0.25 },
  TRAFFIC: { CITY_DRIVING: 0.5, PARKING: 0.2, TRAFFIC: 0.3 },
  HIGHWAY: { CITY_DRIVING: 0.4, PARKING: 0.1, HIGHWAY: 0.45, TRAFFIC: 0.05 },
  PARKING: { OFF: 0.25, IDLE: 0.5, CITY_DRIVING: 0.15, PARKING: 0.1 },
};

const STATE_PROFILE = {
  OFF: { speed: [0, 0], rpm: [0, 0], coolant: [25, 33], battery: [12.2, 12.8], load: [0, 0], throttle: [0, 0] },
  IDLE: { speed: [0, 0], rpm: [700, 900], coolant: [45, 65], battery: [13.5, 14.0], load: [10, 18], throttle: [0, 5] },
  CITY_DRIVING: { speed: [20, 60], rpm: [1000, 2500], coolant: [80, 92], battery: [13.5, 14.2], load: [20, 60], throttle: [15, 50] },
  TRAFFIC: { speed: [0, 20], rpm: [800, 1800], coolant: [80, 92], battery: [13.5, 14.2], load: [10, 40], throttle: [5, 35] },
  HIGHWAY: { speed: [60, 110], rpm: [1800, 3200], coolant: [90, 100], battery: [13.7, 14.4], load: [30, 80], throttle: [20, 55] },
  PARKING: { speed: [0, 10], rpm: [700, 900], coolant: [70, 85], battery: [13.4, 14.0], load: [8, 18], throttle: [0, 5] },
};

const simStateMeta = new Map();

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function approach(current, target, maxDelta) {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

function weightedRandom(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let value = Math.random() * total;

  for (let i = 0; i < items.length; i += 1) {
    value -= weights[i];
    if (value <= 0) return items[i];
  }

  return items[items.length - 1];
}

function resolveInitialSimState(liveState) {
  if (!liveState.ignitionStatus) return VEHICLE_STATES.OFF;
  if (liveState.vehicleStatus === 'IDLING') return VEHICLE_STATES.IDLE;
  if (liveState.vehicleStatus === 'PARKED') {
    return liveState.speed > 3 ? VEHICLE_STATES.PARKING : VEHICLE_STATES.IDLE;
  }
  if (liveState.speed >= 60) return VEHICLE_STATES.HIGHWAY;
  if (liveState.speed >= 20) return VEHICLE_STATES.CITY_DRIVING;
  if (liveState.speed > 0) return VEHICLE_STATES.TRAFFIC;
  return VEHICLE_STATES.IDLE;
}

function chooseNextState(current) {
  const weights = STATE_TRANSITIONS[current] || STATE_TRANSITIONS.IDLE;
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  let n = Math.random() * total;

  for (const [next, weight] of entries) {
    n -= weight;
    if (n <= 0) return next;
  }

  return entries[0][0];
}

function getStateDuration(state) {
  switch (state) {
    case VEHICLE_STATES.OFF:
      return Math.floor(randomBetween(15, 35));
    case VEHICLE_STATES.IDLE:
      return Math.floor(randomBetween(8, 18));
    case VEHICLE_STATES.CITY_DRIVING:
      return Math.floor(randomBetween(25, 65));
    case VEHICLE_STATES.TRAFFIC:
      return Math.floor(randomBetween(12, 28));
    case VEHICLE_STATES.HIGHWAY:
      return Math.floor(randomBetween(30, 80));
    case VEHICLE_STATES.PARKING:
      return Math.floor(randomBetween(12, 26));
    default:
      return Math.floor(randomBetween(10, 20));
  }
}

function getSimulationMeta(vehicleId, liveState) {
  if (!simStateMeta.has(vehicleId)) {
    simStateMeta.set(vehicleId, {
      currentState: resolveInitialSimState(liveState),
      stateTimer: getStateDuration(resolveInitialSimState(liveState)),
      heading: randomBetween(0, 360),
    });
  }
  return simStateMeta.get(vehicleId);
}

function mapInternalStateToVehicleStatus(internalState, speed) {
  switch (internalState) {
    case VEHICLE_STATES.OFF:
      return 'PARKED';
    case VEHICLE_STATES.IDLE:
      return 'IDLING';
    case VEHICLE_STATES.PARKING:
      return speed > 1 ? 'MOVING' : 'PARKED';
    default:
      return 'MOVING';
  }
}

function moveCoordinate(lat, lng, speedKmH, heading) {
  const km = speedKmH * KM_PER_SEC * CYCLE_SECONDS;
  if (km <= 0) return { lat, lng, heading };

  const bearingRad = (heading * Math.PI) / 180;
  const dLat = Math.cos(bearingRad) * km * DEG_PER_KM;
  const dLng = Math.sin(bearingRad) * km * DEG_PER_KM / Math.max(Math.cos((lat * Math.PI) / 180), 0.1);
  const nextLat = lat + dLat;
  const nextLng = lng + dLng;
  const drift = randomBetween(-2, 2);

  return {
    lat: nextLat,
    lng: nextLng,
    heading: (heading + drift + 360) % 360,
  };
}

function getTargetThrottle(internalState, speed, speedChange) {
  if (internalState === VEHICLE_STATES.OFF) return 0;
  if (internalState === VEHICLE_STATES.IDLE || internalState === VEHICLE_STATES.PARKING) {
    return randomBetween(0, 5);
  }
  if (speedChange > 1) {
    return randomBetween(25, 55);
  }
  if (speed < 5) {
    return randomBetween(10, 25);
  }
  return randomBetween(10, 25);
}

function getTargetRpm(profile, speed, throttle) {
  const speedRange = profile.speed[1] - profile.speed[0];
  const speedRatio = speedRange > 0 ? clamp((speed - profile.speed[0]) / speedRange, 0, 1) : 0.5;
  const baseRpm = lerp(profile.rpm[0], profile.rpm[1], speedRatio);
  const throttleInfluence = throttle * 7;
  const rpm = clamp(baseRpm + throttleInfluence + randomBetween(-80, 80), profile.rpm[0], profile.rpm[1]);
  return rpm;
}

function getTargetLoad(profile, speed, throttle) {
  const speedRange = profile.speed[1] - profile.speed[0];
  const speedRatio = speedRange > 0 ? clamp((speed - profile.speed[0]) / speedRange, 0, 1) : 0.5;
  const baseLoad = lerp(profile.load[0], profile.load[1], speedRatio);
  return clamp(baseLoad + throttle * 0.35 + randomBetween(-4, 4), profile.load[0], profile.load[1]);
}

function getCoolantTarget(internalState, profile, engineOn) {
  if (!engineOn) {
    return randomBetween(25, 35);
  }
  return randomBetween(profile.coolant[0], profile.coolant[1]);
}

function getFuelDeltaPercent(speed, rpm, load, engineOn) {
  if (!engineOn) return 0;
  const litersPerHour = clamp(2.4 + 0.04 * speed + 0.03 * (rpm / 1000) * (load / 100), 0.8, 12);
  const percentPerHour = (litersPerHour / 60) * 100;
  return percentPerHour * (CYCLE_SECONDS / 3600);
}

function buildGpsPosition(vehicle, companyLocation) {
  if (vehicle.gpsLat != null && vehicle.gpsLng != null) {
    return { lat: vehicle.gpsLat, lng: vehicle.gpsLng };
  }
  if (vehicle.gpsLocation) {
    return { lat: vehicle.gpsLocation.lat, lng: vehicle.gpsLocation.lng };
  }
  return { lat: companyLocation.lat, lng: companyLocation.lng };
}

function normalizeCompanyLocation(settings) {
  if (!settings || typeof settings !== 'object') return DEFAULT_COMPANY_LOCATION;
  if (settings.defaultLocation && typeof settings.defaultLocation === 'object') {
    const { lat, lng } = settings.defaultLocation;
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  }
  if (settings.location && typeof settings.location === 'object') {
    const { lat, lng } = settings.location;
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  }
  return DEFAULT_COMPANY_LOCATION;
}

function mapLiveStateToRecord(state) {
  // Validate and sanitize all telemetry values before sending to frontend
  return {
    id: state.id,
    vehicleId: state.vehicleId,
    telemetrySource: state.telemetrySource,
    lastUpdate: state.lastUpdate,
    rpm: validateTelemetryField('rpm', state.rpm),
    speed: validateTelemetryField('speed', state.speed),
    coolantTemp: validateTelemetryField('coolantTemp', state.coolantTemp),
    batteryVoltage: validateTelemetryField('batteryVoltage', state.batteryVoltage),
    fuelLevel: validateTelemetryField('fuelLevel', state.fuelLevel),
    engineLoad: validateTelemetryField('engineLoad', state.engineLoad),
    maf: validateTelemetryField('maf', state.maf),
    throttle: validateTelemetryField('throttlePosition', state.throttlePosition),
    intakeTemp: validateTelemetryField('intakeTemp', state.intakeTemp),
    engineHours: validateTelemetryField('engineHours', state.engineHours),
    odometer: validateTelemetryField('odometer', state.odometer),
    latitude: state.gpsLat !== undefined ? validateTelemetryField('gpsLat', state.gpsLat) : undefined,
    longitude: state.gpsLng !== undefined ? validateTelemetryField('gpsLng', state.gpsLng) : undefined,
    ignitionStatus: Boolean(state.ignitionStatus),
    vehicleStatus: state.vehicleStatus,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

export function buildInitialLiveState(vehicle, companySettings) {
  const defaultOdometer = vehicle.odometer > 0 ? vehicle.odometer : randomBetween(10000, 200000);
  const defaultEngineHours = vehicle.engineHoursObd ?? randomBetween(500, 5000);
  const companyLocation = normalizeCompanyLocation(companySettings);
  const gps = buildGpsPosition(vehicle, companyLocation);
  return {
    vehicleId: vehicle.id,
    telemetrySource: 'SIMULATED',
    lastUpdate: new Date(),
    rpm: 780,
    speed: 0,
    coolantTemp: 32,
    batteryVoltage: 12.5,
    fuelLevel: 82,
    engineLoad: 12,
    maf: 3.1,
    throttlePosition: 4,
    intakeTemp: 30,
    engineHours: defaultEngineHours,
    odometer: defaultOdometer,
    gpsLat: gps.lat,
    gpsLng: gps.lng,
    ignitionStatus: false,
    vehicleStatus: 'PARKED',
  };
}

export async function createVehicleLiveState(vehicle, companySettings) {
  logger.info('Vehicle live state creation disabled; live state will be populated from real telemetry only', {
    vehicleId: vehicle.id,
  });
  return null;
}

export async function getVehicleLiveState(vehicleId) {
  return prisma.vehicleLiveState.findUnique({ where: { vehicleId } });
}

export async function updateLiveStateFromTelemetry(vehicleId, telemetry, source = 'REAL') {
  const values = {
    telemetrySource: source === 'REAL' ? 'REAL' : 'SIMULATED',
    lastUpdate: new Date(),
    rpm: telemetry.rpm ?? 0,
    speed: telemetry.speed ?? 0,
    coolantTemp: telemetry.coolantTemp ?? telemetry.coolant_temp ?? 0,
    batteryVoltage: telemetry.batteryVoltage ?? telemetry.battery_voltage ?? 0,
    fuelLevel: telemetry.fuelLevel ?? telemetry.fuel_level ?? 0,
    engineLoad: telemetry.engineLoad ?? telemetry.engine_load ?? 0,
    maf: telemetry.maf ?? 0,
    throttlePosition: telemetry.throttle ?? telemetry.throttle_position ?? 0,
    intakeTemp: telemetry.intakeTemp ?? telemetry.intake_temp ?? 0,
    gpsLat: telemetry.latitude ?? telemetry.lat ?? telemetry.gpsLat,
    gpsLng: telemetry.longitude ?? telemetry.lng ?? telemetry.gpsLng,
    ignitionStatus: telemetry.rpm != null ? telemetry.rpm > 0 : telemetry.ignitionStatus,
    vehicleStatus: telemetry.speed > 0 ? 'MOVING' : telemetry.rpm > 0 ? 'IDLING' : 'PARKED',
  };

  const previousState = await prisma.vehicleLiveState.findUnique({ where: { vehicleId } });
  if (!previousState) {
    return prisma.vehicleLiveState.create({ data: { vehicleId, ...values, engineHours: telemetry.engineHours ?? 0, odometer: telemetry.odometer ?? 0, createdAt: new Date() } });
  }

  const distance = computeDistanceFromSpeed(previousState, values.speed);
  const odometer = clamp(
    telemetry.odometer != null ? telemetry.odometer : previousState.odometer + distance,
    previousState.odometer,
    Number.MAX_SAFE_INTEGER
  );
  const engineHours = clamp(
    telemetry.engineHours != null ? telemetry.engineHours : previousState.engineHours + (distance > 0 ? CYCLE_SECONDS / 3600 : 0),
    previousState.engineHours,
    Number.MAX_SAFE_INTEGER
  );

  return prisma.vehicleLiveState.update({
    where: { vehicleId },
    data: {
      ...values,
      odometer,
      engineHours,
    },
  });
}

function computeDistanceFromSpeed(previousState, speed) {
  const distance = (speed ?? 0) * KM_PER_SEC * CYCLE_SECONDS;
  return distance;
}

export async function simulateLiveStateCycle(io) {
  const vehicles = await prisma.vehicleLiveState.findMany({
    where: { telemetrySource: 'SIMULATED' },
    include: { vehicle: { include: { company: true } } },
  });
  if (!vehicles.length) return;

  const updates = vehicles.map(async (state) => {
    try {
      const meta = getSimulationMeta(state.vehicleId, state);
      meta.stateTimer -= 1;
      if (meta.stateTimer <= 0) {
        meta.currentState = chooseNextState(meta.currentState);
        meta.stateTimer = getStateDuration(meta.currentState);
      }

      const profile = STATE_PROFILE[meta.currentState];
      const targetSpeed = randomBetween(profile.speed[0], profile.speed[1]);
      const speed = clamp(approach(state.speed ?? 0, targetSpeed, 5), 0, 120);
      const speedDelta = speed - (state.speed ?? 0);
      const engineOn = meta.currentState !== VEHICLE_STATES.OFF;
      const ignitionStatus = engineOn;
      const throttleTarget = getTargetThrottle(meta.currentState, speed, speedDelta);
      const throttlePosition = clamp(approach(state.throttlePosition ?? 0, throttleTarget, 8), 0, 100);
      const rpmTarget = engineOn ? getTargetRpm(profile, speed, throttlePosition) : 0;
      const rpm = clamp(approach(state.rpm ?? rpmTarget, rpmTarget, 150), 0, 8000);
      const engineLoadTarget = engineOn ? getTargetLoad(profile, speed, throttlePosition) : 0;
      const engineLoad = clamp(approach(state.engineLoad ?? engineLoadTarget, engineLoadTarget, 6), 0, 100);
      const coolantTarget = getCoolantTarget(meta.currentState, profile, engineOn);
      const coolantTemp = clamp(approach(state.coolantTemp ?? coolantTarget, coolantTarget, engineOn ? 0.35 : 0.2), 25, 130);
      const batteryTarget = engineOn ? randomBetween(profile.battery[0], profile.battery[1]) : randomBetween(12.2, 12.8);
      const batteryVoltage = clamp(approach(state.batteryVoltage ?? batteryTarget, batteryTarget, 0.05), 11.8, 14.4);
      const fuelLevel = clamp((state.fuelLevel ?? 100) - getFuelDeltaPercent(speed, rpm, engineLoad, engineOn), 0, 100);

      let gpsLat = state.gpsLat;
      let gpsLng = state.gpsLng;
      if ((gpsLat == null || gpsLng == null) && state.vehicle) {
        const companyLocation = normalizeCompanyLocation(state.vehicle.company?.settings);
        const gps = buildGpsPosition(state.vehicle, companyLocation);
        gpsLat = gps.lat;
        gpsLng = gps.lng;
      }

      let nextGps = { lat: gpsLat, lng: gpsLng, heading: meta.heading };
      if (gpsLat != null && gpsLng != null && speed > 0.4) {
        nextGps = moveCoordinate(gpsLat, gpsLng, speed, meta.heading);
        meta.heading = nextGps.heading;
      }

      const distance = computeDistanceFromSpeed(state, speed);
      const odometer = clamp((state.odometer ?? 0) + distance, state.odometer ?? 0, Number.MAX_SAFE_INTEGER);
      const engineHours = clamp((state.engineHours ?? 0) + (ignitionStatus ? CYCLE_SECONDS / 3600 : 0), state.engineHours ?? 0, Number.MAX_SAFE_INTEGER);
      const vehicleStatus = mapInternalStateToVehicleStatus(meta.currentState, speed);
      const maf = clamp(approach(state.maf ?? Math.max(0.5, rpm / 500), Math.max(0.5, rpm / 500 * 1.1), 4), 0.5, 30);
      const intakeTempTarget = clamp(coolantTemp - randomBetween(5, 10), 10, 115);
      const intakeTemp = clamp(approach(state.intakeTemp ?? intakeTempTarget, intakeTempTarget, 1), 10, 120);

      const updated = await prisma.vehicleLiveState.update({
        where: { vehicleId: state.vehicleId },
        data: {
          lastUpdate: new Date(),
          speed,
          rpm,
          coolantTemp,
          batteryVoltage,
          fuelLevel,
          engineLoad,
          maf,
          throttlePosition,
          intakeTemp,
          engineHours,
          odometer,
          gpsLat: nextGps.lat,
          gpsLng: nextGps.lng,
          ignitionStatus,
          vehicleStatus,
        },
      });

      await prisma.vehicle.update({ where: { id: state.vehicleId }, data: { odometer } });
      await broadcastLiveUpdate(io, state.vehicleId, mapLiveStateToRecord(updated), mapLiveStateToRecord(updated), state.vehicle.userId);

      const behaviorEvents = [];
      if (speedDelta < -4.5 && throttlePosition < (state.throttlePosition ?? 0) - 12 && Math.random() < 0.07) {
        behaviorEvents.push({
          eventType: 'HARSH_BRAKE',
          severity: 'MEDIUM',
          metadata: { speed: updated.speed, prevSpeed: state.speed, throttle: updated.throttlePosition },
        });
      }
      if (speedDelta > 4.5 && throttlePosition > (state.throttlePosition ?? 0) + 12 && Math.random() < 0.05) {
        behaviorEvents.push({
          eventType: 'HARSH_ACCEL',
          severity: 'MEDIUM',
          metadata: { speed: updated.speed, prevSpeed: state.speed, throttle: updated.throttlePosition },
        });
      }
      if (updated.speed > 100 && Math.random() < 0.04) {
        behaviorEvents.push({
          eventType: 'SPEEDING',
          severity: 'LOW',
          metadata: { speed: updated.speed, limit: 100 },
        });
      }

      if (behaviorEvents.length) {
        await prisma.driverBehaviorEvent.createMany({
          data: behaviorEvents.map((event) => ({
            vehicleId: state.vehicleId,
            eventType: event.eventType,
            severity: event.severity,
            metadata: event.metadata,
            latitude: updated.gpsLat,
            longitude: updated.gpsLng,
            simGenerated: true,
          })),
          skipDuplicates: true,
        });
      }
    } catch (error) {
      logger.error('Telemetry simulation failed for vehicle', { vehicleId: state.vehicleId, err: error.message });
    }
  });

  await Promise.all(updates);
}

export async function markStaleRealLiveSources(io) {
  logger.info('Real telemetry stale fallback disabled');
  return 0;
}

export function mapStateToLiveUpdate(state) {
  return mapLiveStateToRecord(state);
}
