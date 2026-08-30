// Safe migration resolution script for repair_tenant_scoping
// Marks the failed repair migration as rolled back so it can be removed

import dotenv from 'dotenv';

dotenv.config();

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

const FAILED_MIGRATION = '20260828140000_repair_tenant_scoping';

try {
  console.log('=== REPAIR MIGRATION RESOLUTION ===\n');
  
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
  
  if (migration[0].rolled_back_at) {
    console.log('\nMigration already marked as rolled back');
    process.exit(0);
  }
  
  // Mark as rolled back since we will delete this migration
  console.log('\nMarking migration as rolled back (will be deleted)...');
  await prisma.$queryRawUnsafe(`
    UPDATE _prisma_migrations
    SET rolled_back_at = NOW()
    WHERE migration_name = $1
  `, FAILED_MIGRATION);
  
  console.log('✅ Migration marked as rolled back');
  console.log('\nYou can now delete the migration folder and run: npx prisma migrate deploy');
  
} catch (err) {
  console.error(`\n❌ RESOLUTION ERROR: ${err.message}`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
