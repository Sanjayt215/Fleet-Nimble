# Gemini Live Integration — AI Receptionist

## Overview

The Gemini Live provider (`geminiLive.provider.js`) implements the `RealtimeVoiceProvider` interface to use Google's Gemini Live API (`BidiGenerateContent`) as the realtime voice AI for the FleetNimble AI Receptionist.

## Architecture

```
Twilio (μ-law 8kHz)
  ↓
MediaStreamHandler (generic — no provider-specific code)
  ↓
GeminiLiveProvider (extends RealtimeVoiceProvider)
  ↓
WebSocket → wss://generativelanguage.googleapis.com/ws/...BidiGenerateContent?key=GEMINI_API_KEY
  ↓
Gemini 2.0 Flash (or configured model)
```

## Connection Lifecycle

```
1. WebSocket open → 'connected' event
2. Send 'setup' message with system prompt, tools, audio config, VAD
3. Receive 'setupComplete' → 'ready' event
4. Bi-directional audio streaming begins
5. Speech detected → VAD triggers turn
6. Gemini responds with audio + text
7. Turn complete → 'responseCompleted' event
8. Caller speaks → new turn
9. Connection closed → 'closed' event
```

## Protocol Details

**Endpoint:** `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key={API_KEY}`

**Authentication:** API key passed as query parameter (same as Gemini REST API)

**Message Format:** All messages are JSON over WebSocket

## Reused Components

| Component | Source | Purpose |
|-----------|--------|---------|
| `buildSystemPrompt()` | `receptionistVoice.service.js` | Single source of truth for system prompt |
| `buildToolDefinitions()` | `receptionistVoice.service.js` | Single source of truth for tool definitions |
| `mapToProviderVoice()` | `receptionistVoice.service.js` | Voice name mapping |
| `decodeUlaw()` / `encodeUlaw()` | `twilioAudioCodec.js` | μ-law codec for Twilio |
| `convertSampleRate()` | `audioResampler.js` | Resampling between 8kHz and 16/24kHz |
| `RealtimeSessionManager` | `realtimeSessionManager.js` | Session state tracking |
| `metrics` service | `receptionistMetrics.service.js` | Provider metrics |
