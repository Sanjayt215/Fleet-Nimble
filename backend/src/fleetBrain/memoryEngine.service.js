import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { config } from '../config/index.js';
import { emitToUser } from '../utils/socketHub.js';
import { isPersistenceAvailable } from '../services/receptionistTenantResolver.service.js';

/**
 * Fleet Brain Memory Engine.
 * Layered memory: short-term (in-memory, TTL) -> long-term (DB). Scopes:
 * LONG_TERM | SHORT_TERM | CONVERSATION | BUSINESS | CUSTOMER | FLEET.
 * Reads cascade so no context is ever lost; writes go through the brain.
 */

const SHORT_TERM = new Map();

export const MEMORY_SCOPES = Object.freeze({
  LONG_TERM: 'LONG_TERM',
  SHORT_TERM: 'SHORT_TERM',
  CONVERSATION: 'CONVERSATION',
  BUSINESS: 'BUSINESS',
  CUSTOMER: 'CUSTOMER',
  FLEET: 'FLEET',
});

const SHORT_TERM_SCOPES = new Set([MEMORY_SCOPES.SHORT_TERM, MEMORY_SCOPES.CONVERSATION]);

export function memoryKey(userId, scope, key) {
  return `${userId}:${scope}:${key}`;
}

export async function remember({ userId, companyId = null, customerId = null, scope = MEMORY_SCOPES.SHORT_TERM, key, value, ttlSec = null }) {
  if (!userId || !key) return null;
  const expiresAt = ttlSec ? new Date(Date.now() + ttlSec * 1000) : null;
  const shortTtl = ttlSec || (scope === MEMORY_SCOPES.SHORT_TERM ? config.fleetBrain.shortTermMemoryTtlSec : null);

  if (SHORT_TERM_SCOPES.has(scope) || !isPersistenceAvailable()) {
    SHORT_TERM.set(memoryKey(userId, scope, key), {
      userId, companyId, customerId, scope, key, value, expiresAt,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    trimShortTerm();
  }

  if (scope !== MEMORY_SCOPES.SHORT_TERM && config.fleetBrain.persistMemory && isPersistenceAvailable()) {
    try {
      const data = { userId, companyId, customerId, scope, key, value, ttlSec: shortTtl, expiresAt };
      await prisma.fleetBrainMemoryItem.upsert({
        where: { userId_scope_key: { userId, scope, key } },
        update: { value, ttlSec: shortTtl, expiresAt },
        create: data,
      });
    } catch (err) {
      logger.warn('FLEET_BRAIN_MEMORY_PERSIST_FAILED', { userId, scope, key, error: err.message });
    }
  }

  emitToUser(userId, 'fleetbrain.memory', { scope, key, at: new Date().toISOString() });
  return { scope, key };
}

export async function recall({ userId, scope = null, key = null, customerId = null }) {
  if (!userId) return null;

  const scopes = scope ? [scope] : Object.values(MEMORY_SCOPES);
  for (const s of scopes) {
    if (key) {
      const short = SHORT_TERM.get(memoryKey(userId, s, key));
      if (short && !isExpired(short)) return { source: 'short_term', ...short };
    } else {
      const matches = Array.from(SHORT_TERM.values())
        .filter(m => m.userId === userId && m.scope === s && (!customerId || m.customerId === customerId))
        .filter(m => !isExpired(m))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      if (matches.length > 0) return { source: 'short_term', ...matches[0] };
    }
  }

  if (!scope || !key) return null;
  if (!isPersistenceAvailable()) return null;
  try {
    const row = await prisma.fleetBrainMemoryItem.findUnique({
      where: { userId_scope_key: { userId, scope, key } },
    });
    if (!row) return null;
    if (row.expiresAt && new Date(row.expiresAt) < new Date()) return null;
    return { source: 'long_term', ...row };
  } catch (err) {
    logger.warn('FLEET_BRAIN_MEMORY_RECALL_FAILED', { userId, scope, key, error: err.message });
    return null;
  }
}

export async function recallAll({ userId, scope = null, customerId = null }) {
  if (!userId) return [];
  const scopes = scope ? [scope] : Object.values(MEMORY_SCOPES);
  const results = [];
  for (const s of scopes) {
    for (const m of SHORT_TERM.values()) {
      if (m.userId === userId && m.scope === s && !isExpired(m) && (!customerId || m.customerId === customerId)) {
        results.push(m);
      }
    }
  }
  if (isPersistenceAvailable() && config.fleetBrain.persistMemory) {
    try {
      const rows = await prisma.fleetBrainMemoryItem.findMany({
        where: {
          userId,
          ...(scope ? { scope } : {}),
          ...(customerId ? { customerId } : {}),
        },
      });
      for (const row of rows) {
        if (!results.some(r => r.key === row.key && r.scope === row.scope)) results.push(row);
      }
    } catch (err) {
      logger.warn('FLEET_BRAIN_MEMORY_RECALL_ALL_FAILED', { userId, error: err.message });
    }
  }
  return results.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

export function forget({ userId, scope = null, key = null }) {
  if (!userId) return 0;
  let removed = 0;
  for (const [k, m] of SHORT_TERM.entries()) {
    if (m.userId === userId && (!scope || m.scope === scope) && (!key || m.key === key)) {
      SHORT_TERM.delete(k);
      removed++;
    }
  }
  return removed;
}

export function getMemoryStats() {
  const now = Date.now();
  let expired = 0;
  let active = 0;
  for (const m of SHORT_TERM.values()) {
    if (isExpired(m)) expired++;
    else active++;
  }
  return { shortTermEntries: active, expiredEntries: expired };
}

function isExpired(entry) {
  if (!entry?.expiresAt) return false;
  return new Date(entry.expiresAt).getTime() < Date.now();
}

function trimShortTerm() {
  if (SHORT_TERM.size <= 5000) return;
  const now = Date.now();
  for (const [k, m] of SHORT_TERM.entries()) {
    if (SHORT_TERM.size <= 4000) break;
    if (isExpired(m)) {
      SHORT_TERM.delete(k);
      continue;
    }
    SHORT_TERM.delete(k);
  }
}

export async function saveConversationMemory({ userId, callId = null, customerId = null, summary, keyFacts = [] }) {
  if (!userId) return null;
  await remember({
    userId, customerId, scope: MEMORY_SCOPES.CONVERSATION,
    key: callId ? `call:${callId}` : `latest:${customerId || 'anon'}`,
    value: { summary, keyFacts },
    ttlSec: config.fleetBrain.shortTermMemoryTtlSec,
  });
  return true;
}

export async function loadCustomerMemory(userId, customerId) {
  if (!customerId) return null;
  const rows = await recallAll({ userId, customerId });
  const memory = {};
  for (const row of rows) {
    memory[row.key] = row.value;
  }
  return memory;
}
