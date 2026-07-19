# Security Audit — AI Receptionist

## Authentication & Authorization

| Mechanism | Status | Details |
|-----------|--------|---------|
| Twilio signature validation | ✅ Implemented | `validateTwilioRequest.js` verifies Twilio signature using `TWILIO_AUTH_TOKEN` |
| Dev bypass | ⚠️ | `validateTwilioRequest()` returns `true` when `TWILIO_VALIDATE_SIGNATURE=false` (default in `.env.example`) AND returns `true` when `NODE_ENV !== 'production'` |
| JWT authentication | ✅ | Middleware `authenticate` verifies Bearer token |
| Permission scoping | ✅ | `requirePermission()` middleware checks scope: `ai-receptionist:read`, `ai-receptionist:write` |
| Tenant isolation | ✅ | All DB queries scoped by `userId` and `companyId` |
| WebSocket auth | ⚠️ | Media Stream WebSocket accepts connection solely based on `callSid` query parameter; no signature validation |
| Rate limiting | ✅ | `twilioWebhookLimiter` (10 req/5s per IP) for Twilio routes; global `generalLimiter` |

## Key Security Issues

### Issue 1: Twilio Signature Validation Bypass (MEDIUM)
- **File:** `backend/src/middleware/validateTwilioRequest.js`
- **Code:** `if (process.env.NODE_ENV !== 'production') return true;`
- **Impact:** In development, ANY request can hit Twilio webhooks without valid signature
- **Note:** This is acceptable for local development but creates risk if `NODE_ENV` is misconfigured in staging

### Issue 2: Media Stream WebSocket No Authentication (LOW)
- **File:** `backend/src/services/mediaStreamHandler.js`
- **Code:** Only validates presence of `callSid` query parameter
- **Impact:** Anyone who knows or guesses a valid `callSid` could potentially connect to a media stream
- **Mitigation:** `callSid` is a UUID (cryptographically random); brute-force is infeasible

### Issue 3: No Input Validation on Tool Arguments (MEDIUM)
- **File:** `backend/src/services/receptionistOrchestrator.service.js`
- **Code:** Fields are checked for existence but not sanitized for injection
- **Impact:** Customer name/notes could contain injection payloads if the database is vulnerable

### Issue 4: API Key in Environment (OK)
- OpenAI and Gemini API keys are stored in environment variables
- No hardcoded keys found in source code
- No exposure through error messages

### Issue 5: CORS Configuration (OK)
- `app.js` uses `cors()` with credentials enabled
- `origin` set to `process.env.CORS_ORIGIN || true` — in production, should be restricted to Vercel domain

### Issue 6: Helmet Security Headers (OK)
- `helmet()` middleware is applied globally
- Default helmet settings are adequate

### Issue 7: No CSRF Protection on Twilio Routes (LOW)
- Twilio routes rely solely on signature validation
- If signature validation is bypassed, there's no additional CSRF protection

### Issue 8: Transcript Data Exposure (LOW)
- Transcript data stored as JSON string in database
- No encryption at rest (relies on database-level encryption)
- Access controlled via permission scoping

## Secrets Management

| Secret | Storage | Risk |
|--------|---------|------|
| `OPENAI_API_KEY` | Environment variable | Medium — if `.env` is committed |
| `GEMINI_API_KEY` | Environment variable | Medium — if `.env` is committed |
| `TWILIO_AUTH_TOKEN` | Environment variable | High — validates Twilio requests |
| `TWILIO_ACCOUNT_SID` | Environment variable | Low — SID alone is not sensitive |
| `JWT_SECRET` | Environment variable | High — signs all JWT tokens |
| `DATABASE_URL` | Environment variable | Critical — full database access |

## Environment File Safety (OK)
- `.env` is in `.gitignore`
- `.env.example` contains placeholder values only
- No secrets in source code
