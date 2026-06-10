import fs from 'fs';
import mqtt from 'mqtt';
import logger from '../utils/logger.js';
import { config } from '../config/index.js';
import { mqttConnectionManager } from './connectionManager.js';
import { MqttMessageQueue } from './messageQueue.js';
import { handleMqttMessage } from './handlers/telemetryHandler.js';
import { enqueueDeadLetter } from './deadLetter.js';

let messageQueue = null;
let ioRef = null;

function buildConnectOptions() {
  const options = {
    clientId: config.mqtt.clientId,
    username: config.mqtt.username || undefined,
    password: config.mqtt.password || undefined,
    clean: true,
    reconnectPeriod: config.mqtt.reconnectPeriodMs,
    connectTimeout: config.mqtt.connectTimeoutMs,
    rejectUnauthorized: config.mqtt.rejectUnauthorized,
    keepalive: 60,
    protocolVersion: 4,
  };

  if (config.mqtt.caPath && fs.existsSync(config.mqtt.caPath)) {
    options.ca = fs.readFileSync(config.mqtt.caPath);
  }

  return options;
}

async function processMessage(item) {
  const { topic, payload } = item;
  try {
    await handleMqttMessage(topic, payload, ioRef);
  } catch (err) {
    let body;
    try {
      body = JSON.parse(payload.toString('utf8'));
    } catch {
      body = { raw: payload.toString('utf8').slice(0, 500) };
    }
    await enqueueDeadLetter(topic, body, err, 0);
    throw err;
  }
}

export function getMqttClient() {
  return mqttConnectionManager.getClient();
}

export function getMqttStats() {
  return {
    connection: mqttConnectionManager.getHealth(),
    queue: messageQueue?.getStats() ?? null,
  };
}

export async function startMqttConsumer(io) {
  if (!config.mqtt.enabled) {
    logger.info('MQTT consumer disabled (MQTT_ENABLED != true)');
    return null;
  }

  ioRef = io;
  messageQueue = new MqttMessageQueue(config.mqtt.concurrency, processMessage);

  const client = mqtt.connect(config.mqtt.url, buildConnectOptions());
  mqttConnectionManager.attachClient(client);

  client.on('message', (topic, payload, packet) => {
    mqttConnectionManager.recordMessageReceived();
    const qos = packet?.qos ?? 0;
    if (qos > 1) {
      logger.warn('MQTT QoS2 not supported — processing as QoS1', { topic });
    }
    messageQueue.enqueue({ topic, payload, qos });
  });

  return new Promise((resolve) => {
    client.once('connect', () => resolve(client));
    client.on('error', (err) => {
      logger.error('MQTT startup error', { err: err.message });
    });
  });
}

export async function retryDeadLetters(io) {
  const { fetchRetryBatch, markDeadLetterProcessed, markDeadLetterRetry } = await import('./deadLetter.js');
  const batch = await fetchRetryBatch(config.mqtt.deadLetterBatchSize);
  let processed = 0;

  for (const row of batch) {
    try {
      const payload = Buffer.from(JSON.stringify(row.payload));
      await handleMqttMessage(row.topic, payload, io);
      await markDeadLetterProcessed(row.id);
      processed += 1;
    } catch (err) {
      await markDeadLetterRetry(row.id, err, row.retryCount + 1);
    }
  }

  return processed;
}

export function stopMqttConsumer() {
  const client = mqttConnectionManager.getClient();
  if (client) {
    client.end(true);
  }
  ioRef = null;
  messageQueue = null;
}
