# New Configuration — AI Receptionist Hardening

## Changed Defaults

| Variable | Old Default | New Default | File |
|----------|-------------|-------------|------|
| `AI_RECEPTIONIST_BUSINESS_TOOLS_ENABLED` | `false` | `true` | `config/index.js`, `.env.example` |

## New Environment Variables

### Knowledge Base
| Variable | Default | Description |
|----------|---------|-------------|
| `KNOWLEDGE_BASE_PROVIDER` | `json` | Knowledge base backend: `json` (hardcoded) or `database` (from `AiReceptionistConfig`) |

### Notifications
| Variable | Required | Description |
|----------|----------|-------------|
| `EMAIL_SMTP_HOST` | No | SMTP host for email sending |
| `EMAIL_SMTP_PORT` | No | SMTP port |
| `EMAIL_SMTP_USER` | No | SMTP username |
| `EMAIL_SMTP_PASS` | No | SMTP password |
| `NOTIFICATION_FALLBACK_EMAIL` | No | Fallback email if appointment has no callerEmail |

### Existing Variables Still Relevant
| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `TWILIO_ACCOUNT_SID` | ✅ Yes | — | Required for SMS sending |
| `TWILIO_AUTH_TOKEN` | ✅ Yes | — | Required for SMS sending and webhook validation |
| `TWILIO_PHONE_NUMBER` | ✅ Yes | — | Must be E.164 |
| `TWILIO_VALIDATE_SIGNATURE` | ⚠️ | `true` (prod) / `false` (dev) | Keep `true` in production |
| `AI_RECEPTIONIST_TIMEZONE` | ❌ | `UTC` | Used for appointment timezone storage |

## Updated `.env.example` (Compared to Original)

```diff
- AI_RECEPTIONIST_BUSINESS_TOOLS_ENABLED=false
+ AI_RECEPTIONIST_BUSINESS_TOOLS_ENABLED=true
```

## Configuration Validation Points

1. **Business Tools**: If `AI_RECEPTIONIST_BUSINESS_TOOLS_ENABLED=false`, a warning is logged per call in `connectProvider()` with the key name
2. **Email Provider**: Logs `EMAIL_PROVIDER_UNAVAILABLE` with fix instructions when `EMAIL_SMTP_HOST` is not set
3. **SMS Provider**: Logs `SMS_PROVIDER_UNAVAILABLE` when `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` not configured
4. **Knowledge Base**: Logs provider type at startup (`json` with entry count or `database`)
