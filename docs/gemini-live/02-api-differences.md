# API Differences — Gemini Live vs OpenAI Realtime

## Protocol Comparison

| Feature | OpenAI Realtime | Gemini Live | Notes |
|---------|---------------|-------------|-------|
| WebSocket URL | `wss://api.openai.com/v1/realtime?model=X` | `wss://generativelanguage.googleapis.com/ws/...BidiGenerateContent?key=X` | Different endpoints |
| Auth | Bearer token in header | API key in query param | Gemini key exposed in URL |
| Setup | `session.update` message | `setup` message | Both sent once at connection start |
| Setup ACK | `session.created` + `session.updated` events | `setupComplete` message | Simpler with Gemini |
| Audio input | μ-law 8kHz (g711_ulaw) directly | LINEAR16 PCM 16kHz | Gemini requires resampling |
| Audio output | μ-law 8kHz (g711_ulaw) directly | LINEAR16 PCM 24kHz | Gemini requires resampling + encoding |
| Text input | `conversation.item.create` + `response.create` | `realtimeInput.text` | Different format |
| Interruption | `response.cancel` | `realtimeInput.interruption` | Different format |
| Tool definitions | In `session.update.tools` as functions | In `setup.tools[].functionDeclarations` | Different nesting |
| Tool calls | `response.function_call_arguments.done` event | `toolCall.functionCalls[]` message | Different format |
| Tool results | `conversation.item.create` with `function_call_output` | `toolResponse.functionResponses[]` | Different format |
| Transcripts | `conversation.item.created` with `transcript` field | `serverContent.modelTurn.parts[].text` | Text in model turn |
| Turn detection | Server VAD in `session.update` config | Server VAD in `setup` config | Similar but different field names |
| Turn complete | `response.done` event | `serverContent.turnComplete` flag | Different mechanism |
| Heartbeat | Not needed (API keeps alive) | Application-level heartbeat recommended | Gemini may idle disconnect |

## Audio Format Differences

| Property | OpenAI | Gemini |
|----------|--------|--------|
| Input encoding | `g711_ulaw` (μ-law) | `LINEAR16` (PCM) |
| Input sample rate | 8000 Hz | 16000 Hz |
| Output encoding | `g711_ulaw` (μ-law) | `LINEAR16` (PCM) |
| Output sample rate | 8000 Hz | 24000 Hz |
| Chunk format | Raw base64 μ-law | Base64 PCM16 (little-endian) |

## Audio Pipeline (Gemini)

```
Twilio sends: μ-law base64 8kHz
  → decodeUlaw() → Int16Array 8kHz
  → convertSampleRate(8000, 16000) → Int16Array 16kHz
  → pcm16ToBase64() → base64 LINEAR16
  → send as { realtimeInput: { mediaChunks: [{ data, mimeType: "audio/pcm;rate=16000" }] } }

Gemini sends: base64 LINEAR16 24kHz
  → base64ToPcm16() → Int16Array 24kHz
  → convertSampleRate(24000, 8000) → Int16Array 8kHz
  → encodeUlaw() → μ-law base64
  → emit('audio', { format: 'g711_ulaw', audio: payload })
```

## Tool Calling Differences

### OpenAI
```json
// Define tool
{ "type": "session.update", "session": { "tools": [{ "type": "function", "name": "...", ... }] } }

// Receive call
{ "type": "response.function_call_arguments.done", "name": "...", "call_id": "...", "arguments": "{}" }

// Send result
{ "type": "conversation.item.create", "item": { "type": "function_call_output", "call_id": "...", "output": "{}" } }
{ "type": "response.create" }
```

### Gemini Live
```json
// Define tool
{ "setup": { "tools": [{ "functionDeclarations": [{ "name": "...", ... }] }] } }

// Receive call
{ "toolCall": { "functionCalls": [{ "name": "...", "id": "...", "args": {} }] } }

// Send result
{ "toolResponse": { "functionResponses": [{ "id": "...", "name": "...", "response": { "name": "...", "response": {} } }] } }
```
