# Fixed Issues — AI Receptionist Hardening

## P0 (Critical)

### 1. Silence on Provider Failure (Fixed)
**Files changed:**
- `backend/src/services/twilioWebhook.service.js` — added `redirectToUnavailable()` and updated `buildUnavailableTwiML()`
- `backend/src/services/mediaStreamHandler.js` — updated `gracefulClose()` to redirect to unavailable audio

**What changed:**
- When provider fails before delivering audio (`greetingNotDelivered` or `providerFailed`), the system now immediately uses Twilio's REST API to redirect the call to a TwiML message:
  > "I'm sorry. Our AI assistant is temporarily unavailable. Please leave your details after the beep or we'll arrange a callback."
- Previously the caller heard the pre-stream greeting, then ~30s of silence, then the post-stream fallback.
- Now the caller hears the error message immediately after provider failure is detected.

### 2. Business Tools Enablement (Fixed)
**Files changed:**
- `backend/src/config/index.js` — changed `businessToolsEnabled` default from `false` to `true`
- `backend/.env.example` — changed `AI_RECEPTIONIST_BUSINESS_TOOLS_ENABLED=false` to `=true`
- `backend/src/services/mediaStreamHandler.js` — added validation logging when tools disabled

**What changed:**
- Business tools (appointment booking, support tickets) now default to enabled
- Missing configuration is logged with a clear warning including the env var name
- No silent disabling — if tools can't initialize, the log explains why

### 3. Notification Services (Fixed)
**Files changed:**
- `backend/src/services/receptionistNotification.service.js` — complete rewrite

**What changed:**
- Replaced stub implementations with proper provider interfaces (`EmailProvider`, `SmsProvider`, `AdminNotificationProvider`)
- Each provider reports its own availability independently
- `sendConfirmationEmail` and `sendSmsNotification` now check provider availability and report failures gracefully
- No hardcoded SMTP or Twilio SMS — providers are configurable via environment variables
- Logging clearly indicates which provider is being used and whether it's available

## P1

### 4. Duplicate Session Tracking (Fixed)
**Files changed:**
- `backend/src/services/receptionistRealtime.service.js` — refactored to make RSM authoritative

**What changed:**
- `RealtimeSessionManager` is now the single source of truth
- Legacy `ACTIVE_SESSIONS` entries are thin wrappers with getter/setter delegation to RSM
- `registerSession` creates RSM first, then wraps it in legacy
- `removeSession` always removes from RSM first
- `cleanupStaleSessions` uses RSM's state to determine which legacy sessions to clean
- Transcript storage moved to RSM's `transcript` array
- All mutation methods (`addTranscriptEntry`, `setStreamSid`, `setOpenaiWs`) write to both systems for compatibility

### 5. Provider Health Handling (Fixed)
**Files changed:**
- `backend/src/services/receptionistProviderHealth.service.js` — added session block/unblock

**What changed:**
- Added `preventNewSessions(code, reason)` — blocks new sessions with logged reason
- Added `allowNewSessions()` — re-allows sessions
- Added `areNewSessionsAllowed()` — check before creating new sessions
- `handleFatalError()` now automatically calls `preventNewSessions()` with error code and message
- Health status endpoint reports `newSessionsAllowed`, `newSessionsBlockedAt`, `newSessionsBlockReason`
- Removed duplicate `clearState()` function

### 6. Appointment Booking (Fixed)
**Files changed:**
- `backend/src/services/receptionistOrchestrator.service.js` — added slot conflict check, timezone normalization

**What changed:**
- Added `checkSlotConflict()` — queries existing appointments within ±duration window before creating new one
- Added `normalizeToUtc()` — converts scheduledDate to UTC before storage
- Timezone stored as `timezone` field on appointment (uses `AI_RECEPTIONIST_TIMEZONE` env var)
- If slot conflict found, returns conflict response instead of creating duplicate
- Idempotency via `PENDING_ACTIONS` Map prevents duplicate execution within same call

### 7. Customer Memory (Fixed)
**Files changed:**
- `backend/src/services/receptionistOrchestrator.service.js` — added multi-field lookup

**What changed:**
- Added `lookupCustomerByEmail(userId, email)` — lookup by email address
- Added `lookupCustomerById(userId, customerId)` — lookup by customer ID
- Refactored `lookupCustomerByPhone` to use common `lookupCustomer()` helper
- `lookupCustomer()` supports phone, email, AND name matching with `mode: 'insensitive'`
- Name matching uses `equals` (exact) instead of fragile `contains`

### 8. Knowledge Service (Fixed)
**Files changed:**
- `backend/src/services/receptionistKnowledgeBase.service.js` — complete rewrite

**What changed:**
- Created `JsonKnowledgeProvider` — loads from hardcoded entries (current behavior, default)
- Created `DatabaseKnowledgeProvider` — loads from `AiReceptionistConfig.knowledgeBase` JSON field
- `setKnowledgeProvider(provider)` — swap implementation at runtime
- `getKnowledgeProvider()` — returns current provider
- `queryKnowledgeBase()` and `getKnowledgeTopics()` now accept `userId` for database-backed lookups
- Provider selected via `KNOWLEDGE_BASE_PROVIDER` env var (`'json'` or `'database'`)
- Existing AI callers unchanged — same function signatures

### 9. Audio Pipeline (Fixed)
**Files changed:**
- `backend/src/services/audio/audioResampler.js` — added Int16 clamping

**What changed:**
- Added `clampInt16()` function to prevent sample overflow beyond [-32768, 32767]
- Applied clamping in `resamplePcm16()` interpolation output
- Audio bridge (`audioBridge.js`) already uses correct μ-law codec from `twilioAudioCodec.js`

## P2

### 10. Observability (Fixed)
**Files changed:**
- `backend/src/services/receptionistMetrics.service.js` — new file

**What changed:**
- Created centralized metrics service tracking:
  - Call counts (total, completed, failed, error codes)
  - Tool execution (total, succeeded, failed, average time)
  - Provider events (connections, fatal/transient errors, latencies)
  - Appointment/ticket creation (created, conflicts, failed)
  - Audio frames (sent/received, bytes, drops)
- Integrated into `mediaStreamHandler.js` (provider events, call end, audio frames)
- Integrated into `receptionistOrchestrator.service.js` (appointment/ticket creation)

### 11. Security (Verified)
**No files changed — existing protections confirmed:**
- Twilio signature validation defaults to `true` in production
- `.env.example` has `TWILIO_VALIDATE_SIGNATURE=true`
- All DB queries scoped by `userId`/`companyId`
- JWT authentication with permission scoping
- Rate limiting on Twilio webhooks (10 req/5s per IP)
- Winston JSON logger prevents accidental secret leakage

### 12. Deployment (Verified)
**No files changed — existing config confirmed:**
- Production `NODE_ENV` in `render.yaml`
- `npm ci && npx prisma generate` build step
- Graceful shutdown handling `SIGTERM` with 5s timeout
- Socket.IO and WS WebSocket servers correctly configured
- Stale session cleanup crons running every 10 min
- Owner validation with retry on startup
- Global error handlers for `unhandledRejection` and `uncaughtException`
