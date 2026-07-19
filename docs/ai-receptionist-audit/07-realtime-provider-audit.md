# Realtime Provider Audit — AI Receptionist

## OpenAI Realtime Provider (`openAIRealtime.provider.js`)

### Implementation Status: **COMPLETE**

| Feature | Supported | Details |
|---------|-----------|---------|
| WebSocket Connect | ✅ | `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17` |
| session.update | ✅ | System prompt, voice, tools, temperature, turn detection |
| Send audio | ✅ | Base64-encoded PCM16 via `input_audio_buffer.append` |
| Receive audio | ✅ | Handles `response.audio.delta`, relays to Twilio |
| Transcripts (assistant) | ✅ | `response.audio_transcript.done` → stored |
| Transcripts (caller) | ✅ | `conversation.item.input_audio_transcription.completed` → stored |
| Tool calls | ✅ | `response.function_call_arguments.done` → handled |
| Tool results | ✅ | `conversation.item.create` with function response |
| Cancel response | ✅ | `response.cancel` sent on tool calls |
| Voice selection | ✅ | `alloy` (configurable via env) |
| Temperature | ✅ | 0.6 (configurable via env) |
| Turn detection | ✅ | Server VAD with configurable thresholds |
| Session scoping | ✅ | Per-call session configuration |
| Error handling | ✅ | Error event → 'error' emission |
| Provider health integration | ✅ | Tracks fatal vs transient errors via `trackProviderError()` |

### Known Issues

1. **`insufficient_quota` error** — OpenAI returns error code `insufficient_quota` which is classified as `fatal` by `providerHealthService`. This prevents any calls from working.
2. **API key handling** — No validation of key format/prefix before connection attempt
3. **Model must match region** — `gpt-4o-realtime-preview` may not be available in all OpenAI regions
4. **No retry logic** — If the WebSocket fails to connect, no automatic retry

## Gemini Live Provider (`geminiLive.provider.js`)

### Implementation Status: **STUB / INCOMPLETE**

| Feature | Supported | Details |
|---------|-----------|---------|
| WebSocket Connect | ✅ | `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent` |
| API Key auth | ✅ | Via query param `?key=GEMINI_API_KEY` |
| sendAudio | ✅ | Uses `audioBridge` for conversion |
| receiveAudio | ✅ | Emits `audio` events from Gemini responses |
| sendText (functioning) | ✅ | Works for plain text messages |
| sendToolResult | ❌ HACKED | Calls `sendText()` with JSON-stringified tool result instead of proper `functionResponse` |
| Tool definitions | ❌ MISSING | No `tools` parameter in `setupParameters` message |
| updateInstructions | ❌ BUG | Always returns `false` — tries to JSON.parse(response) but Gemini returns plain text |
| Turn detection | ❌ MISSING | No server VAD configuration |
| Error handling | ✅ | Error event handling |
| Provider health integration | ❌ MISSING | Does not call `trackProviderError()` |

### Audio Conversion Details

The Gemini provider uses `audioBridge.js` for conversion. The audio bridge:
- **Twilio → Gemini**: μ-law 8kHz → decodeG711ulaw → resample to 16kHz → send as base64
- **Gemini → Twilio**: PCM16 24kHz → resample to 8kHz → encodeG711ulaw → send to Twilio

### Issues with Gemini Live

1. **`updateInstructions()` always returns `false`** — This breaks the instruction update flow used by `receptionistRealtime.service.js` to set the system prompt after connection.
2. **Tool calling is text-based** — Tool results are sent as text messages rather than proper `functionResponse` structures, which means Gemini cannot parse them as tool outputs.
3. **No tool definitions sent to Gemini** — The `setupParameters` message does not include tool definitions, so Gemini doesn't know what tools are available.
4. **Audio conversion assumptions** — Assumes Gemini sends at 24kHz (OpenAI default), but Gemini's actual output rate may differ.

## Provider Selection

`realtimeVoiceProviderFactory.js`:
- Default: `'openai'`
- Falls back to: `'openai'` if unrecognized
- Gemini selected only if `AI_RECEPTIONIST_PROVIDER === 'gemini'`
