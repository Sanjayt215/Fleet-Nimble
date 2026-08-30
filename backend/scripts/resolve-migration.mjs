// Safe migration resolution script
// Marks the failed migration as applied since schema changes are already present
// This is safe because the diagnostic confirmed all columns and indexes exist

import dotenv from 'dotenv';

dotenv.config();

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

const FAILED_MIGRATION = '20260828120000_add_tenant_scoping_to_models';

try {
  console.log('=== MIGRATION RESOLUTION ===\n');
  
  // Check current migration state
  const migration = await prisma.$queryRawUnsafe(`
    SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
    FROM _prisma_migrations
    WHERE migration_name = $1
  `, FAILED_MIGRATION);
  
  if (migration.length === 0) {
    console.log('Migration not found in _prisma_migrations table');
    process.exit(0);
  }
  
  console.log('Current state:');
  console.log(`  Migration: ${migration[0].migration_name}`);
  console.log(`  Started: ${migration[0].started_at}`);
  console.log(`  Finished: ${migration[0].finished_at}`);
  console.log(`  Rolled Back: ${migration[0].rolled_back_at}`);
  console.log(`  Applied Steps: ${migration[0].applied_steps_count}`);
  
  if (migration[0].finished_at) {
    console.log('\nMigration already marked as finished');
    process.exit(0);
  }
  
  if (migration[0].rolled_back_at) {
    console.log('\nMigration was marked as rolled back. Unmarking...');
    await prisma.$queryRawUnsafe(`
      UPDATE _prisma_migrations
      SET rolled_back_at = NULL
      WHERE migration_name = $1
    `, FAILED_MIGRATION);
  }
  
  // Mark as finished since schema changes are already applied
  console.log('\nMarking migration as finished (schema changes already present)...');
  await prisma.$queryRawUnsafe(`
    UPDATE _prisma_migrations
    SET finished_at = NOW(), applied_steps_count = 1
    WHERE migration_name = $1
  `, FAILED_MIGRATION);
  
  console.log('✅ Migration marked as finished');
  console.log('\nThe migration is now considered applied.');
  console.log('The repair migration (20260828140000) will handle any remaining data backfill.');
  
} catch (err) {
  console.error(`\n❌ RESOLUTION ERROR: ${err.message}`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
