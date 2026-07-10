import { config } from '../config/index.js';
import logger from '../utils/logger.js';
import { RealtimeSessionManager } from './realtimeSessionManager.js';

const ACTIVE_SESSIONS = new Map();

export function registerSession(callSid, ws, metadata = {}) {
  const mgr = RealtimeSessionManager.create(callSid, ws, metadata);
  const legacy = {
    callSid,
    ws,
    metadata,
    transcript: [],
    openaiWs: null,
    isActive: true,
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
    streamSid: null,
    functionCalls: [],
    confirmedActions: [],
    get stopReconnect() { return mgr.stopReconnect; },
    set stopReconnect(v) { mgr.stopReconnect = v; },
  };
  ACTIVE_SESSIONS.set(callSid, legacy);
  logger.info('REALTIME_SESSION_REGISTERED', { callSid });
  return legacy;
}

export function getSession(callSid) {
  return ACTIVE_SESSIONS.get(callSid);
}

export function removeSession(callSid) {
  const session = ACTIVE_SESSIONS.get(callSid);
  if (session) {
    session.isActive = false;
    if (session.openaiWs) {
      try { session.openaiWs.close(); } catch { }
    }
    ACTIVE_SESSIONS.delete(callSid);
    logger.info('REALTIME_SESSION_REMOVED', { callSid });
  }
  RealtimeSessionManager.remove(callSid);
}

export function updateSessionActivity(callSid) {
  const session = ACTIVE_SESSIONS.get(callSid);
  if (session) {
    session.lastActivityAt = Date.now();
  }
  const mgr = RealtimeSessionManager.get(callSid);
  if (mgr) mgr.updateActivity();
}

export function getActiveSessions() {
  const sessions = [];
  ACTIVE_SESSIONS.forEach((session, callSid) => {
    sessions.push({
      callSid,
      startedAt: session.startedAt,
      duration: Date.now() - session.startedAt,
      isActive: session.isActive,
      streamSid: session.streamSid,
      metadata: session.metadata,
      transcriptLength: session.transcript.length,
    });
  });
  return sessions;
}

export function getActiveSessionsCount() {
  return ACTIVE_SESSIONS.size;
}

export function addTranscriptEntry(callSid, entry) {
  const session = ACTIVE_SESSIONS.get(callSid);
  if (session) {
    session.transcript.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    if (session.transcript.length > 1000) {
      session.transcript = session.transcript.slice(-500);
    }
    session.lastActivityAt = Date.now();
  }
}

export function setStreamSid(callSid, streamSid) {
  const session = ACTIVE_SESSIONS.get(callSid);
  if (session) {
    session.streamSid = streamSid;
  }
  const mgr = RealtimeSessionManager.get(callSid);
  if (mgr) mgr.streamSid = streamSid;
}

export function setOpenaiWs(callSid, ws) {
  const session = ACTIVE_SESSIONS.get(callSid);
  if (session) {
    session.openaiWs = ws;
  }
  const mgr = RealtimeSessionManager.get(callSid);
  if (mgr) mgr.openAiSocket = ws;
}

export function cleanupStaleSessions(maxAgeMs = 600000) {
  const now = Date.now();
  let cleaned = 0;
  ACTIVE_SESSIONS.forEach((session, callSid) => {
    if (now - session.lastActivityAt > maxAgeMs) {
      removeSession(callSid);
      cleaned++;
    }
  });
  if (cleaned > 0) {
    logger.info('STALE_SESSIONS_CLEANED', { count: cleaned });
  }
  RealtimeSessionManager.cleanup(maxAgeMs);
  return cleaned;
}

export { ACTIVE_SESSIONS };
