# Configuration Audit — AI Receptionist

## Environment Variables

**File:** `backend/.env.example`

| Variable | Required | Default | Used In | Notes |
|----------|----------|---------|---------|-------|
| `TWILIO_ACCOUNT_SID` | ✅ Yes | — | Twilio webhooks | Validates Twilio requests |
| `TWILIO_AUTH_TOKEN` | ✅ Yes | — | Twilio webhooks | Signs and validates requests |
| `TWILIO_PHONE_NUMBER` | ✅ Yes | — | TwiML, config | Must be E.164 format |
| `OPENAI_API_KEY` | ⚠️ Depends | — | OpenAI provider | Required if provider=openai |
| `GEMINI_API_KEY` | ⚠️ Depends | — | Gemini provider | Required if provider=gemini |
| `AI_RECEPTIONIST_PROVIDER` | ❌ No | `openai` | Provider factory | `openai` or `gemini` |
| `AI_RECEPTIONIST_GREETING` | ❌ No | `"Hello, you've reached..."` | System prompt | Default greeting |
| `AI_RECEPTIONIST_DEFAULT_USER_ID` | ❌ No | — | Tenant resolver | Used if no config record |
| `AI_RECEPTIONIST_BUSINESS_TOOLS_ENABLED` | ❌ No | `false` | Orchestrator | ⚠️ Disabled by default |
| `OPENAI_REALTIME_MODEL` | ❌ No | `gpt-4o-realtime-preview-2024-12-17` | OpenAI provider | |
| `OPENAI_REALTIME_VOICE` | ❌ No | `alloy` | OpenAI provider | alloy, echo, shimmer |
| `OPENAI_REALTIME_TEMPERATURE` | ❌ No | `0.6` | OpenAI provider | Response randomness |
| `AI_RECEPTIONIST_MAX_CALL_DURATION` | ❌ No | `600` (10 min) | Media stream handler | Max call length |
| `AI_RECEPTIONIST_SESSION_TIMEOUT` | ❌ No | `30000` (30s) | Session manager | Provider connect timeout |
| `AI_RECEPTIONIST_INACTIVITY_TIMEOUT` | ❌ No | `10000` (10s) | Media stream handler | Silence timeout |
| `DEBUG` | ❌ No | — | Various | Debug logging |
| `NODE_ENV` | ❌ No | `development` | Signature validation | ⚠️ Controls security bypass |
| `TWILIO_VALIDATE_SIGNATURE` | ❌ No | `false` | Validate middleware | ⚠️ Disables Twilio auth |
| `DATABASE_URL` | ✅ Yes | — | Prisma | PostgreSQL connection |
| `JWT_SECRET` | ✅ Yes | — | Auth middleware | Token signing |
| `CORS_ORIGIN` | ❌ No | `true` | CORS | ⚠️ `true` allows all origins |
| `PORT` | ❌ No | `5000` | Server | HTTP port |
| `WS_PORT` | ❌ No | Same as PORT | WebSocket | Separate not needed (noServer) |

## Configuration Flags That Affect Behavior

| Config Flag | Effect | Default | Risk if Wrong |
|-------------|--------|---------|---------------|
| `AI_RECEPTIONIST_PROVIDER=gemini` | Uses incomplete Gemini provider | openai | High — Gemini provider has broken tool calling |
| `AI_RECEPTIONIST_BUSINESS_TOOLS_ENABLED=true` | Enables appointment/ticket creation | false | Low — enables intended functionality |
| `NODE_ENV=production` | Enables Twilio signature validation | development | High — if false in prod, no auth on webhooks |
| `TWILIO_VALIDATE_SIGNATURE=true` | Forces signature validation | false | Low — enables intended security |
| `AI_RECEPTIONIST_MAX_CALL_DURATION=9999999` | Very long calls, high cost | 600 | Medium — cost exposure |

## Recommended Production Configuration

```bash
# Required
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1234567890
DATABASE_URL=postgresql://...
JWT_SECRET=<random-64-char-string>

# Provider
AI_RECEPTIONIST_PROVIDER=openai      # Don't use gemini until complete
OPENAI_API_KEY=sk-...

# Security (MUST SET)
NODE_ENV=production
TWILIO_VALIDATE_SIGNATURE=true
CORS_ORIGIN=https://your-vercel-app.vercel.app

# Features
AI_RECEPTIONIST_BUSINESS_TOOLS_ENABLED=true

# Optional Tuning
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview-2024-12-17
OPENAI_REALTIME_VOICE=alloy
OPENAI_REALTIME_TEMPERATURE=0.6
AI_RECEPTIONIST_MAX_CALL_DURATION=600
AI_RECEPTIONIST_SESSION_TIMEOUT=30000
AI_RECEPTIONIST_INACTIVITY_TIMEOUT=10000
```
