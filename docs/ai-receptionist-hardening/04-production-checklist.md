# Production Checklist — AI Receptionist

## Pre-Deployment Checks

### Environment Variables
- [ ] `NODE_ENV=production` (set in Render dashboard)
- [ ] `TWILIO_VALIDATE_SIGNATURE=true`
- [ ] `AI_RECEPTIONIST_BUSINESS_TOOLS_ENABLED=true` (already default)
- [ ] `DATABASE_URL` points to production Neon database
- [ ] `JWT_SECRET` is a strong random string (64+ chars)
- [ ] `JWT_REFRESH_SECRET` is a different strong random string
- [ ] `OPENAI_API_KEY` has active billing and Realtime API access
- [ ] `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are valid
- [ ] `TWILIO_PHONE_NUMBER` is correct E.164 format
- [ ] `CORS_ORIGIN` matches your Vercel frontend URL
- [ ] `PUBLIC_BACKEND_URL` matches your Render URL (no trailing slash)

### Database
- [ ] Prisma migrations have been applied: `npx prisma migrate deploy`
- [ ] `AI_RECEPTIONIST_DEFAULT_USER_ID` and `AI_RECEPTIONIST_DEFAULT_COMPANY_ID` set in env (or config records created in DB)

### Provider
- [ ] OpenAI API key has sufficient quota for Realtime API
- [ ] Model `gpt-4o-realtime-preview` is available in your OpenAI region
- [ ] Or configure a different model via `AI_RECEPTIONIST_MODEL`

### Twilio
- [ ] Phone number is purchased and voice-enabled
- [ ] Webhook URL is configured: `https://your-backend.onrender.com/api/ai-receptionist/twilio/voice`
- [ ] HTTP method is POST
- [ ] Media Streams are supported (check Twilio account capabilities)

### Observability
- [ ] `LOG_LEVEL` is `info` (default in production)
- [ ] Metrics endpoint available at `GET /api/ai-receptionist/health`
- [ ] Provider health checks enabled (`ENABLE_AI_HEALTH_CHECK=true`)

### Notification Providers (Optional)
- [ ] `EMAIL_SMTP_HOST` configured if email confirmations desired
- [ ] `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` configured if SMS notifications desired

## Deployment Steps

1. **Merge code** to `main` branch
2. **Render auto-deploys** the backend (build: `npm ci && npx prisma generate`, start: `npm start`)
3. **Vercel auto-deploys** the frontend
4. **Run database migrations** manually if needed:
   ```
   npx prisma migrate deploy
   ```
5. **Test a call** by dialing the Twilio phone number
6. **Monitor logs** for:
   - `CALL_RECORD_CREATED` confirms DB write
   - `PROVIDER_CONNECTING` → `PROVIDER_SOCKET_OPEN` → `PROVIDER_SESSION_READY` confirms provider flow
   - `CALL_ENDED` with `providerError: null` confirms clean call

## Post-Deployment Verification

### Call Flow Test
```
Dial number → hear pre-stream greeting ("Hello. You've reached...")
→ hear AI greeting ("Welcome back/Hello. How may I help you?")
→ speak a request
→ AI responds
→ AI completes action (appointment/ticket if applicable)
→ Call ends gracefully
```

### Error Flow Test
- Disable the OpenAI API key temporarily
- Dial the number
- Verify you hear: "I'm sorry. Our AI assistant is temporarily unavailable..."
- Verify the call ends (no silence)

### Tool Test
- Call and say "I'd like to book a demo"
- Complete all fields (name, company, contact, fleet size, purpose, date, time)
- Verify appointment is created in the database
- Verify confirmation response is spoken

## Architecture Checks

### Provider Health
- First `insufficient_quota` error blocks new sessions via `preventNewSessions()`
- Callers immediately hear unavailable message (not silence)
- Sessions auto-clean after 30 min of inactivity
- Provider errors are classified as fatal or transient

### Session Management
- `RealtimeSessionManager` is authoritative for state tracking
- Legacy `ACTIVE_SESSIONS` maintained for compatibility
- Both are cleaned on stale session cleanup
- No duplicate sessions per `callSid`

### Security
- Twilio signatures verified in production
- Tenant isolation via `userId`/`companyId` scoping on all queries
- JWT authentication with scope-based permissions
- Rate limited Twilio webhooks (10 req/5s per IP)

## Rollback Plan

If deployment causes issues:
1. **Revert code** to previous commit on `main` branch
2. Render auto-deploys the previous version
3. **Set** `AI_RECEPTIONIST_BUSINESS_TOOLS_ENABLED=false` in env if needed
4. **Verify** old behavior is restored
