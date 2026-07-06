# FleetNimble Voice AI Receptionist - Deployment Guide

## Required Environment Variables

```env
# Twilio
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# OpenAI Realtime
OPENAI_API_KEY=sk-...
AI_RECEPTIONIST_VOICE=alloy
AI_RECEPTIONIST_MODEL=gpt-4o-realtime-preview

# Public URL (must be HTTPS for Twilio + WSS)
PUBLIC_BACKEND_URL=https://your-app.onrender.com

# Existing (must be present)
DATABASE_URL=postgresql://...
JWT_SECRET=...
```

## Twilio Setup

### 1. Buy a Phone Number
```
Twilio Console → Phone Numbers → Buy a Number
Select a voice-capable number
```

### 2. Configure Voice Webhook
```
Phone Numbers → Manage → Active Numbers → Select your number

Voice Configuration:
- When a call comes in: Webhook
- URL: https://your-app.onrender.com/api/ai-receptionist/twilio/voice
- HTTP: POST
```

### 3. Configure Status Callback (Optional but recommended)
```
At the bottom of Voice Configuration:
- Status Callback URL: https://your-app.onrender.com/api/ai-receptionist/twilio/status
- Status Callback Events: initiated, ringing, answered, completed
```

### 4. Enable Recording (Optional)
```
In your Twilio Function or via API:
- Set Record: true on the <Dial> or use recordingStatusCallback
- Recording Status Callback: https://your-app.onrender.com/api/ai-receptionist/twilio/recording
```

### 5. Enable Media Streams
Media Streams are enabled automatically via the TwiML returned by the /voice webhook.
No additional config needed beyond pointing the voice webhook URL.

## Render Deployment

### Required Config
```
1. Build Command: npm install && npx prisma generate
2. Start Command: node src/server.js
3. Environment: Add all env vars from above
4. Health Check Path: /health
```

### WebSocket Support
Render supports WebSocket connections natively with no additional config.
The Twilio Media Stream uses WSS on the same port as HTTP.

### Prisma Migration
```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npx prisma migrate deploy --schema=./prisma/schema.prisma

# Or push schema (dev only)
npx prisma db push --schema=./prisma/schema.prisma
```

## Vercel Deployment (Frontend)

### Required Config
```env
VITE_API_URL=https://your-app.onrender.com/api
VITE_SOCKET_URL=https://your-app.onrender.com
```

### Verify
1. Socket.io connection works (check browser console)
2. JWT auth token flow works
3. AI Receptionist page loads with tabs

## OpenAI Setup

### 1. API Key
- Create at https://platform.openai.com/api-keys
- Set as OPENAI_API_KEY

### 2. Model
- Default: gpt-4o-realtime-preview (supports audio)
- Set via: AI_RECEPTIONIST_MODEL

### 3. Voice
- Options: alloy, echo, fable, onyx, nova, shimmer
- Set via: AI_RECEPTIONIST_VOICE
- Default: alloy

## Testing Checklist

### Backend
- [ ] POST /api/ai-receptionist/twilio/voice returns valid TwiML
- [ ] POST /api/ai-receptionist/twilio/status updates call status
- [ ] POST /api/ai-receptionist/twilio/recording stores metadata
- [ ] WS /api/ai-receptionist/twilio/media-stream accepts connections
- [ ] GET /api/ai-receptionist/live-calls returns active calls
- [ ] POST /api/ai-receptionist/live-calls/:sid/end terminates call
- [ ] POST /api/ai-receptionist/live-calls/:sid/escalate marks ESCALATED
- [ ] GET /api/ai-receptionist/analytics returns analytics
- [ ] Transcript persistence works
- [ ] Human handoff triggers correctly

### Frontend
- [ ] Live Calls tab shows active calls
- [ ] Live transcript updates in real-time
- [ ] Escalate button works
- [ ] End Call button works
- [ ] Analytics cards load
- [ ] Dashboard tab still works (no regression)
- [ ] Settings modal shows handoff fields
- [ ] Socket.io connection established

### Production Hardening
- [ ] Twilio signature validation in production
- [ ] Rate limiting on webhook endpoints
- [ ] Stale session cleanup cron job
- [ ] Transcript chunk buffering working
- [ ] Graceful shutdown cleans up sessions
- [ ] Structured logging in production

## Known Limitations

1. **OpenAI Realtime API** is only available in certain regions - verify availability
2. **Twilio Media Streams** require WebSocket (WSS) which needs HTTPS
3. **Call recording** requires Twilio add-on or paid feature
4. **Concurrent calls** limited by OpenAI API rate limits and server resources
5. **Language detection** uses OpenAI Realtime's built-in support (English primary)
6. **After-hours routing** uses configurable behavior (voicemail/forward/message)
7. **No IVR menu** - direct-to-AI receptionist flow
8. **WebSocket** connections require sticky sessions if load-balanced
