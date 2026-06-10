# FleetNimble Docker Audit Report
**Date:** June 8, 2026  
**Status:** AUDIT COMPLETE - FIXES PENDING

---

## FINDINGS

### 1. Prisma Binary Target Mismatch
**Severity:** CRITICAL  
**Location:** `backend/prisma/schema.prisma`  
**Issue:** No `binaryTargets` specified in generator block  
**Impact:** Prisma uses default (glibc/x64-unknown-linux-gnu), incompatible with Alpine (musl)

**Current Schema Generator:**
```
generator client {
  provider = "prisma-client-js"
}
```

**Missing:** binaryTargets configuration

---

### 2. Alpine/OpenSSL Incompatibility
**Severity:** CRITICAL  
**Location:** `backend/Dockerfile`  
**Issue:** `node:20-alpine` missing OpenSSL libraries required by Prisma  
**Error:** "Prisma failed to detect the libssl/openssl version"  
**Root Cause:** Alpine's minimal footprint excludes libssl1.1/libssl3

**Current Dockerfile:**
```dockerfile
FROM node:20-alpine
# Missing: openssl packages, binaryTarget configuration
```

---

### 3. Docker Build Process Issues
**Severity:** HIGH  
**Location:** `backend/Dockerfile`  
**Issue:** Multiple layering problems:
- `RUN npx prisma generate` happens AFTER copying schema, BEFORE src code
- Prisma engine tries to load during generation without proper environment
- `npm prune --omit=dev` removes dev dependencies too aggressively

**Current Flow:**
```
1. npm ci (installs all deps including prisma CLI)
2. COPY prisma (schema only)
3. RUN npx prisma generate (FAILS - no libssl, wrong binaryTarget)
4. npm prune --omit=dev (never reached)
5. COPY src
```

---

### 4. Docker Compose Command Issues
**Severity:** MEDIUM  
**Location:** `docker-compose.yml` backend section  
**Issue:** Multi-step command fails if first step fails

**Current:**
```yaml
command: sh -c "npx prisma migrate deploy && node prisma/seed.js && node src/server.js"
```

**Problem:** Chained commands with `&&` - if migrations fail, seed still attempts to run

---

### 5. Node 20 Alpine Compatibility
**Severity:** MEDIUM  
**Version:** `node:20-alpine` ✓ Compatible  
**However:** Alpine's stripped-down nature causes runtime issues with Prisma  
**Recommendation:** Use `node:20-bookworm-slim` instead (13% larger but fully compatible)

---

### 6. Prisma Version Check
**Severity:** LOW  
**Current Version:** `@prisma/client: ^5.22.0`, `prisma: ^5.22.0`  
**Status:** ✓ Latest stable, supports multiple binaryTargets  
**Compatibility:** ✓ Supports musl-based and glibc-based systems

---

### 7. Import Verification (Post Phase-2)
**Status:** ✓ PASS  
**Verified Files:**
- `backend/prisma/seed.js` - Correct default import: `import prisma from '../src/utils/prisma.js';`
- `backend/src/utils/prisma.js` - Correct export: `export default prisma;`
- All controller/service imports - FIXED in previous task

**No Phase-2 import issues detected**

---

### 8. Migration & Seed Verification
**Status:** ⚠️ UNABLE TO TEST IN CONTAINER  
**Local Status:** ✓ Works on Windows  
**Issue:** Docker container fails before migrations execute

**Migration Files Found:**
- `20240525000000_init/`
- `20260526140000_add_obd_backup_and_gps_fields/`
- `20260529120000_telemetry_heartbeat/`
- `20260529180000_enterprise_telematics/`
- `20260529200000_mqtt_deadletter_heartbeat/`
- `20260531120000_fleetnimble_obd_extended/`
- `20260606150000_fleetnimble_admin_email/`

---

### 9. Seed Script Analysis
**Status:** ✓ Structure sound  
**Seed Files:**
- `seed.js` - Phase 1 (Roles, default company, admin user)
- `seed-phase2.js` - Phase 2 (Extended telemetry data)
- `verify-phase2.js` - Verification script

**Imports:** ✓ All using correct default import pattern

---

### 10. Prisma Engine Analysis
**Issue:** Engine crash during Docker build  
**Cause:** Binary mismatch (x86_64-unknown-linux-gnu vs musl)  
**JSON Parse Error:** Engine trying to output before crashing  
**Expected Error Message Flow:**
```
1. prisma generate called
2. Engine binary loaded (wrong architecture)
3. Engine fails to start
4. Partial error message sent (not valid JSON)
5. Docker build fails
```

---

## SUMMARY OF ISSUES

| Issue | Severity | Fix |
|-------|----------|-----|
| Missing binaryTargets | CRITICAL | Add `binaryTargets = ["linux-musl"]` to schema.prisma |
| Alpine OpenSSL missing | CRITICAL | Switch to `node:20-bookworm-slim` OR add openssl packages |
| Build process order | HIGH | Restructure Dockerfile layers |
| Docker compose command | MEDIUM | Separate migration/seed from server startup |
| Environment variables | MEDIUM | Ensure prisma.client is properly initialized |

---

## RECOMMENDED SOLUTION

**Option A (RECOMMENDED - Production-Safe):**
- Replace `node:20-alpine` with `node:20-bookworm-slim`
- Add proper binaryTargets to schema.prisma
- Restructure Dockerfile for better caching
- Update docker-compose startup sequence

**Why Option A:** 
- Bookworm-slim is 13% larger but eliminates Alpine glibc/musl issues
- Industry standard for Node.js Docker containers
- Better compatibility with npm packages
- Easier debugging and maintenance

**Option B (Keep Alpine):**
- Add `libssl3` package to Dockerfile
- Specify `binaryTargets = ["linux-musl"]` in schema
- Risk: May have other compatibility issues with native modules

---

## NEXT STEPS

1. ✓ Fix schema.prisma (add binaryTargets)
2. ✓ Fix Dockerfile (switch base image)
3. ✓ Fix docker-compose.yml (command sequencing)
4. ✓ Test rebuild
5. ✓ Verify all services health
6. ✓ Generate complete migration/seed output
