# Session Manager Audit — AI Receptionist

## Two Session Tracking Systems

| System | File | Type | Used By |
|--------|------|------|---------|
| Legacy `ACTIVE_SESSIONS` | `receptionistRealtime.service.js` | Module-level `Map` | `addTranscriptEntry()`, `setOpenaiWs()`, `updateSessionState()`, `clearSession()`, etc. |
| Modern `RealtimeSessionManager` | `realtimeSessionManager.js` | Class with `Map` | `mediaStreamHandler.js`, `handleMediaStream()`, session lifecycle management |

## Legacy `ACTIVE_SESSIONS` (Module-level Map)

```
ACTIVE_SESSIONS: Map<string, {
  callSid: string,
  ws: WebSocket (Twilio),
  openaiWs: WebSocket (provider),
  twilioCallSid: string,
  streamSid: string,
  transcriptEntries: [],
  pendingTranscriptFlush: { entries },
  callStartTime: Date,
  greeting: string,
  metadata: {},
  userId: string,
  companyId: string,
  state: string,
  config: {},
  provider: string,
}>
```

**Used by methods:**
- `beginSession()` — creates entry
- `setOpenaiWs()` — stores provider WS reference
- `addTranscriptEntry()` — buffers transcript entries (sends every 5 entries to DB)
- `updateSessionState()` — updates state field
- `getSession()` — retrieves entry
- `clearSession()` — removes entry, flushes transcript buffer
- `cleanupStaleSessions()` — cron job to clear sessions older than 30 min

## Modern `RealtimeSessionManager`

```
RealtimeSessionManager {
  sessions: Map<string, RealtimeSession>
}

RealtimeSession {
  callSid: string,
  ws: WebSocket (Twilio),
  provider: RealtimeVoiceProvider,
  streamSid: string | null,
  twilioCallSid: string | null,
  state: SESSION_STATES (INITIALIZED | CONNECTING | CONNECTED | ACTIVE | ENDED | ERROR),
  metrics: { startTime, audioBytesSent, audioBytesReceived, transcriptCount, toolCallCount },
  userId: string,
  companyId: string,
  config: {},
  createdAt: Date,
  lastActivityAt: Date,
}
```

**Methods:**
- `createSession()` — new session, stores in Map
- `getSession()` — retrieves
- `updateState()` — validates state transitions, updates lastActivityAt
- `updateStreamInfo()` — sets streamSid, twilioCallSid
- `setProvider()` — sets provider reference
- `getMetrics()` — returns computed metrics
- `removeSession()` — removes from Map, emits 'sessionEnded'
- `getActiveCount()` — returns count
- `getActiveSessions()` — returns active session list
- `cleanupStaleSessions()` — cron job, 30 min timeout
- `_isValidTransition()` — enforces valid state machine transitions

## State Machine

```
INITIALIZED → CONNECTING → CONNECTED → ACTIVE → ENDED
                                         ↓
                                       ERROR
INITIALIZED → ERROR (direct on failure)
```

## Issues

| Issue | Severity | Details |
|-------|----------|---------|
| **Dual tracking** | MEDIUM | Both systems track the same call; they can get out of sync if one is updated without the other |
| **Legacy session still heavily used** | HIGH | `addTranscriptEntry()` and `clearSession()` only operate on the legacy session; modern session does not have transcript buffering |
| **`clearSession` calls modern `removeSession`** | OK | But only after its own operations; if modern session fails to remove, legacy cleanup still runs |
| **State transition validation** | OK | `_isValidTransition` correctly enforces the state machine |
| **Metrics tracking** | OK | Modern session has good metrics collection |
| **Session cleanup cron** | OK | Both systems have 30-minute stale session cleanup |
| **No session persistence** | LOW | Sessions are entirely in-memory; server restart loses all active sessions (acceptable for current scale) |
