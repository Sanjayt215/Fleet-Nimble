// Check migration status
import dotenv from 'dotenv';

dotenv.config();

const directUrl = process.env.DIRECT_DATABASE_URL;
if (!directUrl) {
  console.error('DIRECT_DATABASE_URL is not set');
  process.exit(1);
}

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: directUrl } },
});

try {
  console.log('=== MIGRATION STATUS CHECK ===\n');
  
  // Check _prisma_migrations table
  const migrations = await prisma.$queryRawUnsafe(`
    SELECT migration_name, started_at, finished_at, applied_steps_count, checksum
    FROM _prisma_migrations
    ORDER BY started_at DESC
  `);
  
  console.log(`Total migrations: ${migrations.length}\n`);
  
  const lastMigration = migrations[0];
  if (lastMigration) {
    console.log('Last migration:');
    console.log(`  Name: ${lastMigration.migration_name}`);
    console.log(`  Started: ${lastMigration.started_at}`);
    console.log(`  Finished: ${lastMigration.finished_at}`);
    console.log(`  Steps: ${lastMigration.applied_steps_count}`);
    
    if (!lastMigration.finished_at) {
      console.log('  ⚠️  STATUS: INCOMPLETE (not finished)');
    } else {
      console.log('  ✅ STATUS: COMPLETED');
    }
  }
  
  // Check for any incomplete migrations
  const incomplete = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as count
    FROM _prisma_migrations
    WHERE finished_at IS NULL
  `);
  
  console.log(`\nIncomplete migrations: ${incomplete[0].count}`);
  
  // Check for active sessions
  const sessions = await prisma.$queryRawUnsafe(`
    SELECT pid, application_name, state, query_start
    FROM pg_stat_activity
    WHERE application_name LIKE '%prisma%'
    OR query LIKE '%migrate%'
  `);
  
  console.log(`\nActive Prisma/migration sessions: ${sessions.length}`);
  sessions.forEach(s => {
    console.log(`  PID: ${s.pid}, App: ${s.application_name}, State: ${s.state}`);
  });
  
} catch (err) {
  console.error(`\n❌ ERROR: ${err.message}`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
