# FleetNimble Branding Cleanup Report

**Date:** 2026-06-06  
**Task:** Remove FleetIO / FleetOS / fleet.io legacy branding  
**Status:** Complete (application source); one intentional DB migration line retained

---

## Summary

| Metric | Count |
|--------|-------|
| Files modified | 32 |
| Files created | 2 |
| Files deleted | 1 |
| Legacy references removed | 48+ |
| Remaining legacy strings (source) | **0** |
| Remaining legacy strings (migrations only) | 1 (data migration WHERE clause) |

---

## Search patterns audited

- FleetIO / fleetio
- Fleet OS / FleetOS / fleetos / fleet-os / fleet_os
- fleet.io / admin@fleet.io
- Fleet Management System (legacy)
- Fleet API / Fleet Dashboard (product branding)

**Excluded from replacement (technical, not product branding):**

- MQTT topic prefix `fleet/{tenant}/{vehicle}/...` (protocol namespace)
- Database name `fleet_db`, DB user `fleet` (infrastructure)
- Tailwind CSS class prefix `fleet-*` (design tokens)
- `fleetStore.ts` in architecture docs (code example for future Next.js app)

---

## Files modified

### Frontend
| File | Changes |
|------|---------|
| `frontend/index.html` | Title, meta description → FleetNimble Fleet Intelligence |
| `frontend/package.json` | `fleetnimble-dashboard` |
| `frontend/src/pages/Login.jsx` | Branding copy, `admin@fleetnimble.com` default |
| `frontend/src/pages/Register.jsx` | FleetNimble header |

### Backend
| File | Changes |
|------|---------|
| `backend/package.json` | `fleetnimble-api`, description |
| `backend/src/server.js` | Log: `FleetNimble API running` |
| `backend/prisma/seed.js` | Admin `admin@fleetnimble.com`, company name |
| `backend/scripts/mqtt-e2e-test.js` | Login email |

### Mobile (Android OBD app)
| File | Changes |
|------|---------|
| `mobile/pubspec.yaml` | `fleetnimble_mobile` |
| `mobile/lib/main.dart` | `FleetNimbleApp`, title |
| `mobile/lib/screens/login_screen.dart` | Branding + email |
| `mobile/lib/screens/splash_screen.dart` | FleetNimble |
| `mobile/lib/services/mqtt_service.dart` | `fleetnimble-mobile-1.0.0` |
| `mobile/android/app/build.gradle` | `com.fleetnimble.mobile` |
| `mobile/android/app/src/main/AndroidManifest.xml` | App label FleetNimble |

### Scripts & infra
| File | Changes |
|------|---------|
| `scripts/start.ps1` | FleetNimble + credentials |
| `scripts/setup.ps1` | FleetNimble + credentials |
| `infra/emqx/acl.conf` | Comment header |

### Documentation
| File | Changes |
|------|---------|
| `README.md` | Product name, admin email, fleetnimble.com |
| `SETUP.md` | FleetNimble setup labels + credentials |
| `docs/architecture/README.md` | FleetNimble architecture |
| `docs/architecture/ENTERPRISE_ARCHITECTURE.md` | FleetNimble throughout |
| `docs/architecture/FRONTEND_ARCHITECTURE.md` | Removed competitor Fleetio reference |
| `docs/MQTT_PHASE2.md` | Admin email |
| `docs/fleetnimble/AI_HANDOFF_PACKAGE.md` | Updated credentials |
| `docs/fleetnimble/BRANDING_MIGRATION_REPORT.md` | Pointer to this report |

---

## Files created

| File | Purpose |
|------|---------|
| `mobile/android/app/src/main/kotlin/com/fleetnimble/mobile/MainActivity.kt` | New Android package |
| `backend/prisma/migrations/20260606150000_fleetnimble_admin_email/migration.sql` | Migrate existing admin rows |

## Files deleted

| File | Reason |
|------|--------|
| `mobile/android/app/src/main/kotlin/com/fleetos/mobile/MainActivity.kt` | Replaced by `com.fleetnimble.mobile` |

---

## References replaced

| Legacy | Replacement |
|--------|-------------|
| FleetOS | FleetNimble |
| FleetIO / fleetio | FleetNimble (or removed from competitor refs) |
| admin@fleet.io | admin@fleetnimble.com |
| fleet.io (domain) | fleetnimble.com |
| com.fleetos.mobile | com.fleetnimble.mobile |
| Fleet API running | FleetNimble API running |
| fleet-api | fleetnimble-api |
| fleet-dashboard | fleetnimble-dashboard |
| fleet_mobile | fleetnimble_mobile |

---

## Build verification

| Target | Command | Result |
|--------|---------|--------|
| Frontend | `npm run build` | **PASS** (Vite production build) |
| Backend | `node --check src/server.js` | **PASS** |
| Android | `flutter build apk --debug` | **SKIPPED** — Flutter not on PATH in this environment |

---

## Authentication after migration

1. **Fresh install:** `npm run db:seed` creates `admin@fleetnimble.com` / `Admin123!`
2. **Existing database:** Run `npx prisma migrate deploy` — migration `20260606150000_fleetnimble_admin_email` updates legacy admin row automatically
3. **Login screens** (web + mobile) pre-fill `admin@fleetnimble.com`

---

## Remaining manual actions

1. **Run DB migration** on your Postgres instance:
   ```powershell
   cd backend
   npx prisma migrate deploy
   ```
2. **Android build** on a machine with Flutter SDK:
   ```powershell
   cd mobile
   flutter pub get
   flutter build apk --debug
   ```
   Note: `applicationId` changed — uninstall old `com.fleetos.mobile` APK before installing new build.
3. **Production domain:** Point DNS `fleetnimble.com` and update `CORS_ORIGIN` / `VITE_API_URL` when deploying.
4. **One migration SQL line** retains `admin@fleet.io` in a `WHERE` clause only — required to update existing rows; not used at runtime.

---

## Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Zero FleetIO in application source | ✅ |
| Zero FleetOS in application source | ✅ |
| Zero admin@fleet.io in application source | ✅ |
| Login shows FleetNimble branding | ✅ |
| Backend logs FleetNimble API | ✅ |
| Android manifest/app label FleetNimble | ✅ |
| Documentation updated | ✅ |
| Frontend builds | ✅ |
| Backend syntax valid | ✅ |
| Cleanup report produced | ✅ |
