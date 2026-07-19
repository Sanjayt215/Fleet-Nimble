# Backend Routes — AI Receptionist

## Twilio Routes (`/api/ai-receptionist/twilio/`)

| Route | Method | Handler | Auth | Purpose |
|-------|--------|---------|------|---------|
| `/voice` | POST | `twilioReceptionist.handleIncomingCall` | Twilio signature | Primary entry point for incoming PSTN calls. Returns TwiML with `<Connect><Stream>` |
| `/status` | POST | `twilioReceptionist.handleStatusCallback` | Twilio signature | Receives call status webhooks (ringing, in-progress, completed, busy, failed, no-answer) |
| `/post-stream` | POST | `twilioReceptionist.handlePostStream` | Twilio signature | Called after Twilio media stream ends — plays audio fallback "technical difficulties" |
| `/stream-status` | POST | `twilioReceptionist.handleStreamStatus` | Twilio signature | Reports Twilio Media Stream lifecycle (connected, disconnected, error) |
| `/recording` | POST | `twilioReceptionist.handleRecordingCallback` | Twilio signature | Receives recording URLs after call recording completes |
| `/media-stream` | WS | `mediaStreamHandler.handleMediaStream` | `callSid` param | WebSocket endpoint for Twilio Media Streams (upgraded from HTTP) |

## AI Receptionist API Routes (`/api/ai-receptionist/`)

| Route | Method | Handler | Auth | Purpose |
|-------|--------|---------|------|---------|
| `/health` | GET | inline | None | Public health check — returns status, uptime, provider configured, active calls |
| `/live-calls` | GET | `beCallRoutes.getRecent` | JWT + `ai-receptionist:read` | Returns active/in-progress calls |
| `/calls` | GET | `beCallRoutes.getRecent` | JWT + `ai-receptionist:read` | Returns recent calls with pagination |
| `/calls/:callSid` | GET | `beCallRoutes.getByCallSid` | JWT + `ai-receptionist:read` | Returns single call detail with transcript |
| `/calls/:id` | GET | `beCallRoutes.getById` | JWT + `ai-receptionist:read` | Returns single call by internal ID |
| `/appointments` | GET | `beAppointmentRoutes.getAppointments` | JWT + `ai-receptionist:read` | Lists appointments |
| `/appointments` | POST | `beAppointmentRoutes.createAppointment` | JWT + `ai-receptionist:write` | Creates appointment |
| `/appointments/:id` | PATCH | `beAppointmentRoutes.updateAppointment` | JWT + `ai-receptionist:write` | Updates appointment status |
| `/support-tickets` | GET | `beTicketRoutes.getTickets` | JWT + `ai-receptionist:read` | Lists tickets |
| `/support-tickets` | POST | `beTicketRoutes.createTicket` | JWT + `ai-receptionist:write` | Creates ticket |
| `/support-tickets/:id` | PATCH | `beTicketRoutes.updateTicket` | JWT + `ai-receptionist:write` | Updates ticket status |

## Agent Routes (`/api/ai-receptionist/agent/`)

| Route | Method | Handler | Auth | Purpose |
|-------|--------|---------|------|---------|
| `/start` | POST | `agentHandler.startAgent` | JWT + `ai-receptionist:write` | Starts voice agent session from browser |
| `/stop` | POST | `agentHandler.stopAgent` | JWT + `ai-receptionist:write` | Stops active agent session |
| `/send-audio` | POST | `agentHandler.sendAudio` | JWT + `ai-receptionist:write` | Sends browser audio to provider |
| `/status` | GET | `agentHandler.getStatus` | JWT + `ai-receptionist:read` | Gets agent/pipeline status |

## Middleware

| Middleware | Applied To | Purpose |
|------------|-----------|---------|
| `validateTwilioRequest` | `/twilio/*` | Verifies Twilio signature via `validateTwilioRequest()` |
| `twilioWebhookLimiter` | `/twilio/*` | Rate limiter (10 req/5s per IP) |
| `authenticate` | Non-twilio, non-health routes | JWT verification |
| `requirePermission(...)` | Protected routes | Scope-based permission check |
| `errorHandler` | Global | Catches errors, returns JSON |
| `helmet()` | All Express routes | Security headers |
| `cors()` | All Express routes | CORS with credentials |
