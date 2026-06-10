/**
 * Parse OBD-II hex PID responses from ELM327
 */

export function parseHexResponse(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, '').replace(/>/g, '').toUpperCase();
  const match = cleaned.match(/41([0-9A-F]{2})([0-9A-F]+)/);
  if (!match) return null;
  return {
    mode: '41',
    pid: match[1],
    data: match[2],
    bytes: match[2].match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) || [],
  };
}

export function parseRpm(bytes) {
  if (!bytes || bytes.length < 2) return null;
  return ((bytes[0] * 256) + bytes[1]) / 4;
}

export function parseSpeed(bytes) {
  if (!bytes || bytes.length < 1) return null;
  return bytes[0];
}

export function parseCoolantTemp(bytes) {
  if (!bytes || bytes.length < 1) return null;
  return bytes[0] - 40;
}

export function parseFuelLevel(bytes) {
  if (!bytes || bytes.length < 1) return null;
  return (bytes[0] * 100) / 255;
}

export function parseEngineLoad(bytes) {
  if (!bytes || bytes.length < 1) return null;
  return (bytes[0] * 100) / 255;
}

export function parseMaf(bytes) {
  if (!bytes || bytes.length < 2) return null;
  return ((bytes[0] * 256) + bytes[1]) / 100;
}

export function parseIntakeTemp(bytes) {
  if (!bytes || bytes.length < 1) return null;
  return bytes[0] - 40;
}

export function parseThrottle(bytes) {
  if (!bytes || bytes.length < 1) return null;
  return (bytes[0] * 100) / 255;
}

export function parseBatteryVoltage(raw) {
  if (!raw) return null;
  const v = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return isNaN(v) ? null : v;
}

const PID_PARSERS = {
  '0C': parseRpm,
  '0D': parseSpeed,
  '05': parseCoolantTemp,
  '2F': parseFuelLevel,
  '04': parseEngineLoad,
  '10': parseMaf,
  '0F': parseIntakeTemp,
  '11': parseThrottle,
};

export function parsePidResponse(pid, hexResponse) {
  const parsed = parseHexResponse(hexResponse);
  if (!parsed) return null;
  const parser = PID_PARSERS[parsed.pid] || PID_PARSERS[pid?.toUpperCase()?.slice(-2)];
  if (!parser) return { raw: parsed };
  return { value: parser(parsed.bytes), pid: parsed.pid };
}

export function parseLiveDataPayload(payload) {
  const result = {};
  if (payload.rpm != null) result.rpm = Number(payload.rpm);
  if (payload.speed != null) result.speed = Number(payload.speed);
  if (payload.coolantTemp != null) result.coolantTemp = Number(payload.coolantTemp);
  if (payload.fuelLevel != null) result.fuelLevel = Number(payload.fuelLevel);
  if (payload.batteryVoltage != null) result.batteryVoltage = Number(payload.batteryVoltage);
  if (payload.throttle != null) result.throttle = Number(payload.throttle);
  if (payload.engineLoad != null) result.engineLoad = Number(payload.engineLoad);
  if (payload.maf != null) result.maf = Number(payload.maf);
  if (payload.intakeTemp != null) result.intakeTemp = Number(payload.intakeTemp);
  return result;
}
