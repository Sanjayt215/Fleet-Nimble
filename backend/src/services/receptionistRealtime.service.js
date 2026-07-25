import { config } from '../config/index.js';
import logger from '../utils/logger.js';
import { RealtimeSessionManager } from './realtimeSessionManager.js';

const ACTIVE_SESSIONS = new Map();

export function registerSession(callSid, ws, metadata = {}) {
  // RSM is authoritative — create it first
  let mgr = RealtimeSessionManager.get(callSid);
  if (!mgr) {
    mgr = RealtimeSessionManager.create(callSid, ws, { ...metadata });
  }
  // Legacy session is a thin proxy over RSM
  const legacy = {
    callSid,
    ws,
    metadata: mgr.metadata,
    _rtmSession: mgr,
    get transcript() { return mgr.transcript; },
    set transcript(v) { mgr.transcript = v; },
    get providerSocket() { return mgr.providerSocket; },
    set providerSocket(v) { mgr.providerSocket = v; },
    get isActive() { return !mgr.closed; },
    set isActive(v) { if (!v) mgr.closed = true; },
    get startedAt() { return mgr.startedAt; },
    get lastActivityAt() { return mgr.lastActivity; },
    set lastActivityAt(v) { mgr.lastActivity = v; },
    get streamSid() { return mgr.streamSid; },
    set streamSid(v) { mgr.streamSid = v; },
    functionCalls: [],
    confirmedActions: [],
    get stopReconnect() { return mgr.stopReconnect; },
    set stopReconnect(v) { mgr.stopReconnect = v; },
    timers: [],
  };
  ACTIVE_SESSIONS.set(callSid, legacy);
  logger.info('REALTIME_SESSION_REGISTERED', { callSid });
  return legacy;
}

export function getSession(callSid) {
  return ACTIVE_SESSIONS.get(callSid);
}

export function removeSession(callSid) {
  // Always clean RSM first (authoritative)
  RealtimeSessionManager.remove(callSid);

  const session = ACTIVE_SESSIONS.get(callSid);
  if (session) {
    session.isActive = false;
    if (session.providerSocket) {
      try { session.providerSocket.close(); } catch (err) { logger.warn('REALTIME_PROVIDER_CLOSE_FAILED', { callSid, error: err.message }); }
    }
    ACTIVE_SESSIONS.delete(callSid);
    logger.info('REALTIME_SESSION_REMOVED', { callSid });
  }
}

export function updateSessionActivity(callSid) {
  const mgr = RealtimeSessionManager.get(callSid);
  if (mgr) mgr.updateActivity();

  const session = ACTIVE_SESSIONS.get(callSid);
  if (session) {
    session.lastActivityAt = Date.now();
  }
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
      transcriptLength: (session._rtmSession?.transcript || []).length,
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
    const rtm = session._rtmSession;
    if (rtm) {
      rtm.transcript.push({
        ...entry,
        timestamp: new Date().toISOString(),
      });
      if (rtm.transcript.length > 1000) {
        rtm.transcript = rtm.transcript.slice(-500);
      }
      rtm.updateActivity();
    } else {
      // Fallback if no RSM (shouldn't happen)
      session.transcript = session.transcript || [];
      session.transcript.push({
        ...entry,
        timestamp: new Date().toISOString(),
      });
      if (session.transcript.length > 1000) {
        session.transcript = session.transcript.slice(-500);
      }
    }
  }
}

export function setStreamSid(callSid, streamSid) {
  const mgr = RealtimeSessionManager.get(callSid);
  if (mgr) mgr.streamSid = streamSid;

  const session = ACTIVE_SESSIONS.get(callSid);
  if (session) {
    session.streamSid = streamSid;
  }
}

export function setProviderWs(callSid, ws) {
  const mgr = RealtimeSessionManager.get(callSid);
  if (mgr) mgr.providerSocket = ws;

  const session = ACTIVE_SESSIONS.get(callSid);
  if (session) {
    session.providerSocket = ws;
  }
}

export function cleanupStaleSessions(maxAgeMs = 600000) {
  const now = Date.now();
  let cleaned = 0;

  // RSM is authoritative for stale detection
  RealtimeSessionManager.cleanup(maxAgeMs);

  // Clean legacy sessions that RSM may have already removed
  const activeRsmSids = new Set((RealtimeSessionManager.getAll() || []).map(s => s.callSid));
  ACTIVE_SESSIONS.forEach((session, callSid) => {
    if (!activeRsmSids.has(callSid) || now - session.lastActivityAt > maxAgeMs) {
      if (!activeRsmSids.has(callSid)) {
        // RSM already cleaned this — just remove legacy
        ACTIVE_SESSIONS.delete(callSid);
        cleaned++;
      } else if (now - session.lastActivityAt > maxAgeMs) {
        removeSession(callSid);
        cleaned++;
      }
    }
  });

  if (cleaned > 0) {
    logger.info('STALE_SESSIONS_CLEANED', { count: cleaned });
  }
  return cleaned;
}

export { ACTIVE_SESSIONS };
