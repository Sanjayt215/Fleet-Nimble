import { z } from 'zod';
import prisma from '../../utils/prisma.js';
import logger from '../../utils/logger.js';
import { ingestObdReading } from '../../services/obdIngest.js';
import { broadcastLiveUpdate } from '../../services/telemetryBroadcast.js';
import { createDtcAlerts } from '../../services/alertEngine.js';
import { parseDtcResponse } from '../../utils/dtcDecoder.js';
import {
  loadVehicleContext,
  assertDeviceAuthorized,
  recordDeviceHeartbeat,
  touchDeviceTelemetry,
} from '../../services/deviceAuthService.js';
import { mapStateToLiveUpdate, updateLiveStateFromTelemetry } from '../../services/liveStateService.js';
import { processDriverBehavior } from '../../services/driverBehaviorService.js';
import { processFuelTrend } from '../../services/fuelTrendService.js';
import { parseTopic, validateTopicAccess } from '../topics.js';
import { isDuplicateMessage } from '../deduplication.js';

const telemetrySchema = z.object({
  messageId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  deviceId: z.string().optional(),
  timestamp: z.string().datetime().optional(),
  rpm: z.number().optional(),
  speed: z.number().optional(),
  coolantTemp: z.number().optional(),
  fuelLevel: z.number().optional(),
  batteryVoltage: z.number().optional(),
  throttle: z.number().optional(),
  engineLoad: z.number().optional(),
  maf: z.number().optional(),
  intakeTemp: z.number().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  altitude: z.number().optional(),
  heading: z.number().optional(),
  gpsAccuracy: z.number().optional(),
  gpsSpeed: z.number().optional(),
  readings: z.array(z.record(z.unknown())).optional(),
}).passthrough();

const behaviorSchema = z.object({
  messageId: z.string().uuid().optional(),
  type: z.enum(['HARSH_BRAKE', 'HARSH_ACCEL', 'IDLE', 'SPEEDING']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  metadata: z.record(z.unknown()).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  timestamp: z.string().datetime().optional(),
}).passthrough();

const dtcSchema = z.object({
  messageId: z.string().uuid().optional(),
  deviceId: z.string().optional(),
  codes: z.array(z.string()).optional(),
  rawResponse: z.string().optional(),
}).passthrough();

const heartbeatSchema = z.object({
  deviceId: z.string().optional(),
  firmwareVersion: z.string().optional(),
  signalStrength: z.number().optional(),
  timestamp: z.string().datetime().optional(),
}).passthrough();

async function resolveVehicle(parsed) {
  const vehicle = await loadVehicleContext(parsed.vehicleId);
  if (!vehicle) {
    logger.warn('MQTT unknown vehicle', { vehicleId: parsed.vehicleId, topic: parsed.raw });
    return null;
  }

  const access = validateTopicAccess(parsed, vehicle);
  if (!access.valid) {
    logger.warn('MQTT topic access denied', { reason: access.reason, topic: parsed.raw });
    return null;
  }

  return vehicle;
}

async function processObdPayload(vehicle, body, io) {
  const auth = assertDeviceAuthorized(vehicle, body);
  if (!auth.authorized) {
    logger.warn('MQTT device auth failed', { vehicleId: vehicle.id, reason: auth.reason });
    return;
  }

  if (auth.device) await touchDeviceTelemetry(auth.device.id);

  const readings = body.readings?.length
    ? body.readings
    : [body];

  let lastRecord = null;
  let lastTelemetry = null;

  for (const reading of readings) {
    const data = telemetrySchema.parse({ ...body, ...reading });
    if (data.messageId && await isDuplicateMessage(data.messageId, vehicle.id)) continue;

    const result = await ingestObdReading(vehicle.id, {
      ...data,
      vehicleId: vehicle.id,
      source: 'mqtt',
    }, {
      source: 'mqtt',
      deviceId: data.deviceId ?? auth.device?.deviceUid,
    });

    lastRecord = result.record;
    lastTelemetry = result.telemetry;
  }

  if (lastRecord && lastTelemetry) {
    const liveState = await updateLiveStateFromTelemetry(vehicle.id, lastTelemetry, 'REAL');
    await broadcastLiveUpdate(io, vehicle.id, mapStateToLiveUpdate(liveState), lastTelemetry, vehicle.userId);

    // Process driver behavior and fuel trends
    await Promise.all([
      processDriverBehavior(vehicle.id, lastTelemetry, io),
      processFuelTrend(vehicle.id, lastTelemetry),
    ]);
  }
}

async function processHeartbeat(vehicle, body, io) {
  const data = heartbeatSchema.parse(body);
  const auth = assertDeviceAuthorized(vehicle, data);
  if (!auth.authorized) {
    logger.warn('MQTT heartbeat auth failed', { vehicleId: vehicle.id, reason: auth.reason });
    return;
  }

  if (auth.device) {
    await recordDeviceHeartbeat(auth.device.id, data.firmwareVersion);
  }

  await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: { telemetryOnline: true, lastObdAt: new Date() },
  });

  if (io) {
    io.to(`vehicle:${vehicle.id}`).emit('device:heartbeat', {
      vehicleId: vehicle.id,
      mqttStatus: 'online',
      lastHeartbeatAt: new Date().toISOString(),
      firmwareVersion: data.firmwareVersion ?? null,
    });
    io.to(`user:${vehicle.userId}`).emit('device:heartbeat', {
      vehicleId: vehicle.id,
      mqttStatus: 'online',
      lastHeartbeatAt: new Date().toISOString(),
    });
  }
}

async function processDtc(vehicle, body, io) {
  const data = dtcSchema.parse(body);
  if (data.messageId && await isDuplicateMessage(data.messageId, vehicle.id)) return;

  const auth = assertDeviceAuthorized(vehicle, data);
  if (!auth.authorized) return;
  if (auth.device) await touchDeviceTelemetry(auth.device.id);

  const codes = data.codes?.length
    ? data.codes
    : data.rawResponse
      ? parseDtcResponse(data.rawResponse)
      : [];

  if (!codes.length) return;

  await createDtcAlerts(vehicle.id, codes, io);
  if (io) {
    io.to(`vehicle:${vehicle.id}`).emit('dtc:new', { vehicleId: vehicle.id, codes });
    io.to(`user:${vehicle.userId}`).emit('dtc:new', { vehicleId: vehicle.id, codes });
  }
}

async function processBehavior(vehicle, body, io) {
  const data = behaviorSchema.parse(body);
  if (data.messageId && await isDuplicateMessage(data.messageId, vehicle.id)) return;

  const auth = assertDeviceAuthorized(vehicle, data);
  if (!auth.authorized) return;
  if (auth.device) await touchDeviceTelemetry(auth.device.id);

  await prisma.driverBehaviorEvent.create({
    data: {
      vehicleId: vehicle.id,
      eventType: data.type,
      severity: data.severity || 'MEDIUM',
      metadata: data.metadata || {},
      latitude: data.latitude,
      longitude: data.longitude,
    },
  });

  if (io) {
    io.to(`vehicle:${vehicle.id}`).emit('behavior:new', { vehicleId: vehicle.id, ...data });
  }
}

async function processGps(vehicle, body, io) {
  const lat = body.latitude ?? body.lat;
  const lng = body.longitude ?? body.lng;
  if (lat == null || lng == null) return;

  const auth = assertDeviceAuthorized(vehicle, body);
  if (!auth.authorized) return;
  if (auth.device) await touchDeviceTelemetry(auth.device.id);

  const { record, telemetry } = await ingestObdReading(vehicle.id, {
    vehicleId: vehicle.id,
    latitude: lat,
    longitude: lng,
    altitude: body.altitude,
    heading: body.heading,
    gpsAccuracy: body.accuracy ?? body.gpsAccuracy,
    gpsSpeed: body.speed ?? body.gpsSpeed,
    source: 'mqtt-gps',
  }, { source: 'mqtt-gps', deviceId: body.deviceId });

  const liveState = await updateLiveStateFromTelemetry(vehicle.id, telemetry, 'REAL');
  await broadcastLiveUpdate(io, vehicle.id, mapStateToLiveUpdate(liveState), telemetry, vehicle.userId);

  // Process fuel trends for GPS updates
  await processFuelTrend(vehicle.id, telemetry);
}

/**
 * Main MQTT message router — all paths funnel into existing ingest + Socket.IO.
 */
export async function handleMqttMessage(topic, payloadBuffer, io) {
  const parsed = parseTopic(topic);
  if (!parsed) {
    logger.warn('MQTT invalid topic structure', { topic });
    return;
  }

  let body;
  try {
    body = JSON.parse(payloadBuffer.toString('utf8'));
  } catch {
    logger.warn('MQTT invalid JSON payload', { topic });
    return;
  }

  const vehicle = await resolveVehicle(parsed);
  if (!vehicle) return;

  const { channel, type } = parsed;

  if (channel === 'heartbeat') {
    await processHeartbeat(vehicle, body, io);
    return;
  }

  if (channel === 'telemetry' && type === 'obd') {
    await processObdPayload(vehicle, body, io);
    return;
  }

  if (channel === 'telemetry' && type === 'gps') {
    await processGps(vehicle, body, io);
    return;
  }

  if (channel === 'telemetry' && type === 'dtc') {
    await processDtc(vehicle, body, io);
    return;
  }

  if (channel === 'telemetry' && type === 'behavior') {
    await processBehavior(vehicle, body, io);
    return;
  }

  if (channel === 'status') {
    if (type === 'online' || type === 'offline') {
      logger.info('MQTT device status event', { vehicleId: vehicle.id, type, body });
      if (io) {
        io.to(`vehicle:${vehicle.id}`).emit('device:heartbeat', {
          vehicleId: vehicle.id,
          mqttStatus: type === 'online' ? 'online' : 'offline',
        });
      }
    }
  }
}

export { purgeExpiredDedup } from '../deduplication.js';
