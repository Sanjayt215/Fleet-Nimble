import logger from '../utils/logger.js';
import { config } from '../config/index.js';
import { MQTT_SUBSCRIPTIONS } from './topics.js';

/**
 * Tracks MQTT broker connection state, metrics, and subscription lifecycle.
 */
class MqttConnectionManager {
  constructor() {
    this.client = null;
    this.connected = false;
    this.lastConnectedAt = null;
    this.lastDisconnectedAt = null;
    this.lastError = null;
    this.reconnectAttempts = 0;
    this.messagesReceived = 0;
    this.subscriptions = [];
  }

  attachClient(client) {
    this.client = client;

    client.on('connect', () => this._onConnect());
    client.on('reconnect', () => {
      this.reconnectAttempts += 1;
      logger.info('MQTT reconnecting', { attempt: this.reconnectAttempts });
    });
    client.on('close', () => this._onDisconnect());
    client.on('error', (err) => {
      this.lastError = err.message;
      logger.error('MQTT connection error', { err: err.message });
    });
    client.on('offline', () => {
      this.connected = false;
      logger.warn('MQTT client offline');
    });
  }

  _onConnect() {
    this.connected = true;
    this.lastConnectedAt = new Date();
    this.reconnectAttempts = 0;
    this.lastError = null;
    logger.info('MQTT broker connected', { url: config.mqtt.url });
    this._subscribeAll();
  }

  _onDisconnect() {
    this.connected = false;
    this.lastDisconnectedAt = new Date();
    logger.warn('MQTT broker disconnected');
  }

  _subscribeAll() {
    if (!this.client?.connected) return;

    for (const sub of MQTT_SUBSCRIPTIONS) {
      this.client.subscribe(sub.topic, { qos: sub.qos }, (err) => {
        if (err) {
          logger.error('MQTT subscribe failed', { topic: sub.topic, err: err.message });
        } else {
          this.subscriptions.push(sub.topic);
          logger.debug('MQTT subscribed', { topic: sub.topic, qos: sub.qos });
        }
      });
    }
  }

  recordMessageReceived() {
    this.messagesReceived += 1;
  }

  getHealth() {
    return {
      enabled: config.mqtt.enabled,
      connected: this.connected,
      url: config.mqtt.url,
      clientId: config.mqtt.clientId,
      lastConnectedAt: this.lastConnectedAt,
      lastDisconnectedAt: this.lastDisconnectedAt,
      lastError: this.lastError,
      reconnectAttempts: this.reconnectAttempts,
      messagesReceived: this.messagesReceived,
      subscriptions: [...new Set(this.subscriptions)],
    };
  }

  getClient() {
    return this.client;
  }
}

export const mqttConnectionManager = new MqttConnectionManager();
