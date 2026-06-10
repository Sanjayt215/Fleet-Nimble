# Security Review

- JWT stored in `localStorage` — standard for SPA; consider httpOnly cookies for hardened deploy
- API uses `helmet`, rate limiting (if enabled in app.js), role checks on vehicle scope
- No mock credentials in production builds; demo login placeholders only on Login.jsx dev UX
- `.env` must not be committed; rotate `JWT_SECRET` in production
- MQTT device auth via provisioning API — see `docs/architecture/SECURITY_MODEL.md`
