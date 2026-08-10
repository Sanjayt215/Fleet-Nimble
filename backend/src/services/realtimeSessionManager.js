import logger from '../utils/logger.js';

const STATE = {
  IDLE: 'IDLE',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  GREETING: 'GREETING',
  LISTENING: 'LISTENING',
  RESPONDING: 'RESPONDING',
  CLOSING: 'CLOSING',
  CLOSED: 'CLOSED',
};

class RealtimeSession {
  constructor(callSid, twilioSocket, metadata = {}, onStateChange = null) {
    this.callSid = callSid;
    this.streamSid = null;
    this.providerSocket = null;
    this.twilioSocket = twilioSocket;
    this.startedAt = Date.now();
    this.lastActivity = Date.now();
    this.greetingSent = false;
    this.closed = false;
    this.state = STATE.IDLE;
    this.metadata = { ...metadata };
    this.transcript = [];
    this.reconnectCount = 0;
    this.audioBytesReceived = 0;
    this.audioBytesSent = 0;
    this.packetsReceived = 0;
    this.packetsSent = 0;
    this.droppedPackets = 0;
    this.latencyMs = [];
    this.stopReconnect = false;
    this.onStateChange = typeof onStateChange === 'function' ? onStateChange : null;
  }

  setState(newState) {
    const oldState = this.state;
    if (oldState === newState) return;
    this.state = newState;
    logger.info('SESSION_STATE_CHANGE', {
      callSid: this.callSid,
      from: oldState,
      to: newState,
    });
    if (this.onStateChange) {
      try {
        this.onStateChange({ from: oldState, to: newState, session: this });
      } catch (err) {
        logger.warn('SESSION_STATE_CHANGE_HOOK_FAILED', { callSid: this.callSid, error: err.message });
      }
    }
  }

  updateActivity() {
    this.lastActivity = Date.now();
  }

  isExpired(maxAgeMs) {
    return Date.now() - this.lastActivity > maxAgeMs;
  }

  addLatencySample(ms) {
    this.latencyMs.push(ms);
    if (this.latencyMs.length > 100) {
      this.latencyMs = this.latencyMs.slice(-100);
    }
  }

  getAverageLatency() {
    if (this.latencyMs.length === 0) return 0;
    return this.latencyMs.reduce((a, b) => a + b, 0) / this.latencyMs.length;
  }

  toJSON() {
    return {
      callSid: this.callSid,
      streamSid: this.streamSid,
      state: this.state,
      startedAt: this.startedAt,
      lastActivity: this.lastActivity,
      greetingSent: this.greetingSent,
      closed: this.closed,
      duration: Date.now() - this.startedAt,
      reconnectCount: this.reconnectCount,
      audioBytesReceived: this.audioBytesReceived,
      audioBytesSent: this.audioBytesSent,
      packetsReceived: this.packetsReceived,
      packetsSent: this.packetsSent,
      droppedPackets: this.droppedPackets,
      averageLatency: this.getAverageLatency(),
      transcriptLength: this.transcript.length,
    };
  }
}

const sessions = new Map();

export class RealtimeSessionManager {
  static STATES = STATE;

  static create(callSid, twilioSocket, metadata = {}, onStateChange = null) {
    if (sessions.has(callSid)) {
      logger.warn('SESSION_ALREADY_EXISTS', { callSid });
      return sessions.get(callSid);
    }
    const session = new RealtimeSession(callSid, twilioSocket, metadata, onStateChange);
    session.setState(STATE.IDLE);
    sessions.set(callSid, session);
    logger.info('SESSION_CREATED', { callSid });
    return session;
  }

  static get(callSid) {
    return sessions.get(callSid) || null;
  }

  static remove(callSid) {
    const session = sessions.get(callSid);
    if (session) {
      session.setState(STATE.CLOSED);
      session.closed = true;
      if (session.providerSocket) {
        try { session.providerSocket.close(); } catch (err) { logger.warn('SESSION_PROVIDER_CLOSE_FAILED', { callSid, error: err.message }); }
      }
      sessions.delete(callSid);
      logger.info('SESSION_DESTROYED', { callSid });
    }
    return session;
  }

  static getAll() {
    return Array.from(sessions.values());
  }

  static getCount() {
    return sessions.size;
  }

  static cleanup(maxAgeMs = 600000) {
    const now = Date.now();
    let cleaned = 0;
    sessions.forEach((session, callSid) => {
      if (session.isExpired(maxAgeMs)) {
        session.setState(STATE.CLOSED);
        session.closed = true;
        sessions.delete(callSid);
        cleaned++;
      }
    });
    if (cleaned > 0) {
      logger.info('STALE_SESSIONS_CLEANED', { count: cleaned });
    }
    return cleaned;
  }

  static getMetrics() {
    const all = Array.from(sessions.values());
    return {
      activeCalls: all.filter(s => !s.closed).length,
      totalSessions: all.length,
      totalAudioBytesReceived: all.reduce((a, s) => a + s.audioBytesReceived, 0),
      totalAudioBytesSent: all.reduce((a, s) => a + s.audioBytesSent, 0),
      totalPacketsReceived: all.reduce((a, s) => a + s.packetsReceived, 0),
      totalPacketsSent: all.reduce((a, s) => a + s.packetsSent, 0),
      totalDroppedPackets: all.reduce((a, s) => a + s.droppedPackets, 0),
      totalReconnects: all.reduce((a, s) => a + s.reconnectCount, 0),
      averageLatency: all.length > 0
        ? all.reduce((a, s) => a + s.getAverageLatency(), 0) / all.length
        : 0,
    };
  }

  static clearAll() {
    sessions.forEach((session, callSid) => {
      session.setState(STATE.CLOSED);
      session.closed = true;
    });
    sessions.clear();
    logger.info('ALL_SESSIONS_CLEARED');
  }
}
