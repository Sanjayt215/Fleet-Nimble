#!/usr/bin/env node
/**
 * Production migration deploy wrapper.
 *
 * Guarantees:
 *  - Migrations ALWAYS run through the DIRECT (unpooled) database connection.
 *    Neon pooled endpoints route through PgBouncer (transaction mode), which
 *    cannot hold session-scoped pg_advisory_lock() — the exact cause of P1002.
 *  - No silent fallback: if DIRECT_DATABASE_URL is missing or points at a
 *    pooler, this fails with a clear configuration error (Prisma itself
 *    silently falls back to the pooled DATABASE_URL in that case).
 *  - Concurrent-deploy safety: transient P1002 (advisory-lock contention from
 *    another deployment) is retried with exponential backoff.
 *  - Genuine migration failures exit non-zero and are never ignored.
 *  - Credentials are never printed; only scheme + host are logged.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(backendRoot, 'prisma', 'schema.prisma');
const prismaCli = path.join(backendRoot, 'node_modules', 'prisma', 'build', 'index.js');

const RETRY_DELAYS_MS = [5000, 10000, 20000, 30000, 60000];
const LOCK_MARKERS = ['P1002', 'advisory lock', 'advisory_lock'];

function getUrl(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

function urlHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return '<unparseable>';
  }
}

function fatal(message) {
  console.error(`\n[MIGRATE-DEPLOY] FATAL: ${message}\n`);
  process.exit(1);
}

const dbUrl = getUrl('DATABASE_URL');
const directUrl = getUrl('DIRECT_DATABASE_URL');

console.log('[MIGRATE-DEPLOY] verifying database configuration...');

if (!dbUrl) {
  fatal('DATABASE_URL is not set. It must be the pooled PostgreSQL connection string used by the application.');
}
if (!/^postgres(ql)?:\/\//i.test(dbUrl)) {
  fatal('DATABASE_URL is not a PostgreSQL connection string (expected postgres:// or postgresql://).');
}
if (!directUrl) {
  fatal(
    'DIRECT_DATABASE_URL is not set. Prisma Migrate would silently fall back to the pooled ' +
      `DATABASE_URL (host ${urlHost(dbUrl)}), which fails with P1002 because Neon's pooled endpoint uses PgBouncer and ` +
      'cannot hold pg_advisory_lock(). Set DIRECT_DATABASE_URL to the DIRECT (non-pooled) Neon endpoint ' +
      '(same connection string but host WITHOUT the "-pooler" suffix) in the deployment environment, then redeploy.'
  );
}
if (!/^postgres(ql)?:\/\//i.test(directUrl)) {
  fatal('DIRECT_DATABASE_URL is not a PostgreSQL connection string (expected postgres:// or postgresql://).');
}
if (/-pooler/i.test(directUrl)) {
  fatal(
    `DIRECT_DATABASE_URL points at a pooled endpoint (host ${urlHost(directUrl)}). ` +
      'Migrations MUST use the direct Neon endpoint: remove the "-pooler" suffix from the host. ' +
      'Do not reuse DATABASE_URL. Example: ep-xxxxx-123.us-east-1.aws.neon.tech (NOT ep-xxxxx-123-pooler...).'
  );
}

console.log(`[MIGRATE-DEPLOY] application connection : host ${urlHost(dbUrl)} (pooled)`);
console.log(`[MIGRATE-DEPLOY] migration connection   : host ${urlHost(directUrl)} (direct)`);
console.log(`[MIGRATE-DEPLOY] schema                  : ${schemaPath}`);

function runMigrateDeploy() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schemaPath], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
      process.stderr.write(chunk);
    });
    child.on('close', (code) => resolve({ code, output }));
  });
}

function isLockContention(output) {
  const lower = output.toLowerCase();
  return LOCK_MARKERS.some((marker) => lower.includes(marker.toLowerCase()));
}

for (let attempt = 1; ; attempt++) {
  console.log(`[MIGRATE-DEPLOY] running prisma migrate deploy (attempt ${attempt})...`);
  const { code, output } = await runMigrateDeploy();
  if (code === 0) {
    console.log('[MIGRATE-DEPLOY] migrations applied successfully.');
    process.exit(0);
  }
  if (!isLockContention(output)) {
    fatal(`prisma migrate deploy failed (exit code ${code}) - see output above.`);
  }
  if (attempt > RETRY_DELAYS_MS.length) {
    fatal(
      'prisma migrate deploy kept failing with P1002 (postgres advisory lock contention) after ' +
        `${attempt} attempts. Another migration process is holding pg_advisory_lock(72707369). ` +
        'Wait for the other deployment to finish and retry. If a previous deployment leaked the lock ' +
        'through the pooled endpoint, restart the Neon compute (Neon console -> Compute -> Restart) ' +
        'to clear orphaned sessions, then redeploy.'
    );
  }
  const delay = RETRY_DELAYS_MS[attempt - 1];
  console.log(`[MIGRATE-DEPLOY] advisory-lock contention detected (P1002). Retrying in ${delay / 1000}s...`);
  await new Promise((resolve) => setTimeout(resolve, delay));
}
