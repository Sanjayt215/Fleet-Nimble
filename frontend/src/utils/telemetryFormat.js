/**
 * Frontend Telemetry Utilities
 * Mirrors backend validation - ensures safe display of telemetry values
 */

// Safe number check
export function isSafeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// Clamp value between min and max
export function clamp(value, min, max) {
  if (!isSafeNumber(value)) return min;
  return Math.min(Math.max(value, min), max);
}

// Get safe numeric value or default
export function toSafeNumber(value, defaultValue = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : defaultValue;
}

// Value ranges for validation
const RANGES = {
  rpm: { min: 0, max: 8000 },
  speed: { min: 0, max: 200 },
  coolantTemp: { min: -20, max: 150 },
  batteryVoltage: { min: 9, max: 15 },
  fuelLevel: { min: 0, max: 100 },
  engineLoad: { min: 0, max: 100 },
  maf: { min: 0, max: 30 },
  throttlePosition: { min: 0, max: 100 },
  intakeTemp: { min: -10, max: 120 },
  engineHours: { min: 0, max: 999999 },
  odometer: { min: 0, max: 9999999 },
};

// Validate a telemetry field
export function validateField(fieldName, value) {
  const range = RANGES[fieldName];
  if (!range) return toSafeNumber(value);
  return clamp(toSafeNumber(value), range.min, range.max);
}

// Format telemetry value for display
export function formatValue(fieldName, value) {
  const validated = validateField(fieldName, value);
  
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
  return formatter ? formatter(validated) : validated.toFixed(1);
}

// Format with unit
export function formatWithUnit(fieldName, value) {
  const formatted = formatValue(fieldName, value);
  if (formatted === '—') return '—';

  const units = {
    rpm: 'rpm',
    speed: 'km/h',
    coolantTemp: '°C',
    batteryVoltage: 'V',
    fuelLevel: '%',
    engineLoad: '%',
    maf: 'g/s',
    throttlePosition: '%',
    intakeTemp: '°C',
    engineHours: 'h',
    odometer: 'km',
  };

  const unit = units[fieldName];
  return unit ? `${formatted}${unit}` : formatted;
}

export function mergeTelemetry(prev = {}, next = {}) {
  const merged = { ...prev };
  let changed = false;

  const setField = (field, value) => {
    if (value === undefined) return;
    if (merged[field] !== value) {
      merged[field] = value;
      changed = true;
    }
  };

  if (next.vehicleId !== undefined) {
    setField('vehicleId', next.vehicleId);
    setField('vehicle_id', next.vehicleId);
  }
  if (next.vehicle_id !== undefined) {
    setField('vehicleId', next.vehicle_id);
    setField('vehicle_id', next.vehicle_id);
  }

  const numericFields = ['rpm', 'speed', 'coolantTemp', 'fuelLevel', 'batteryVoltage', 'engineLoad', 'maf', 'intakeTemp'];
  numericFields.forEach((field) => {
    if (next[field] !== undefined) {
      setField(field, next[field]);
    }
  });

  if (next.throttlePosition !== undefined) {
    setField('throttlePosition', next.throttlePosition);
    setField('throttle', next.throttlePosition);
  }
  if (next.throttle !== undefined) {
    setField('throttlePosition', next.throttle);
    setField('throttle', next.throttle);
  }

  if (next.latitude !== undefined) {
    setField('latitude', next.latitude);
    setField('gpsLat', next.latitude);
  }
  if (next.longitude !== undefined) {
    setField('longitude', next.longitude);
    setField('gpsLng', next.longitude);
  }
  if (next.gpsLat !== undefined) {
    setField('latitude', next.gpsLat);
    setField('gpsLat', next.gpsLat);
  }
  if (next.gpsLng !== undefined) {
    setField('longitude', next.gpsLng);
    setField('gpsLng', next.gpsLng);
  }

  if (next.recordedAt !== undefined) setField('recordedAt', next.recordedAt);
  if (next.lastUpdate !== undefined) setField('recordedAt', next.lastUpdate);
  if (next.vehicleStatus !== undefined) setField('vehicleStatus', next.vehicleStatus);
  if (next.telemetryOnline !== undefined) setField('telemetryOnline', next.telemetryOnline);

  return changed ? merged : prev;
}

export default {
  isSafeNumber,
  clamp,
  toSafeNumber,
  validateField,
  formatValue,
  formatWithUnit,
  mergeTelemetry,
};
