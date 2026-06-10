/** Approved OBD PIDs — FleetNimble production map */
export const APPROVED_PIDS = {
  RPM: { pid: '010C', field: 'rpm', label: 'RPM', unit: 'rpm', max: 8000 },
  SPEED: { pid: '010D', field: 'speed', label: 'Speed', unit: 'km/h', max: 200 },
  ENGINE_LOAD: { pid: '0104', field: 'engineLoad', label: 'Engine Load', unit: '%', max: 100 },
  COOLANT: { pid: '0105', field: 'coolantTemp', label: 'Coolant', unit: '°C', max: 120 },
  FUEL: { pid: '012F', field: 'fuelLevel', label: 'Fuel', unit: '%', max: 100 },
  MAF: { pid: '0110', field: 'maf', label: 'MAF', unit: 'g/s', max: 500 },
  INTAKE: { pid: '010F', field: 'intakeTemp', label: 'Intake Temp', unit: '°C', max: 80 },
  THROTTLE: { pid: '0111', field: 'throttle', label: 'Throttle', unit: '%', max: 100 },
  BATTERY: { pid: '0142', field: 'batteryVoltage', label: 'Battery', unit: 'V', max: 15 },
};

export const LIVE_GAUGE_FIELDS = Object.values(APPROVED_PIDS);
