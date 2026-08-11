#!/usr/bin/env node
/**
 * Read-only diagnosis of Prisma migration advisory locks.
 *
 * Connects through the DIRECT (unpooled) endpoint and inspects:
 *  - pg_stat_activity sessions running advisory-lock queries
 *  - pg_locks entries of type 'advisory' (Prisma migrate uses key 72707369)
 *
 * SELECT-only. It never modifies data, kills sessions, or takes locks.
 */
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const directUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (!directUrl) {
  console.error('[MIGRATE-DIAGNOSE] No DIRECT_DATABASE_URL / DATABASE_URL set.');
  process.exit(1);
}

const client = new PrismaClient({
  datasources: { db: { url: directUrl } },
});

try {
  const activities = await client.$queryRawUnsafe(`
    SELECT pid, usename, application_name, state, wait_event_type, wait_event,
           query_start, LEFT(query, 160) AS query
    FROM pg_stat_activity
    WHERE query ILIKE '%advisory%'
       OR wait_event = 'advisory'
       OR wait_event_type = 'Lock'
    ORDER BY query_start NULLS LAST
  `);

  const locks = await client.$queryRawUnsafe(`
    SELECT pid, classid, objid, granted, mode
    FROM pg_locks
    WHERE locktype = 'advisory'
    ORDER BY pid
  `);

  console.log(`[MIGRATE-DIAGNOSE] host: ${new URL(directUrl).host}`);
  console.log(`[MIGRATE-DIAGNOSE] advisory lock holders: ${locks.length}`);
  for (const lock of locks) {
    const key = lock.classid === 72707369 ? ' (Prisma migrate lock 72707369)' : '';
    console.log(
      `  pid=${lock.pid} classid=${lock.classid} objid=${lock.objid} granted=${lock.granted} mode=${lock.mode}${key}`
    );
  }
  console.log(`[MIGRATE-DIAGNOSE] migration/lock-related sessions: ${activities.length}`);
  for (const row of activities) {
    console.log(
      `  pid=${row.pid} user=${row.usename} app=${row.application_name || '-'} state=${row.state} ` +
        `wait=${row.wait_event || '-'} started=${row.query_start || '-'} query="${(row.query || '').trim()}"`
    );
  }
} catch (error) {
  console.error(`[MIGRATE-DIAGNOSE] failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.$disconnect();
}
