# Production Configuration — Gemini Live

## Required Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | ✅ Yes | — | Gemini API key from Google AI Studio |
| `AI_RECEPTIONIST_PROVIDER` | ✅ Yes | `openai` | Set to `gemini` to use Gemini Live |
| `GEMINI_LIVE_MODEL` | ❌ | `gemini-2.0-flash-exp` | Gemini model for live voice |

## Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_VOICE` | `Puck` | Prebuilt voice name (Puck, Charon, Kore, Fenrir, Aoede) |
| `GEMINI_REGION` | (empty) | Google Cloud region for API calls |
| `GEMINI_ENABLE_SERVER_VAD` | `true` | Enable server-side voice activity detection |
| `GEMINI_VAD_PRE_SILENCE_MS` | `300` | Padding ms before speech detection |
| `GEMINI_VAD_POST_SILENCE_MS` | `800` | Silence ms to end turn |
| `GEMINI_VAD_THRESHOLD` | `0.6` | VAD sensitivity threshold |
| `GEMINI_MAX_OUTPUT_TOKENS` | `1024` | Max output tokens per response |
| `GEMINI_CONNECT_TIMEOUT_MS` | `10000` | WebSocket connection timeout |
| `GEMINI_SESSION_TIMEOUT_MS` | `10000` | Session setup timeout |

## Minimal .env Configuration for Gemini

```bash
# Provider
AI_RECEPTIONIST_PROVIDER=gemini

# Gemini
GEMINI_API_KEY=AIzaSy...

# Optional tuning
GEMINI_VOICE=Puck
GEMINI_ENABLE_SERVER_VAD=true
GEMINI_VAD_POST_SILENCE_MS=800
```

## Configuration Validation

On provider creation, the factory validates:
1. `GEMINI_API_KEY` is present and non-empty
2. `GEMINI_LIVE_MODEL` is configured

If validation fails, the issue is logged and the provider is created anyway (with a warning). This ensures the system degrades gracefully rather than crashing.

## Provider Health Integration

The Gemini provider integrates with the provider health service through the error event system:
- Fatal errors (auth, permission) → `providerHealth.handleFatalError()` → blocks new sessions
- Transient errors (network, timeout) → `providerHealth.handleTransientError()` → allows retry
- The `newSessionsAllowed` flag prevents wasted connections when Gemini is down

## Latency Optimization

| Technique | Implementation |
|-----------|---------------|
| Early audio buffering | Audio queued while setup completes, flushed on 'ready' |
| Heartbeat monitoring | 15s interval heartbeat to detect stalled connections |
| Connect timeout | 10s timeout for initial WebSocket connection |
| Setup timeout | 10s timeout for setup acknowledgment |

## Production Steps

1. **Get API key** from [Google AI Studio](https://aistudio.google.com)
2. **Enable billing** for the Gemini API
3. **Set** `AI_RECEPTIONIST_PROVIDER=gemini` in environment
4. **Set** `GEMINI_API_KEY` with your key
5. **Deploy** to Render
6. **Test** a call — dial the Twilio number
7. **Monitor** logs for `GEMINI_*` events
8. **Tune** VAD settings based on call quality
