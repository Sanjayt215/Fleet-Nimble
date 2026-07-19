# Known Issues & Bugs — AI Receptionist

## Critical Issues

### C1: OpenAI `insufficient_quota` blocks all calls
- **File:** `backend/src/providers/realtime/openAIRealtime.provider.js`
- **Symptom:** Caller hears pre-stream greeting from Twilio, then silence for ~30s, then post-stream fallback message ("We're sorry...")
- **Root Cause:** OpenAI API key has exhausted quota or has insufficient billing
- **Fix:** Ensure OpenAI account has active billing and sufficient credits for the Realtime API
- **Note:** The provider correctly handles this error, but there's no "technical difficulties" audio played DURING the stream — the caller just hears silence

### C2: No error audio during stream (caller hears silence)
- **File:** `backend/src/services/mediaStreamHandler.js`
- **Symptom:** When provider connection fails, the Twilio media stream is already active. The handler closes the WebSocket but no audio is played to the caller during the ~30s before `<Stream>` timeout triggers the post-stream fallback.
- **Impact:** Caller experiences silence and confusion
- **Fix:** Play a local "technical difficulties" audio file or use Twilio's `<Play>` as a fallback within the `<Connect>` block

## High Severity Issues

### H1: Gemini Live provider tool calling is broken
- **File:** `backend/src/providers/realtime/geminiLive.provider.js`
- **Issue:** `sendToolResult()` sends tool results as text via `sendText()` instead of using Gemini's `functionResponse` structure. Tool definitions (`tools`) are never sent in the `setupParameters` message.
- **Impact:** When `AI_RECEPTIONIST_PROVIDER=gemini`, tool calls cannot work, making appointment booking and ticket creation impossible

### H2: Gemini `updateInstructions()` always returns false
- **File:** `backend/src/providers/realtime/geminiLive.provider.js:160`
- **Issue:** The method tries to `JSON.parse(response)` but Gemini returns plain text for `BidiGenerateContent` responses
- **Impact:** The system prompt / instructions cannot be updated after initial connection, which is required for the orchestration flow

### H3: `audioBridge.js` uses incorrect μ-law encoding
- **File:** `backend/src/services/audio/audioBridge.js`
- **Issue:** Uses bias add/subtract method instead of proper μ-law compression table. The correct implementation is in `twilioAudioCodec.js`. The audio bridge is used by the Gemini provider.
- **Impact:** When using Gemini, audio to/from the caller will be distorted or silent

### H4: No slot availability check for appointments
- **File:** `backend/src/services/receptionistOrchestrator.service.js`
- **Issue:** `create_appointment` does not check for existing appointments at the same date/time
- **Impact:** Can double-book appointments
- **Note:** Only appointment creation is in scope; calendar integration is out of scope for this fix

### H5: Knowledge base is hardcoded
- **File:** `backend/src/services/receptionistKnowledgeBase.service.js`
- **Issue:** 5 hardcoded strings, no RAG/vector search, no tenant-specific content
- **Impact:** Cannot customize per-tenant, no semantic retrieval, wastes tokens on every call

## Medium Severity Issues

### M1: Business tools disabled by default
- **File:** `backend/.env.example`
- **Issue:** `AI_RECEPTIONIST_BUSINESS_TOOLS_ENABLED=false`
- **Impact:** Appointments and tickets won't be created unless explicitly enabled in production

### M2: Email/SMS notifications are stubs
- **File:** `backend/src/services/receptionistNotification.service.js`
- **Issue:** Both `sendConfirmationEmail` and `sendSmsNotification` log "DISABLED" and return `{ sent: true }`
- **Impact:** Customers never receive confirmation emails or SMS after booking appointments or creating tickets

### M3: Dual session tracking can desync
- **Files:** `receptionistRealtime.service.js` (legacy), `realtimeSessionManager.js` (modern)
- **Issue:** Both track the same call; if one is updated without the other, state diverges
- **Impact:** Unpredictable behavior during cleanup and transcript flushing

### M4: No idempotency on appointment creation
- **File:** `backend/src/services/receptionistOrchestrator.service.js`
- **Issue:** `PENDING_ACTIONS` Map prevents concurrent execution but not retries
- **Impact:** If the model retries a tool call after completion, duplicate appointments can be created

### M5: Twilio signature validation bypassed in dev
- **File:** `backend/src/middleware/validateTwilioRequest.js`
- **Issue:** Returns `true` when `NODE_ENV !== 'production'`
- **Impact:** If staging/production incorrectly has `NODE_ENV=development`, Twilio webhooks are unauthenticated

### M6: No timezone handling for appointments
- **File:** `prisma/schema.prisma` (`aiReceptionistAppointment.scheduledDate` is `DateTime`)
- **Issue:** Appointment times stored as-is without timezone offset or normalized to UTC
- **Impact:** Callers in different timezones may book appointments at wrong times

### M7: Media Stream WebSocket no authentication
- **File:** `backend/src/services/mediaStreamHandler.js`
- **Issue:** Only validates `callSid` query parameter existence
- **Impact:** While mitigated by UUID randomness, no proof-of-ownership of callSid

### M8: Status callback URL inconsistent
- **File:** `backend/src/services/twilioWebhook.service.js`
- **Issue:** `buildIncomingTwiML` uses `/twilio/stream-status` (no `callSid` param), but `makeCall` endpoint uses `/twilio/status` with `callSid` query param
- **Impact:** Status tracking may be unreliable if `stream-status` is confused with `status`

## Low Severity Issues

### L1: No health endpoint for WebSocket server
- The WebSocket server is created with `noServer: true` but there's no health check specific to the WS path

### L2: Recording URL handling lacks access control
- `recordingUrl` is stored in the database but there's no access control proxy — anyone with the URL can access the recording

### L3: No call rating/satisfaction survey
- No post-call satisfaction collection

### L4: No graceful shutdown timeout handling
- `SIGTERM` handler may timeout if cleanup takes too long

### L5: Non-μ-law audio format unsupported
- Only `g711_ulaw` is supported; no error for other Twilio codecs

### L6: No audio level monitoring
- Cannot debug audio quality issues without external tools
