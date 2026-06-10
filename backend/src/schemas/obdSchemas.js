import { z } from 'zod';

const optionalNumber = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  });

const telemetryFields = {
  rpm: optionalNumber,
  speed: optionalNumber,
  coolantTemp: optionalNumber,
  coolant_temp: optionalNumber,
  fuelLevel: optionalNumber,
  fuel_level: optionalNumber,
  batteryVoltage: optionalNumber,
  battery_voltage: optionalNumber,
  throttle: optionalNumber,
  engineLoad: optionalNumber,
  engine_load: optionalNumber,
  maf: optionalNumber,
  intakeTemp: optionalNumber,
  intake_temp: optionalNumber,
  latitude: optionalNumber,
  longitude: optionalNumber,
  altitude: optionalNumber,
  gpsAccuracy: optionalNumber,
  gps_accuracy: optionalNumber,
  heading: optionalNumber,
  gpsSpeed: optionalNumber,
  gps_speed: optionalNumber,
  deviceId: z.string().max(128).optional(),
  device_id: z.string().max(128).optional(),
  appVersion: z.string().max(32).optional(),
  app_version: z.string().max(32).optional(),
  signalStrength: optionalNumber,
  source: z.string().max(32).optional(),
  recordedAt: z.union([z.number(), z.string()]).optional(),
};

export const obdLiveDataSchema = z.object({
  body: z
    .object({
      vehicleId: z.string().uuid(),
      ...telemetryFields,
    })
    .passthrough(),
});

export const obdBatchSchema = z.object({
  body: z.object({
    vehicleId: z.string().uuid(),
    readings: z.array(z.object({ vehicleId: z.string().uuid().optional(), ...telemetryFields }).passthrough()).min(1).max(100),
    source: z.string().max(32).optional(),
  }),
});
