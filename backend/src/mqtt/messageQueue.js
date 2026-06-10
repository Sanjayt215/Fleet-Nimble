import logger from '../utils/logger.js';

/**
 * In-process MQTT message queue with bounded concurrency.
 * Prevents DB overload during telemetry bursts.
 */
export class MqttMessageQueue {
  constructor(concurrency, processor) {
    this.concurrency = Math.max(1, concurrency);
    this.processor = processor;
    this.queue = [];
    this.active = 0;
    this.stats = { enqueued: 0, processed: 0, failed: 0, dropped: 0 };
    this.maxQueueSize = 10_000;
  }

  enqueue(item) {
    if (this.queue.length >= this.maxQueueSize) {
      this.stats.dropped += 1;
      logger.error('MQTT queue full — dropping message', { topic: item.topic });
      return false;
    }
    this.stats.enqueued += 1;
    this.queue.push(item);
    this._drain();
    return true;
  }

  _drain() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      this.active += 1;
      this.processor(item)
        .then(() => {
          this.stats.processed += 1;
        })
        .catch((err) => {
          this.stats.failed += 1;
          logger.error('MQTT queue processor error', { topic: item.topic, err: err.message });
        })
        .finally(() => {
          this.active -= 1;
          this._drain();
        });
    }
  }

  getStats() {
    return {
      ...this.stats,
      pending: this.queue.length,
      active: this.active,
    };
  }
}
