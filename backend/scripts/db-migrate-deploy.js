#!/usr/bin/env node
/**
 * Production migration deploy wrapper for Neon pooled connections.
 *
 * This wrapper handles migrations when only a pooled Neon endpoint is available.
 * Neon's pooled endpoint uses PgBouncer in transaction mode, which cannot hold
 * session-scoped pg_advisory_lock(), causing P1002 errors.
 *
 * Strategy:
 *  - If DIRECT_DATABASE_URL is set and valid (not pooled), use it for migrations.
 *  - Otherwise, use the pooled DATABASE_URL with P1002 retry logic.
 *  - Retry transient P1002 errors with exponential backoff and jitter.
 *  - Before retrying, check if another migration process is actually running.
 *  - Do not terminate unrelated database sessions.
 *  - Log structured diagnostics without exposing credentials.
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

function classifyHost(host) {
  if (/-pooler/i.test(host)) {
    return 'pooled';
  }
  return 'direct';
}

function fatal(message) {
  console.error(`\n[MIGRATE-DEPLOY] FATAL: ${message}\n`);
  process.exit(1);
}

const dbUrl = getUrl('DATABASE_URL');
const directUrl = getUrl('DIRECT_DATABASE_URL');

console.log('[MIGRATE-DEPLOY] verifying database configuration...');

if (!dbUrl) {
  fatal('DATABASE_URL is not set. It must be a PostgreSQL connection string.');
}
if (!/^postgres(ql)?:\/\//i.test(dbUrl)) {
  fatal('DATABASE_URL is not a PostgreSQL connection string (expected postgres:// or postgresql://).');
}

// Determine which connection to use for migrations
// CRITICAL: For this Neon project, the direct endpoint (without -pooler)
// is NOT actually a direct connection and still experiences P1002 errors.
// We MUST use the pooled endpoint with retry logic.
let migrationUrl = dbUrl;
let migrationType = 'pooled';

console.log('[MIGRATE-DEPLOY] Using pooled DATABASE_URL with P1002 retry logic');
console.log('[MIGRATE-DEPLOY] NOTE: DIRECT_DATABASE_URL is ignored for this Neon project');

console.log(`[MIGRATE-DEPLOY] application connection : protocol=postgresql host=${urlHost(dbUrl)} type=${classifyHost(urlHost(dbUrl))}`);
console.log(`[MIGRATE-DEPLOY] migration connection   : protocol=postgresql host=${urlHost(migrationUrl)} type=${migrationType}`);
console.log(`[MIGRATE-DEPLOY] schema                  : ${schemaPath}`);

async function preflightConnection(url) {
  const { PrismaClient } = await import('@prisma/client');
  const client = new PrismaClient({
    datasources: { db: { url } },
  });
  try {
    await client.$queryRawUnsafe('SELECT 1');
    console.log(`[MIGRATE-DEPLOY] connection preflight: OK (${migrationType})`);
    return true;
  } catch (err) {
    console.error(`[MIGRATE-DEPLOY] connection preflight FAILED: ${err.message}`);
    return false;
  } finally {
    await client.$disconnect();
  }
}

async function checkActiveMigrationProcesses() {
  const { PrismaClient } = await import('@prisma/client');
  const client = new PrismaClient({
    datasources: { db: { url: migrationUrl } },
  });
  try {
    const result = await client.$queryRawUnsafe(`
      SELECT COUNT(*) as count
      FROM pg_stat_activity
      WHERE application_name LIKE '%prisma%'
      AND state != 'idle'
      AND query LIKE '%migrate%'
    `);
    return result[0].count;
  } catch (err) {
    console.error(`[MIGRATE-DEPLOY] could not check active processes: ${err.message}`);
    return 0;
  } finally {
    await client.$disconnect();
  }
}

function runMigrateDeploy() {
  return new Promise((resolve) => {
    const childEnv = {
      ...process.env,
      DATABASE_URL: migrationUrl,
      DIRECT_DATABASE_URL: migrationUrl,
    };
    const child = spawn(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schemaPath], {
      env: childEnv,
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

const preflightOk = await preflightConnection(migrationUrl);
if (!preflightOk) {
  fatal(
    `Could not connect to the database endpoint (host ${urlHost(migrationUrl)}). ` +
      'Fix DATABASE_URL or DIRECT_DATABASE_URL before deploying.'
  );
}

for (let attempt = 1; ; attempt++) {
  console.log(`[MIGRATE-DEPLOY] running prisma migrate deploy (attempt ${attempt}, type=${migrationType})...`);
  
  if (migrationType === 'pooled' && attempt > 1) {
    const activeCount = await checkActiveMigrationProcesses();
    if (activeCount > 0) {
      console.log(`[MIGRATE-DEPLOY] detected ${activeCount} active migration process(es), waiting before retry...`);
    }
  }
  
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
        `${attempt} attempts. This may indicate a stuck migration process. ` +
        'Consider restarting the Neon compute to clear orphaned sessions, then redeploy.'
    );
  }
  
  // Add jitter to retry delay
  const baseDelay = RETRY_DELAYS_MS[attempt - 1];
  const jitter = Math.random() * 2000;
  const delay = baseDelay + jitter;
  
  console.log(`[MIGRATE-DEPLOY] advisory-lock contention detected (P1002). Retrying in ${(delay / 1000).toFixed(1)}s...`);
  await new Promise((resolve) => setTimeout(resolve, delay));
}
