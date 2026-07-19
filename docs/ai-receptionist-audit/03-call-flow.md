# Call Flow — AI Receptionist

## Step-by-Step Call Flow (Current Implementation)

### 1. Incoming Call (Twilio Webhook)

```
PSTN Caller dials TWILIO_PHONE_NUMBER
  → Twilio sends HTTP POST to /api/ai-receptionist/twilio/voice
  → twilioReceptionist.controller.js::handleIncomingCall()
```

**What happens:**
- Logs call attempt
- Calls `beginSession()` from `receptionistRealtime.service.js`
- `beginSession()` generates `callSid` (UUID), creates `RealtimeSession`, checks provider health
- Creates `aiReceptionistCall` record in DB with status `INITIATED`
- Calls `buildIncomingTwiML()` to construct TwiML response

**TwiML returned:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://host/api/ai-receptionist/twilio/media-stream?callSid=UUID">
      <Parameter name="callSid" value="UUID"/>
    </Stream>
  </Connect>
</Response>
```

### 2. WebSocket Media Stream Established

```
Twilio connects to wss://host/api/ai-receptionist/twilio/media-stream
  → server.js upgrade handler intercepts the ws.Server
  → mediaStreamHandler.js::handleMediaStream()
```

**What happens:**
- Validates query parameters (`callSid`)
- Retrieves or creates `RealtimeSession` from `RealtimeSessionManager`
- Sets up message handlers for Twilio media events:
  - `media` → audio chunk
  - `start` → stream opened
  - `stop` → stream closed
  - `dtmf` → DTMF tone received (⚠️ placeholder — only logged)
- Connects to the realtime provider (e.g., OpenAI)

### 3. Provider Connection

```
handleMediaStream → connectProvider(callSid, ws, session)
  → providerFactory.createProvider(providerType, session, callSid)
  → openaiProvider.connect()
```

**What happens (OpenAI):**
- Creates WebSocket to `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`
- Sends `session.update` with system prompt, tools, voice, temperature, etc.
- Sets up message handlers for OpenAI events:
  - `session.created` → emit `connected`
  - `session.updated` → emit `ready`
  - `response.audio_transcript.done` → assistant transcript
  - `conversation.item.input_audio_transcription.completed` → caller transcript
  - `response.audio.delta` → audio chunk (relayed to Twilio)
  - `response.done` → response completed
  - `response.function_call_arguments.done` → tool call
  - `error` → provider error

### 4. Audio Pipeline

```
Twilio sends (μ-law 8kHz, 20ms packets, base64 encoded):
  → mediaStreamHandler: decodeG711ulaw(media.payload) → PCM16 8kHz
  → audioResampler: resample Pcm16 (8kHz → 16kHz) if needed
  → provider.sendAudio(samples) → sent via WebSocket as base64-encoded PCM16

Provider sends (PCM16 24kHz, WebSocket binary or JSON base64):
  → mediaStreamHandler: provider event 'audio'
  → audioResampler: resample Pcm16 (24kHz → 8kHz) if needed
  → encodeG711ulaw(pcmSamples) → μ-law 8kHz base64
  → ws.send(JSON media message to Twilio)
  → Twilio plays audio to caller
```

### 5. Conversation Loop

```
Caller speaks → Twilio media → Provider → Assistant speaks → Twilio caller
      └── tool call detected ──→ orchestrator.handleToolCall()
                                  → executes business function
                                  → returns result to provider
                                  → provider incorporates into response
```

### 6. Call End

```
Caller hangs up → Twilio sends "stop" media stream event
  → mediaStreamHandler: cleanupCall(callSid, sid, reason='call_ended')
  → Flush pending transcript buffer
  → Update DB: set status ENDED, duration, endReason
  → Close provider WebSocket
  → Remove session from RealtimeSessionManager
  → Remove legacy ACTIVE_SESSIONS entry

OR

Twilio sends HTTP POST to /api/ai-receptionist/twilio/status
  → handleStatusCallback()
  → Once call status is 'completed':
    → Final flush of transcript buffer
    → Computes callDuration
    → Updates DB record with final CallStatus
    → Sends Socket.IO event to frontend

OR

Twilio sends HTTP POST to /api/ai-receptionist/twilio/post-stream
  → handlePostStream()
  → If the stream ended without a completed call:
    → Updates DB: set status STREAM_ENDED
```

### 7. Fallback / Error Handling

```
Provider connection fails or error:
  → handleMediaStream(): provider emits 'error'
  → Updates DB: set status ERROR, errorMessage
  → Closes WebSocket to Twilio
  → Twilio plays fallback TwiML from <Stream> timeout

Post-stream fallback:
  → /api/ai-receptionist/twilio/post-stream endpoint
  → handlePostStream() constructs voice fallback
  → "We're sorry, we are experiencing technical difficulties..."
```

### Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Provider takes too long to connect | Session timeout (30s default) |
| Early audio before provider ready | Buffered in `pendingAudioQueue`, sent on `ready` event |
| Empty caller response | TIMEOUT events set `byeReceived=true` after 10s → end with AI_HANGUP |
| User says "goodbye" | If transcript matches goodbye/intent → `intent = END_CALL` → AI says goodbye → end |
| WebSocket disconnect mid-call | `cleanupCall` called, DB updated |
| Concurrent calls (multi-tenant) | Separate sessions per `callSid`, user scoping via `tenantResolver` |
| Provider quota exhausted | `providerHealthService` tracks errors, marks unhealthy, returns `insufficient_quota` |
