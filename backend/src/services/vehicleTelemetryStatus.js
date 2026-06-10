import {
  buildTelemetryHealth,
  loadVehicleContext,
} from './deviceAuthService.js';

/**
 * Attach telemetryHealth to vehicle API responses (HTTP routes unchanged).
 */
export function enrichVehicleWithTelemetry(vehicle) {
  if (!vehicle) return vehicle;
  const health = buildTelemetryHealth(vehicle, vehicle.telematicsDevice ?? null);
  const { telematicsDevice, ...rest } = vehicle;
  return { ...rest, telemetryHealth: health };
}

export function enrichVehicleList(vehicles) {
  return vehicles.map((v) => enrichVehicleWithTelemetry(v));
}

export { buildTelemetryHealth, loadVehicleContext };
