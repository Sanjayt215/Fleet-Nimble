# Phase 2 Readiness — Gemini Live Integration

## Current Status After Hardening

The project is now **ready for Phase 2** (Gemini Live integration). Here's what has been addressed and what remains:

## ✅ Completed (Foundation for Gemini)

| Area | Status | Details |
|------|--------|---------|
| Provider abstraction | ✅ Ready | `RealtimeVoiceProvider` interface supports both OpenAI and Gemini |
| Provider health | ✅ Ready | Fatal errors block new sessions; transient errors tracked; all tracked via metrics |
| No silent failures | ✅ Ready | Provider failure now plays immediate error audio instead of silence |
| Audio pipeline | ✅ Ready | Proper μ-law codec, Int16-safe resampler, correct audio bridge |
| Session management | ✅ Ready | Single authoritative `RealtimeSessionManager` |
| Business tools | ✅ Ready | Enabled by default, validated on startup, metrics tracked |
| Notifications | ✅ Ready | Provider interfaces ready for email/SMS |
| Knowledge base | ✅ Ready | Modular provider pattern supporting JSON and database |
| Customer lookup | ✅ Ready | Supports phone, email, name, and customer ID |
| Appointments | ✅ Ready | Slot conflict checks, timezone normalization, idempotency |
| Observability | ✅ Ready | Metrics tracked for all key operations |

## 🔴 Still Broken (Gemini-Specific)

These issues exist in `geminiLive.provider.js` and must be fixed before Gemini can work:

| Issue | File | Impact |
|-------|------|--------|
| `updateInstructions()` returns false | `geminiLive.provider.js:160` | System prompt can't be updated after connect |
| `sendToolResult()` sends as text | `geminiLive.provider.js` | Gemini can't parse tool results |
| No tool definitions sent | `geminiLive.provider.js` | Gemini doesn't know available tools |
| Audio conversion assumptions | `geminiLive.provider.js` | May use wrong sample rates |

## Required Work for Phase 2

### High Priority (Gemini Must-Have)

1. **Fix `updateInstructions()`** — Gemini returns plain text, not JSON. Parse response format correctly.
2. **Fix `sendToolResult()`** — Send proper `functionResponse` structure instead of text.
3. **Add tool definitions** to `setupParameters` message so Gemini knows available tools.
4. **Verify audio rates** — Gemini's actual output sample rate may differ from assumed 24kHz.

### Medium Priority (Quality)

5. **Add server VAD configuration** for Gemini's turn detection.
6. **Add `trackProviderError()` calls** to Gemini provider for health tracking.
7. **Test end-to-end** with Gemini API key on a test call.

### Low Priority (Polish)

8. **Add Gemini metrics** to the metrics service.
9. **Handle Gemini-specific error codes** in provider health classification.

## Recommended Phase 2 Approach

```
1. Fix geminiLive.provider.js (updateInstructions, sendToolResult, tools)
2. Test with GEMINI_API_KEY in development
3. Set AI_RECEPTIONIST_PROVIDER=gemini in staging
4. Verify end-to-end call flow with Gemini
5. Add Gemini to provider health tracking
6. Deploy to production
```

## Architecture for Gemini Live

The current architecture already supports Gemini Live through the provider factory:

```
realtimeVoiceProviderFactory.js
  → AI_RECEPTIONIST_PROVIDER === 'gemini'
    → geminiLive.provider.js (needs fixes above)
  → default
    → openAIRealtime.provider.js (working)
```

The media stream handler, session manager, audio pipeline, and orchestration all work identically regardless of which provider is selected.

## Risk Assessment for Phase 2

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Gemini WebSocket API changes | Low | Monitor Google API changelog |
| Gemini audio quality issues | Medium | Test with real calls before GA |
| Gemini quota/rate limits | Medium | Use provider health service to track |
| Breaking changes to BidiGenerateContent API | Low | Pin API version in URL |
