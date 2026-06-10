/**
 * End-to-end MQTT → PostgreSQL → API validation script.
 *
 * Usage:
 *   node scripts/mqtt-e2e-test.js
 *
 * Env:
 *   MQTT_URL, API_URL, VEHICLE_ID, TENANT_ID (default: default)
 */
import mqtt from 'mqtt';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
const API_URL = process.env.API_URL || 'http://localhost:5000/api';
const VEHICLE_ID = process.env.VEHICLE_ID || '00000000-0000-0000-0000-000000000001';
const TENANT_ID = process.env.TENANT_ID || 'default';

const topicObd = `fleet/${TENANT_ID}/${VEHICLE_ID}/telemetry/obd`;
const topicHeartbeat = `fleet/${TENANT_ID}/${VEHICLE_ID}/heartbeat`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchLatest() {
  const login = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@fleetnimble.com', password: 'Admin123!' }),
  });
  const loginJson = await login.json();
  if (!loginJson.success) throw new Error(`Login failed: ${JSON.stringify(loginJson)}`);

  const token = loginJson.data.accessToken;
  const res = await fetch(`${API_URL}/obd/latest/${VEHICLE_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function main() {
  console.log('MQTT E2E Test');
  console.log('  Broker:', MQTT_URL);
  console.log('  Topic:', topicObd);

  const messageId = randomUUID();
  const payload = {
    messageId,
    rpm: 2100,
    speed: 55,
    coolantTemp: 88,
    fuelLevel: 62,
    batteryVoltage: 13.8,
    engineLoad: 28,
    source: 'mqtt-e2e-test',
  };

  await new Promise((resolve, reject) => {
    const client = mqtt.connect(MQTT_URL, {
      clientId: `e2e-test-${Date.now()}`,
      reconnectPeriod: 0,
      connectTimeout: 10_000,
    });

    client.on('connect', () => {
      client.publish(topicObd, JSON.stringify(payload), { qos: 1 }, (err) => {
        if (err) reject(err);
        else {
          console.log('  Published OBD telemetry (QoS 1)');
          client.publish(topicHeartbeat, JSON.stringify({ firmwareVersion: 'e2e-1.0' }), { qos: 1 }, () => {
            console.log('  Published heartbeat');
            client.end();
            resolve();
          });
        }
      });
    });

    client.on('error', reject);
  });

  console.log('  Waiting for ingest…');
  await sleep(3000);

  const latest = await fetchLatest();
  if (!latest.success || !latest.data) {
    console.error('FAIL: No telemetry in API response');
    console.error(JSON.stringify(latest, null, 2));
    process.exit(1);
  }

  const rpm = latest.data.rpm;
  if (rpm !== payload.rpm) {
    console.error(`FAIL: RPM mismatch API=${rpm} expected=${payload.rpm}`);
    process.exit(1);
  }

  console.log('PASS: MQTT → PostgreSQL → REST API');
  console.log('  RPM:', rpm);
  console.log('  telemetryOnline:', latest.data.telemetryOnline);
  console.log('  telemetryHealth:', latest.data.telemetryHealth?.streamStatus);
  console.log('');
  console.log('Next: open dashboard Live OBD and confirm gauges update via Socket.IO');
}

main().catch((err) => {
  console.error('E2E test error:', err.message);
  process.exit(1);
});
