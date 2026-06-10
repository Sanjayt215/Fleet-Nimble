const DTC_PREFIX = {
  0: 'P',
  1: 'C',
  2: 'B',
  3: 'U',
};

const DTC_DESCRIPTIONS = {
  P0100: 'Mass or Volume Air Flow Circuit Malfunction',
  P0101: 'Mass or Volume Air Flow Circuit Range/Performance',
  P0171: 'System Too Lean (Bank 1)',
  P0172: 'System Too Rich (Bank 1)',
  P0300: 'Random/Multiple Cylinder Misfire Detected',
  P0301: 'Cylinder 1 Misfire Detected',
  P0420: 'Catalyst System Efficiency Below Threshold',
  P0442: 'Evaporative Emission Control System Leak (small)',
  P0500: 'Vehicle Speed Sensor Malfunction',
  P0505: 'Idle Control System Malfunction',
  P0506: 'Idle Control System RPM Lower Than Expected',
  P0507: 'Idle Control System RPM Higher Than Expected',
  P0562: 'System Voltage Low',
  P0700: 'Transmission Control System Malfunction',
};

export function decodeDtcFromHex(bytes) {
  if (!bytes || bytes.length < 2) return null;
  const b1 = typeof bytes[0] === 'string' ? parseInt(bytes[0], 16) : bytes[0];
  const b2 = typeof bytes[1] === 'string' ? parseInt(bytes[1], 16) : bytes[1];
  const type = (b1 >> 6) & 0x03;
  const digit1 = (b1 >> 4) & 0x03;
  const digit2 = b1 & 0x0f;
  const digit3 = (b2 >> 4) & 0x0f;
  const digit4 = b2 & 0x0f;
  const prefix = DTC_PREFIX[type] || 'P';
  const code = `${prefix}${digit1}${digit2.toString(16).toUpperCase()}${digit3.toString(16).toUpperCase()}${digit4.toString(16).toUpperCase()}`;
  return code;
}

export function parseDtcResponse(raw) {
  const hex = raw
    ?.replace(/\r|\n|>/g, ' ')
    .replace(/NO DATA/gi, '')
    .trim()
    .toUpperCase();
  const parts = hex?.split(/\s+/).filter((p) => /^[0-9A-F]{2}$/.test(p)) || [];
  const codes = [];
  let i = 0;
  while (i < parts.length) {
    if (parts[i] === '43' || parts[i] === '47') {
      const count = parseInt(parts[i + 1], 16);
      i += 2;
      for (let j = 0; j < count && i + 1 < parts.length; j++) {
        const code = decodeDtcFromHex([parts[i], parts[i + 1]]);
        if (code) codes.push(code);
        i += 2;
      }
      continue;
    }
    if (/^[PCBU][0-9A-F]{4}$/.test(parts[i])) {
      codes.push(parts[i]);
    }
    i++;
  }
  return [...new Set(codes)];
}

export function getDtcDescription(code) {
  return DTC_DESCRIPTIONS[code?.toUpperCase()] || `Diagnostic trouble code ${code}`;
}

export function severityFromCode(code) {
  const c = code?.toUpperCase() || '';
  if (c.startsWith('P03') || c.startsWith('P07')) return 'CRITICAL';
  if (c.startsWith('P01') || c.startsWith('P04')) return 'HIGH';
  if (c.startsWith('P05')) return 'MEDIUM';
  return 'LOW';
}
