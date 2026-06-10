/**
 * Telemetry Validation & Safety Guards
 * Ensures all telemetry values are numeric, within realistic ranges, and properly formatted
 */

// Safe number check - ensures value is finite and a number
export function isSafeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// Clamp value between min and max
export function clamp(value, min, max) {
  if (!isSafeNumber(value)) return min;
  return Math.min(Math.max(value, min), max);
}

// Safe number conversion - returns default if value is invalid
export function toSafeNumber(value, defaultValue = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : defaultValue;
}

// Validate and clamp individual telemetry fields
export function validateTelemetryField(fieldName, value) {
  const validators = {
    rpm: (v) => clamp(v, 0, 8000),
    speed: (v) => clamp(v, 0, 200),
    coolantTemp: (v) => clamp(v, -20, 130),
    batteryVoltage: (v) => clamp(v, 9, 15),
    fuelLevel: (v) => clamp(v, 0, 100),
    engineLoad: (v) => clamp(v, 0, 100),
    maf: (v) => clamp(v, 0, 30),
    throttlePosition: (v) => clamp(v, 0, 100),
    intakeTemp: (v) => clamp(v, -10, 120),
    engineHours: (v) => clamp(v, 0, 999999),
    odometer: (v) => clamp(v, 0, 9999999),
    gpsLat: (v) => (isSafeNumber(v) ? clamp(v, -90, 90) : undefined),
    gpsLng: (v) => (isSafeNumber(v) ? clamp(v, -180, 180) : undefined),
    ignitionStatus: (v) => Boolean(v),
  };

  const validator = validators[fieldName];
  if (!validator) return toSafeNumber(value);
  
  return validator(toSafeNumber(value));
}

// Validate entire telemetry object
export function validateTelemetryObject(telemetry) {
  const validated = {};
  
  const fields = [
    'rpm', 'speed', 'coolantTemp', 'batteryVoltage', 'fuelLevel',
    'engineLoad', 'maf', 'throttlePosition', 'intakeTemp', 'engineHours',
    'odometer', 'gpsLat', 'gpsLng', 'ignitionStatus'
  ];

  for (const field of fields) {
    if (field in telemetry) {
      const value = telemetry[field];
      validated[field] = validateTelemetryField(field, value);
    }
  }

  return validated;
}

// Format telemetry for display (frontend)
export function formatTelemetryValue(fieldName, value, decimals = 1) {
  const validated = validateTelemetryField(fieldName, value);
  
  if (!isSafeNumber(validated)) {
    return '—';
  }

  const formatters = {
    rpm: (v) => Math.round(v),
    speed: (v) => Math.round(v),
    coolantTemp: (v) => v.toFixed(1),
    batteryVoltage: (v) => v.toFixed(1),
    fuelLevel: (v) => v.toFixed(1),
    engineLoad: (v) => v.toFixed(1),
    maf: (v) => v.toFixed(2),
    throttlePosition: (v) => v.toFixed(1),
    intakeTemp: (v) => v.toFixed(1),
    engineHours: (v) => v.toFixed(1),
    odometer: (v) => Math.round(v),
  };

  const formatter = formatters[fieldName];
  return formatter ? formatter(validated) : validated.toFixed(decimals);
}

export default {
  isSafeNumber,
  clamp,
  toSafeNumber,
  validateTelemetryField,
  validateTelemetryObject,
  formatTelemetryValue,
};
