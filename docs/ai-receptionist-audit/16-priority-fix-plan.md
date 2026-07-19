# Priority Fix Plan — AI Receptionist

## Tier 1: Critical (Fix Immediately)

### 1. Fix OpenAI `insufficient_quota` (C1)
**Effort:** Configuration
**Risk if not fixed:** Calls cannot be completed
**Action:**
1. Verify the OpenAI API key has billing enabled
2. Check OpenAI usage dashboard for quota limits
3. Ensure the Realtime API is enabled for the organization
4. Verify the model name matches available models in the region

### 2. Add error audio during stream (C2)
**Effort:** 1-2 hours
**Risk if not fixed:** Caller hears silence on provider failure
**Action:**
1. Store a base64-encoded μ-law audio snippet for "technical difficulties" message
2. In `mediaStreamHandler.js`, when provider fails and Twilio stream is still active, play the error audio before closing the WebSocket
3. Alternatively, configure TwiML `<Connect>` with a `<Play>` fallback URL for error audio

## Tier 2: High (Fix Before Production)

### 3. Fix Gemini provider tool calling (H1)
**Effort:** 4-8 hours
**Dependency:** Gemini API documentation review
**Action:**
1. Add `tools` parameter to the `setupParameters` message in Gemini provider
2. Implement proper `functionResponse` handling in `sendToolResult()` — send as structured payload instead of text
3. Test with Gemini's bidirectional streaming API

### 4. Fix Gemini `updateInstructions()` (H2)
**Effort:** 2-4 hours
**Action:**
1. Understand Gemini's response format for `BidiGenerateContent` — responses are not JSON
2. Send instructions as a `BidiGenerateContentSetup` message with `system_instruction` field
3. Handle the response protocol correctly (protobuf/JSON mapping)

### 5. Fix `audioBridge.js` μ-law encoding (H3)
**Effort:** 1 hour
**Action:**
1. Replace the bias-based method in `audioBridge.js` with calls to the correct `twilioAudioCodec.js` functions
2. Or, remove `audioBridge.js` entirely and have the Gemini provider use `twilioAudioCodec` directly

### 6. Add appointment slot conflict check (H4)
**Effort:** 2-3 hours
**Action:**
1. In `receptionistOrchestrator.handleToolCall` for `create_appointment`, query existing appointments within the same time window (± duration)
2. Return a conflict message: "An appointment already exists at that time. Please choose another."

### 7. Store knowledge base in database (H5)
**Effort:** 4-8 hours (CRUD + API)
**Action:**
1. Add `knowledgeBase` field (JSON or text array) to `AiReceptionistConfig` model (or new model)
2. Create CRUD endpoints for knowledge base entries
3. Frontend settings modal supports editing knowledge base
4. Query from DB instead of hardcoded array

## Tier 3: Medium (Fix Soon)

### 8. Enable business tools by default (M1)
**Effort:** 5 minutes
**Action:** Change `.env.example` default to `true` and ensure orchestrator tests pass

### 9. Implement real email sending (M2a)
**Effort:** 2-4 hours + SMTP setup
**Action:** Integrate Nodemailer or SendGrid to send actual confirmation emails

### 10. Implement real SMS sending (M2b)
**Effort:** 2-4 hours + Twilio SMS setup
**Action:** Use Twilio SMS API (existing SDK available) to send SMS notifications

### 11. Consolidate session tracking (M3)
**Effort:** 4-8 hours
**Action:** Migrate all legacy `ACTIVE_SESSIONS` functionality into `RealtimeSessionManager`:
1. Move transcript buffering from `receptionistRealtime.service.js` to `RealtimeSessionManager`
2. Remove legacy `ACTIVE_SESSIONS` Map
3. Update all callers to use `RealtimeSessionManager` only

### 12. Add idempotency keys for appointments (M4)
**Effort:** 4-6 hours
**Action:**
1. Generate idempotency key per tool call (could be the `responseId` from the provider)
2. Check for existing appointment with same idempotency key before creating
3. Return existing appointment data if duplicate detected

### 13. Enforce Twilio signature validation in production (M5)
**Effort:** 15 minutes
**Action:** Verify `NODE_ENV=production` and `TWILIO_VALIDATE_SIGNATURE=true` in production Render dashboard

### 14. Add timezone handling for appointments (M6)
**Effort:** 3-5 hours
**Action:**
1. Add `timezone` field to `AiReceptionistAppointment` model
2. Normalize `scheduledDate` to UTC on storage
3. Convert back to local timezone when displaying in frontend

### 15. Add WebSocket authentication (M7)
**Effort:** 4-6 hours
**Action:**
1. Generate a signed token per call session (in `beginSession()`)
2. Pass the token as a parameter in the Media Stream URL
3. Validate the token on WebSocket connection

## Tier 4: Low (Nice to Have)

| # | Item | Effort |
|---|------|--------|
| 16 | Add WebSocket health endpoint | 1 hour |
| 17 | Add recording URL access control proxy | 2-3 hours |
| 18 | Add post-call satisfaction survey | 4-6 hours |
| 19 | Improve graceful shutdown timeout handling | 1 hour |
| 20 | Support non-μ-law audio codecs | 4-8 hours |
| 21 | Add audio level monitoring/logging | 2-3 hours |
| 22 | Improve resampler with anti-aliasing filter | 2-3 hours |

## Effort Summary

| Tier | Items | Est. Total Effort |
|------|-------|-------------------|
| Tier 1 (Critical) | 2 | Config + 2 hours |
| Tier 2 (High) | 5 | 13-24 hours |
| Tier 3 (Medium) | 8 | 20-33 hours |
| Tier 4 (Low) | 7 | 14-26 hours |
| **Total** | **22** | **47-85 hours** |
