import Redis from 'ioredis';
import { config } from '../config/index.js';
import logger from './logger.js';

let redis = null;
let redisUnavailableUntil = 0;
let lastRedisErrorAt = 0;

export function getRedis() {
  if (!redis) {
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    redis.on('error', (err) => {
      const now = Date.now();
      redisUnavailableUntil = now + 30000;
      if (now - lastRedisErrorAt > 30000) {
        logger.error('Redis error', { err: err.message });
        lastRedisErrorAt = now;
      }
    });
    redis.on('connect', () => logger.info('Redis connected'));
  }
  return redis;
}

async function withRedisConnection() {
  if (Date.now() < redisUnavailableUntil) return null;
  const client = getRedis();
  if (client.status === 'ready') return client;
  try {
    await client.connect();
    return client.status === 'ready' ? client : null;
  } catch {
    redisUnavailableUntil = Date.now() + 30000;
    return null;
  }
}

export async function cacheGet(key) {
  try {
    const client = await withRedisConnection();
    if (!client) return null;
    const val = await client.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds = 300) {
  try {
    const client = await withRedisConnection();
    if (!client) return;
    await client.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    /* cache optional */
  }
}

export async function cacheDel(key) {
  try {
    const client = await withRedisConnection();
    if (!client) return;
    await client.del(key);
  } catch {
    /* ignore */
  }
}
