# Current Architecture — AI Receptionist

## Plain-Text Architecture Diagram

```
                     ┌──────────────────────────────────────────────────┐
                     │                  Twilio PSTN                      │
                     │         (Phone Number: TWILIO_PHONE_NUMBER)       │
                     └────────────┬────────────▲──────────┬─────────────┘
                                  │ HTTP POST  │          │
                    Incoming Call │ /twilio/   │ Status   │ Recording
                                  │ voice      │ Callback │ Callback
                                  ▼            │          ▼
              ┌───────────────────────────────────┐   ┌──────────────────┐
              │      Render / Node.js Server       │   │ Recording URL    │
              │           (server.js)               │   │ storage          │
              │                                     │   └──────────────────┘
              │   ┌─────────────────────────────┐   │
              │   │   Express App (app.js)        │   │
              │   │   /api/ai-receptionist/       │   │
              │   │   ├── /health (public)        │   │
              │   │   ├── /twilio/voice (POST)    │   │
              │   │   ├── /twilio/status (POST)   │   │
              │   │   ├── /twilio/stream-status   │   │
              │   │   ├── /twilio/post-stream     │   │
              │   │   ├── /twilio/recording       │   │
              │   │   ├── /live-calls (JWT)       │   │
              │   │   ├── /calls (JWT)            │   │
              │   │   ├── /appointments (JWT)     │   │
              │   │   ├── /support-tickets (JWT)  │   │
              │   │   └── /agent/* (JWT)          │   │
              │   └──────────────┬────────────────┘   │
              │                  │                     │
              │   ┌──────────────▼────────────────┐   │
              │   │   WebSocket Server (ws)        │   │
              │   │   /twilio/media-stream         │   │
              │   │   (noServer: true — upgraded   │   │
              │   │    from HTTP on upgrade event)  │   │
              │   └──────────────┬────────────────┘   │
              │                  │                     │
              │   ┌──────────────▼────────────────┐   │
              │   │   Media Stream Handler          │   │
              │   │   (mediaStreamHandler.js)       │   │
              │   │   • Manages Twilio WS events    │   │
              │   │   • Routes audio to provider    │   │
              │   │   • Handles tool calls          │   │
              │   │   • Orchestrates call lifecycle  │   │
              │   │   • Manages early audio buffer   │   │
              │   └──────────────┬────────────────┘   │
              │                  │                     │
              │   ┌──────────────▼────────────────┐   │
              │   │   Real-time Provider Layer      │   │
              │   │   (realtimeVoiceProviderFactory) │   │
              │   │   ├── OpenAI (primary)          │   │
              │   │   └── Gemini (stub/incomplete)  │   │
              │   └─────────────────────────────────┘   │
              │                                         │
              │   ┌─────────────────────────────────┐   │
              │   │   Orchestrator                    │   │
              │   │   (receptionistOrchestrator)      │   │
              │   │   ├── Intent Classification       │   │
              │   │   ├── Appointment Booking         │   │
              │   │   ├── Support Ticket Creation     │   │
              │   │   ├── Customer Lookup             │   │
              │   │   └── CRM Updates                 │   │
              │   └─────────────────────────────────┘   │
              │                                         │
              │   ┌─────────────────────────────────┐   │
              │   │   Prisma / PostgreSQL (Neon)     │   │
              │   │   ├── aiReceptionistCall          │   │
              │   │   ├── aiReceptionistAppointment   │   │
              │   │   ├── aiReceptionistSupportTicket │   │
              │   │   ├── receptionistCustomer        │   │
              │   │   ├── aiReceptionistConfig        │   │
              │   │   └── aiReceptionistAuditLog      │   │
              │   └─────────────────────────────────┘   │
              │                                         │
              │   ┌─────────────────────────────────┐   │
              │   │   Socket.IO Server                │   │
              │   │   (for frontend live updates)     │   │
              │   └─────────────────────────────────┘   │
              └─────────────────────────────────────────┘
                              │
                              ▼
              ┌──────────────────────────────────────────┐
              │   Frontend (React/Vite)                    │
              │   ├── AIReceptionist.jsx (main page)       │
              │   ├── AIPhoneConsole.jsx (browser voice)   │
              │   ├── VoiceReceptionistAgent.jsx (alt UI)  │
              │   ├── LiveCallsPanel.jsx (live calls)      │
              │   ├── CallDetailModal.jsx                  │
              │   ├── AppointmentModal.jsx                 │
              │   ├── SupportTicketModal.jsx               │
              │   ├── SimulateCallModal.jsx                │
              │   ├── ReceptionistSettingsModal.jsx        │
              │   └── AnalyticsCards.jsx                   │
              └──────────────────────────────────────────┘
```

## Key Design Decisions

1. **Dual Session Tracking**: Both `ACTIVE_SESSIONS` (legacy Map in `receptionistRealtime.service.js`) and `RealtimeSessionManager` (modern class) track the same call simultaneously. The legacy session is used by `addTranscriptEntry`, `setOpenaiWs`, etc., while `RealtimeSessionManager` handles state machine and metrics.

2. **Provider Abstraction**: `RealtimeVoiceProvider` is an abstract class with methods like `connect()`, `sendAudio()`, `sendText()`, `cancelResponse()`, `close()`. Both OpenAI and Gemini providers extend it.

3. **Audio Pipeline**: Twilio sends μ-law 8kHz → decoded to PCM16 → optionally resampled → sent to provider. Provider output (PCM16 or μ-law) → optionally resampled → encoded to μ-law 8kHz → sent to Twilio.

4. **Tenant Resolution**: Uses either the `AI_RECEPTIONIST_DEFAULT_USER_ID` environment variable or looks up by `twilioPhoneNumber` in `AiReceptionistConfig` table. All call records are scoped to the resolved userId.

5. **Transcript Buffering**: Transcript entries are buffered in-memory and flushed every 5 entries (or on call end) to the database as a JSON string.

## Provider Architecture

```
Provider Factory (realtimeVoiceProviderFactory.js)
  ↓
  select provider by AI_RECEPTIONIST_PROVIDER (default: "openai")
  ↓
  create instance of OpenAIRealtimeProvider or GeminiLiveProvider
  ↓
  provider extends RealtimeVoiceProvider (interface.js)
  ↓
  events emitted: connected, ready, audio, callerTranscript,
                  assistantTranscript, speechStarted, toolCall,
                  responseStarted, responseCompleted, error, closed
```

## File Organization

All AI Receptionist files are in `backend/src/services/` with prefix `receptionist*.service.js`. Provider files in `backend/src/providers/realtime/`. Audio codec files in `backend/src/services/audio/`.
