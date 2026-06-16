import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

const HEARTBEAT_STALE_MS = 90_000;
const TELEMETRY_LIVE_MS = 5_000;
const TELEMETRY_STALE_MS = 30_000;

/**
 * Resolve vehicle + device for MQTT ingest (cached per message).
 */
export async function loadVehicleContext(vehicleId) {
  return prisma.vehicle.findFirst({
    where: { id: vehicleId, deletedAt: null },
    include: {
      company: { select: { id: true, slug: true, name: true } },
      telematicsDevice: true,
      gpsLocation: true,
    },
  });
}

/**
 * Validate deviceId in payload matches provisioned telematics device.
 * HTTP ingest is unaffected — this only applies to MQTT path.
 */
export function assertDeviceAuthorized(vehicle, payload) {
  const device = vehicle.telematicsDevice;
  if (!device) {
    return { authorized: true, reason: 'no_provisioned_device' };
  }

  if (device.status === 'REVOKED') {
    return { authorized: false, reason: 'device_revoked' };
  }

  const payloadDeviceId = payload?.deviceId ?? payload?.device_id;
  if (payloadDeviceId && payloadDeviceId !== device.deviceUid) {
    return { authorized: false, reason: 'device_uid_mismatch' };
  }

  return { authorized: true, device };
}

export async function recordDeviceHeartbeat(deviceId, firmwareVersion) {
  await prisma.telematicsDevice.update({
    where: { id: deviceId },
    data: {
      lastHeartbeatAt: new Date(),
      lastSeenAt: new Date(),
      status: 'ACTIVE',
      ...(firmwareVersion ? { firmwareVersion } : {}),
    },
  });
}

export async function touchDeviceTelemetry(deviceId) {
  await prisma.telematicsDevice.update({
    where: { id: deviceId },
    data: { lastSeenAt: new Date(), status: 'ACTIVE' },
  });
}

/**
 * Build telemetry health summary for API / dashboard badges.
 */
export function buildTelemetryHealth(vehicle, device) {
  const now = Date.now();
  const lastObdAt = vehicle.lastObdAt ? new Date(vehicle.lastObdAt).getTime() : null;
  const lastHeartbeat = device?.lastHeartbeatAt
    ? new Date(device.lastHeartbeatAt).getTime()
    : null;
  const lastDeviceSeen = device?.lastSeenAt ? new Date(device.lastSeenAt).getTime() : null;

  let streamStatus = 'offline';
  if (lastObdAt != null) {
    const age = now - lastObdAt;
    if (age < TELEMETRY_LIVE_MS) streamStatus = 'live';
    else if (age < TELEMETRY_STALE_MS) streamStatus = 'stale';
  }

  let mqttStatus = 'none';
  if (device) {
    if (device.status === 'REVOKED') mqttStatus = 'revoked';
    else if (lastHeartbeat != null && now - lastHeartbeat < HEARTBEAT_STALE_MS) mqttStatus = 'online';
    else if (lastDeviceSeen != null && now - lastDeviceSeen < HEARTBEAT_STALE_MS) mqttStatus = 'online';
    else if (device.status === 'ACTIVE' || device.status === 'PROVISIONED') mqttStatus = 'offline';
    else mqttStatus = 'unknown';
  }

  return {
    telemetryOnline: vehicle.telemetryOnline,
    streamStatus,
    mqttStatus,
    lastObdAt: vehicle.lastObdAt,
    lastHeartbeatAt: device?.lastHeartbeatAt ?? null,
    lastDeviceSeenAt: device?.lastSeenAt ?? null,
    device: device
      ? {
          id: device.id,
          deviceUid: device.deviceUid,
          status: device.status,
          deviceType: device.deviceType,
          firmwareVersion: device.firmwareVersion,
        }
      : null,
  };
}

export async function markStaleMqttDevices(io) {
  const threshold = new Date(Date.now() - HEARTBEAT_STALE_MS);
  const stale = await prisma.telematicsDevice.findMany({
    where: {
      status: 'ACTIVE',
      vehicleId: { not: null },
      OR: [
        { lastHeartbeatAt: { lt: threshold } },
        { lastHeartbeatAt: null, lastSeenAt: { lt: threshold } },
        { lastHeartbeatAt: null, lastSeenAt: null },
      ],
    },
    include: { vehicle: { select: { id: true, userId: true, telemetryOnline: true } } },
  });

  for (const dev of stale) {
    if (!dev.vehicle) continue;
    if (io && dev.vehicle.telemetryOnline) {
      io.to(`vehicle:${dev.vehicle.id}`).emit('device:heartbeat', {
        vehicleId: dev.vehicle.id,
        mqttStatus: 'offline',
        lastHeartbeatAt: dev.lastHeartbeatAt,
      });
    }
  }

  return stale.length;
}
