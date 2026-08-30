// Safe migration resolution script for organization_invitations
// Marks the failed migration as applied since the table already exists

import dotenv from 'dotenv';

dotenv.config();

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

const FAILED_MIGRATION = '20260828130000_add_organization_invitations';

try {
  console.log('=== ORGANIZATION INVITATIONS MIGRATION RESOLUTION ===\n');
  
  // Check if table exists
  const tableExists = await prisma.$queryRawUnsafe(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'organization_invitations'
    )
  `);
  
  console.log(`organization_invitations table exists: ${tableExists[0].exists}`);
  
  if (!tableExists[0].exists) {
    console.log('Table does not exist. Migration should be retried.');
    process.exit(1);
  }
  
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
  
  console.log('\nCurrent state:');
  console.log(`  Migration: ${migration[0].migration_name}`);
  console.log(`  Started: ${migration[0].started_at}`);
  console.log(`  Finished: ${migration[0].finished_at}`);
  console.log(`  Rolled Back: ${migration[0].rolled_back_at}`);
  console.log(`  Applied Steps: ${migration[0].applied_steps_count}`);
  
  if (migration[0].finished_at) {
    console.log('\nMigration already marked as finished');
    process.exit(0);
  }
  
  // Mark as finished since table already exists
  console.log('\nMarking migration as finished (table already exists)...');
  await prisma.$queryRawUnsafe(`
    UPDATE _prisma_migrations
    SET finished_at = NOW(), applied_steps_count = 1
    WHERE migration_name = $1
  `, FAILED_MIGRATION);
  
  console.log('✅ Migration marked as finished');
  console.log('\nThe migration is now considered applied.');
  
} catch (err) {
  console.error(`\n❌ RESOLUTION ERROR: ${err.message}`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
