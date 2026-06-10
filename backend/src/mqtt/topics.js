/**
 * MQTT topic parsing and validation.
 * Topics: fleet/{tenantId}/{vehicleId}/telemetry/{type}
 *         fleet/{tenantId}/{vehicleId}/heartbeat
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MQTT_SUBSCRIPTIONS = [
  { topic: 'fleet/+/+/telemetry/obd', qos: 1 },
  { topic: 'fleet/+/+/telemetry/gps', qos: 1 },
  { topic: 'fleet/+/+/telemetry/dtc', qos: 1 },
  { topic: 'fleet/+/+/telemetry/behavior', qos: 1 },
  { topic: 'fleet/+/+/heartbeat', qos: 1 },
  { topic: 'fleet/+/+/status/#', qos: 1 },
];

export function isValidVehicleId(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

export function isValidTenantId(id) {
  return typeof id === 'string' && id.length >= 1 && id.length <= 64 && /^[\w-]+$/.test(id);
}

/**
 * @returns {{ tenantId: string, vehicleId: string, channel: string, type: string, raw: string } | null}
 */
export function parseTopic(topic) {
  if (typeof topic !== 'string') return null;

  const parts = topic.split('/').filter((p) => p.length > 0);
  if (parts.length < 4 || parts[0] !== 'fleet') return null;

  const tenantId = parts[1];
  const vehicleId = parts[2];

  if (!isValidTenantId(tenantId) || !isValidVehicleId(vehicleId)) return null;

  if (parts.length === 4 && parts[3] === 'heartbeat') {
    return { tenantId, vehicleId, channel: 'heartbeat', type: 'ping', raw: topic };
  }

  if (parts.length < 5) return null;

  const channel = parts[3];
  const type = parts.slice(4).join('/');

  const allowedChannels = new Set(['telemetry', 'status', 'cmd']);
  if (!allowedChannels.has(channel)) return null;

  return { tenantId, vehicleId, channel, type, raw: topic };
}

export function validateTopicAccess(parsed, vehicle) {
  if (!parsed || !vehicle) return { valid: false, reason: 'missing_context' };

  if (vehicle.company?.slug && vehicle.company.slug !== parsed.tenantId) {
    return { valid: false, reason: 'tenant_mismatch' };
  }

  if (parsed.vehicleId !== vehicle.id) {
    return { valid: false, reason: 'vehicle_mismatch' };
  }

  return { valid: true };
}

export function telemetryObdTopic(tenantId, vehicleId) {
  return `fleet/${tenantId}/${vehicleId}/telemetry/obd`;
}

export function heartbeatTopic(tenantId, vehicleId) {
  return `fleet/${tenantId}/${vehicleId}/heartbeat`;
}

export function deviceCmdTopic(tenantId, vehicleId, cmd = 'config') {
  return `fleet/${tenantId}/${vehicleId}/cmd/${cmd}`;
}

export function devicePublishTopics(tenantId, vehicleId) {
  return [
    telemetryObdTopic(tenantId, vehicleId),
    `fleet/${tenantId}/${vehicleId}/telemetry/gps`,
    `fleet/${tenantId}/${vehicleId}/telemetry/dtc`,
    `fleet/${tenantId}/${vehicleId}/telemetry/behavior`,
    heartbeatTopic(tenantId, vehicleId),
    `fleet/${tenantId}/${vehicleId}/status/online`,
  ];
}
