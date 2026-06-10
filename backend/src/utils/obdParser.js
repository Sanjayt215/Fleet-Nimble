/**
 * OBD-II PID response parser (hex mode 01 responses)
 */

const PID_MAP = {
  '010C': { name: 'rpm', bytes: 2, formula: (a, b) => ((a * 256) + b) / 4 },
  '010D': { name: 'speed', bytes: 1, formula: (a) => a },
  '0105': { name: 'coolantTemp', bytes: 1, formula: (a) => a - 40 },
  '012F': { name: 'fuelLevel', bytes: 1, formula: (a) => (a * 100) / 255 },
  '0104': { name: 'engineLoad', bytes: 1, formula: (a) => (a * 100) / 255 },
  '0110': { name: 'maf', bytes: 2, formula: (a, b) => ((a * 256) + b) / 100 },
  '010F': { name: 'intakeTemp', bytes: 1, formula: (a) => a - 40 },
  '0111': { name: 'throttle', bytes: 1, formula: (a) => (a * 100) / 255 },
};

export function cleanHexResponse(raw) {
  if (!raw) return '';
  return raw
    .replace(/\r|\n|>/g, ' ')
    .replace(/SEARCHING\.\.\./gi, '')
    .replace(/NO DATA/gi, '')
    .trim()
    .toUpperCase();
}

export function parsePidResponse(pid, rawResponse) {
  const def = PID_MAP[pid?.toUpperCase()];
  if (!def) return null;

  const hex = cleanHexResponse(rawResponse).replace(/\s+/g, ' ');
  const parts = hex.split(' ').filter((p) => /^[0-9A-F]{2}$/.test(p));
  if (parts.length < 4) return null;

  const idx = parts.findIndex((p) => p === '41' || p === '49');
  const start = idx >= 0 ? idx + 2 : 2;
  const dataBytes = parts.slice(start, start + def.bytes).map((h) => parseInt(h, 16));
  if (dataBytes.some((n) => Number.isNaN(n))) return null;

  const value = def.formula(...dataBytes);
  return { pid, name: def.name, value: Math.round(value * 100) / 100 };
}

export function parseBatteryVoltage(raw) {
  const cleaned = raw?.replace(/V/gi, '').trim();
  const v = parseFloat(cleaned);
  return Number.isNaN(v) ? null : v;
}

export function parseVinResponse(raw) {
  const hex = cleanHexResponse(raw).replace(/\s+/g, '');
  const match = hex.match(/4902(?:[0-9A-F]){0,4}((?:[0-9A-F]{2})+)/);
  if (!match) {
    const ascii = raw?.replace(/[^A-Z0-9]/gi, '');
    if (ascii && ascii.length >= 11) return ascii.slice(0, 17);
    return null;
  }
  let vin = '';
  for (let i = 0; i < match[1].length; i += 2) {
    const code = parseInt(match[1].substr(i, 2), 16);
    if (code > 0 && code < 256) vin += String.fromCharCode(code);
  }
  return vin.replace(/\0/g, '').trim() || null;
}

export function parseLiveDataPayload(payload) {
  const result = {};
  if (typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      rpm: payload.rpm ?? null,
      speed: payload.speed ?? null,
      coolantTemp: payload.coolantTemp ?? payload.coolant_temp ?? null,
      fuelLevel: payload.fuelLevel ?? payload.fuel_level ?? null,
      batteryVoltage: payload.batteryVoltage ?? payload.battery_voltage ?? null,
      throttle: payload.throttle ?? null,
      engineLoad: payload.engineLoad ?? payload.engine_load ?? null,
      maf: payload.maf ?? null,
      intakeTemp: payload.intakeTemp ?? payload.intake_temp ?? null,
    };
  }
  return result;
}

export const ELM_INIT_COMMANDS = ['ATZ', 'ATE0', 'ATL0', 'ATH0', 'ATSP0'];
