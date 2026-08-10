import logger from '../../utils/logger.js';
import { cacheGet, cacheSet, cacheDel } from '../../utils/redis.js';
import { config } from '../../config/index.js';

const MEMORY_PREFIX = 'ma:mem:';
const IDEMPOTENCY_PREFIX = 'ma:idem:';
const inMemory = new Map();

export class MemoryStore {
  constructor({ ttlMs = 30 * 60 * 1000, idempotencyTtlSeconds = null } = {}) {
    this.ttlMs = ttlMs;
    this.idempotencyTtlSeconds = idempotencyTtlSeconds
      ?? config.multiAgent.idempotencyTtlSeconds;
    this.redisAvailable = true;
  }

  async saveMemory(memory) {
    const key = `${MEMORY_PREFIX}${memory.memoryId}`;
    const payload = memory.toPersistence();
    this._setLocal(key, payload);
    try {
      await cacheSet(key, payload, Math.ceil(this.ttlMs / 1000));
      this.redisAvailable = true;
    } catch {
      this.redisAvailable = false;
    }
    return payload;
  }

  async loadMemory(memoryId) {
    const key = `${MEMORY_PREFIX}${memoryId}`;
    const local = this._getLocal(key);
    if (local) return local;
    try {
      const remote = await cacheGet(key);
      if (remote) this._setLocal(key, remote);
      return remote || null;
    } catch {
      return null;
    }
  }

  async deleteMemory(memoryId) {
    const key = `${MEMORY_PREFIX}${memoryId}`;
    inMemory.delete(key);
    try {
      await cacheDel(key);
    } catch {
      /* optional */
    }
  }

  async claimIdempotency(idempotencyKey, { ttlSeconds = null } = {}) {
    const ttl = ttlSeconds ?? this.idempotencyTtlSeconds;
    const key = `${IDEMPOTENCY_PREFIX}${idempotencyKey}`;
    if (this._hasLocal(key)) return { alreadyProcessed: true, result: this._getLocal(key) };
    const existing = await cacheGet(key);
    if (existing) {
      this._setLocal(key, existing);
      return { alreadyProcessed: true, result: existing };
    }
    return { alreadyProcessed: false, result: null };
  }

  async recordIdempotency(idempotencyKey, result, { ttlSeconds = null } = {}) {
    const ttl = ttlSeconds ?? this.idempotencyTtlSeconds;
    const key = `${IDEMPOTENCY_PREFIX}${idempotencyKey}`;
    this._setLocal(key, result, ttl);
    try {
      await cacheSet(key, result, ttl);
    } catch {
      /* idempotency is best-effort in-memory when Redis is down */
    }
  }

  _setLocal(key, value, ttlSeconds = 0) {
    inMemory.set(key, { value, expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null });
    if (inMemory.size > 5000) {
      const oldest = inMemory.keys().next().value;
      inMemory.delete(oldest);
    }
  }

  _getLocal(key) {
    const entry = inMemory.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      inMemory.delete(key);
      return null;
    }
    return entry.value;
  }

  _hasLocal(key) {
    return this._getLocal(key) !== null;
  }

  getStats() {
    return {
      memoryEntries: inMemory.size,
      redisAvailable: this.redisAvailable,
      ttlMs: this.ttlMs,
      idempotencyTtlSeconds: this.idempotencyTtlSeconds,
    };
  }
}

const sharedStore = new MemoryStore();

export function getMemoryStore() {
  return sharedStore;
}

export function getMemoryStats() {
  return sharedStore.getStats();
}

logger.info('MEMORY_STORE_INITIALIZED', { prefix: MEMORY_PREFIX });
