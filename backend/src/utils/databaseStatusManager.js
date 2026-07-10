import prisma from './prisma.js';
import { config } from '../config/index.js';
import logger from './logger.js';

const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 30000;
const BACKOFF_MULTIPLIER = 2;

let status = {
  state: 'connecting',
  lastError: null,
  lastCheckedAt: null,
  attempt: 0,
};

let retryTimer = null;

function safeDatabaseUrlInfo() {
  const url = process.env.DATABASE_URL || '';
  if (!url) {
    return { configured: false, protocol: null, hostnameConfigured: false, databaseConfigured: false };
  }
  try {
    const parsed = new URL(url);
    return {
      configured: true,
      protocol: parsed.protocol.replace(':', ''),
      hostnameConfigured: Boolean(parsed.hostname),
      databaseConfigured: Boolean(parsed.pathname && parsed.pathname.length > 1),
    };
  } catch {
    return { configured: false, protocol: null, hostnameConfigured: false, databaseConfigured: false };
  }
}

async function attemptConnect() {
  status.attempt++;
  status.lastCheckedAt = new Date().toISOString();
  try {
    await prisma.$connect();
    status.state = 'connected';
    status.lastError = null;
    status.attempt = 0;
    logger.info('DATABASE_CONNECTED');
    clearRetry();
    return true;
  } catch (err) {
    status.state = 'degraded';
    status.lastError = err.message;
    logger.error('DATABASE_CONNECT_FAILED', { attempt: status.attempt, error: err.message });
    scheduleRetry();
    return false;
  }
}

function scheduleRetry() {
  clearRetry();
  const delay = Math.min(INITIAL_RETRY_MS * Math.pow(BACKOFF_MULTIPLIER, status.attempt - 1), MAX_RETRY_MS);
  retryTimer = setTimeout(() => {
    attemptConnect();
  }, delay);
}

function clearRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function start() {
  logger.info('DATABASE_CONNECTION_INITIATED');
  logger.info('DATABASE_CONFIG_STATUS', safeDatabaseUrlInfo());
  attemptConnect();
}

function stop() {
  clearRetry();
  status.state = 'disconnected';
}

function getStatus() {
  return {
    state: status.state,
    lastError: status.lastError,
    lastCheckedAt: status.lastCheckedAt,
    attempt: status.attempt,
  };
}

function isReady() {
  return status.state === 'connected';
}

export { start, stop, getStatus, isReady };
