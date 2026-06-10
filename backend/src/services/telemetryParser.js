import { parseLiveDataPayload } from '../utils/obdParser.js';

// OBD BACKUP — extended telemetry including GPS + device metadata
export function normalizeTelemetry(raw) {
  const parsed = parseLiveDataPayload(raw);
  return {
    rpm: toNum(parsed.rpm),
    speed: toNum(parsed.speed),
    coolantTemp: toNum(parsed.coolantTemp),
    fuelLevel: toNum(parsed.fuelLevel),
    batteryVoltage: toNum(parsed.batteryVoltage),
    throttle: toNum(parsed.throttle),
    engineLoad: toNum(parsed.engineLoad),
    maf: toNum(parsed.maf),
    intakeTemp: toNum(parsed.intakeTemp),
    latitude: toNum(raw.latitude),
    longitude: toNum(raw.longitude),
    altitude: toNum(raw.altitude),
    gpsAccuracy: toNum(raw.gpsAccuracy),
    heading: toNum(raw.heading),
    gpsSpeed: toNum(raw.gpsSpeed ?? raw.gps_speed),
    deviceId: raw.deviceId ?? raw.device_id ?? null,
    appVersion: raw.appVersion ?? raw.app_version ?? null,
    signalStrength: raw.signalStrength != null ? parseInt(raw.signalStrength, 10) : null,
    recordedAt: new Date(),
  };
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function detectAnomalies(data, thresholds = {}) {
  const t = {
    maxRpm: thresholds.maxRpm ?? 6500,
    maxSpeed: thresholds.maxSpeed ?? 130,
    maxCoolant: thresholds.maxCoolant ?? 105,
    minBattery: thresholds.minBattery ?? 11.5,
    minFuel: thresholds.minFuel ?? 10,
    ...thresholds,
  };
  const alerts = [];
  if (data.rpm != null && data.rpm > t.maxRpm) {
    alerts.push({ type: 'HIGH_RPM', message: `Engine RPM ${data.rpm} exceeds limit`, severity: 'HIGH' });
  }
  if (data.speed != null && data.speed > t.maxSpeed) {
    alerts.push({ type: 'OVERSPEED', message: `Speed ${data.speed} km/h exceeds limit`, severity: 'CRITICAL' });
  }
  if (data.coolantTemp != null && data.coolantTemp > t.maxCoolant) {
    alerts.push({ type: 'OVERHEAT', message: `Coolant ${data.coolantTemp}°C is high`, severity: 'CRITICAL' });
  }
  if (data.batteryVoltage != null && data.batteryVoltage < t.minBattery) {
    alerts.push({ type: 'LOW_BATTERY', message: `Battery ${data.batteryVoltage}V is low`, severity: 'MEDIUM' });
  }
  if (data.fuelLevel != null && data.fuelLevel < t.minFuel) {
    alerts.push({ type: 'LOW_FUEL', message: `Fuel level ${data.fuelLevel}% is low`, severity: 'MEDIUM' });
  }
  return alerts;
}
