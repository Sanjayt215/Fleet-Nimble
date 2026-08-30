// Safe read-only diagnostic for Prisma migration state
// NEVER modifies data, never logs credentials

import dotenv from 'dotenv';

dotenv.config();

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

const FAILED_MIGRATION = '20260828120000_add_tenant_scoping_to_models';

try {
  console.log('=== PRISMA MIGRATION STATE DIAGNOSTIC ===\n');
  
  // Check _prisma_migrations table
  const migrations = await prisma.$queryRawUnsafe(`
    SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
    FROM _prisma_migrations
    ORDER BY started_at DESC
  `);
  
  console.log('Migration History:');
  if (migrations.length === 0) {
    console.log('  No migrations recorded in _prisma_migrations table');
  } else {
    for (const m of migrations) {
      const status = m.rolled_back_at ? 'ROLLED_BACK' : (m.finished_at ? 'APPLIED' : 'IN_PROGRESS');
      const isFailed = m.migration_name === FAILED_MIGRATION && !m.finished_at && !m.rolled_back_at;
      const marker = isFailed ? ' ❌ FAILED' : '';
      console.log(`  ${m.migration_name}`);
      console.log(`    Status: ${status}${marker}`);
      console.log(`    Started: ${m.started_at}`);
      console.log(`    Finished: ${m.finished_at || 'NULL'}`);
      console.log(`    Rolled Back: ${m.rolled_back_at || 'NULL'}`);
      console.log(`    Applied Steps: ${m.applied_steps_count}`);
      console.log('');
    }
  }
  
  // Check if the failed migration's schema changes are partially applied
  console.log('\n=== SCHEMA STATE CHECK ===\n');
  
  const tablesToCheck = [
    'conversation_timeline_events',
    'conversation_summaries',
    'conversation_analytics',
    'follow_up_reminders',
    'knowledge_sources',
    'knowledge_sync_runs',
    'knowledge_staged_articles',
    'receptionist_customer_notes',
    'ai_receptionist_audit_logs',
    'ai_receptionist_configs'
  ];
  
  for (const table of tablesToCheck) {
    try {
      const result = await prisma.$queryRawUnsafe(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = $1
        AND column_name = 'company_id'
      `, table);
      
      if (result.length > 0) {
        console.log(`✅ ${table}.company_id exists`);
        console.log(`   Type: ${result[0].data_type}, Nullable: ${result[0].is_nullable}`);
      } else {
        console.log(`❌ ${table}.company_id MISSING`);
      }
    } catch (err) {
      console.log(`⚠️  ${table}: ${err.message}`);
    }
  }
  
  // Check indexes
  console.log('\n=== INDEX STATE CHECK ===\n');
  
  const indexesToCheck = [
    'conversation_timeline_events_company_id_idx',
    'conversation_summaries_company_id_idx',
    'conversation_analytics_company_id_idx',
    'follow_up_reminders_company_id_idx',
    'knowledge_sources_company_id_idx',
    'knowledge_sync_runs_company_id_idx',
    'knowledge_staged_articles_company_id_idx',
    'receptionist_customer_notes_company_id_idx',
    'ai_receptionist_audit_logs_company_id_idx'
  ];
  
  for (const indexName of indexesToCheck) {
    try {
      const result = await prisma.$queryRawUnsafe(`
        SELECT indexname, tablename
        FROM pg_indexes
        WHERE indexname = $1
      `, indexName);
      
      if (result.length > 0) {
        console.log(`✅ Index ${indexName} exists on ${result[0].tablename}`);
      } else {
        console.log(`❌ Index ${indexName} MISSING`);
      }
    } catch (err) {
      console.log(`⚠️  Index ${indexName}: ${err.message}`);
    }
  }
  
  // Check AiReceptionistConfig constraints
  console.log('\n=== AI_RECEPTIONIST_CONFIGS CONSTRAINTS ===\n');
  
  try {
    const constraints = await prisma.$queryRawUnsafe(`
      SELECT conname, contype
      FROM pg_constraint
      WHERE conrelid = 'ai_receptionist_configs'::regclass
      AND contype = 'u'
    `);
    
    console.log('Unique constraints on ai_receptionist_configs:');
    for (const c of constraints) {
      console.log(`  ${c.conname}`);
    }
  } catch (err) {
    console.log(`⚠️  Constraint check failed: ${err.message}`);
  }
  
  // Check if FleetNimble company exists
  console.log('\n=== FLEETNIMBLE COMPANY ===\n');
  
  try {
    const company = await prisma.$queryRawUnsafe(`
      SELECT id, name, slug
      FROM companies
      WHERE name = 'FleetNimble' OR slug = 'fleetnimble'
    `);
    
    if (company.length > 0) {
      console.log(`✅ FleetNimble company exists`);
      console.log(`   ID: ${company[0].id}`);
      console.log(`   Name: ${company[0].name}`);
      console.log(`   Slug: ${company[0].slug}`);
    } else {
      console.log(`❌ FleetNimble company MISSING`);
    }
  } catch (err) {
    console.log(`⚠️  Company check failed: ${err.message}`);
  }
  
  // Check for NULL company_id values
  console.log('\n=== NULL COMPANY_ID CHECK ===\n');
  
  for (const table of tablesToCheck) {
    try {
      const result = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as null_count
        FROM ${table}
        WHERE company_id IS NULL
      `);
      
      console.log(`${table}: ${result[0].null_count} records with NULL company_id`);
    } catch (err) {
      console.log(`⚠️  ${table}: ${err.message}`);
    }
  }
  
  console.log('\n=== DIAGNOSTIC COMPLETE ===');
  
} catch (err) {
  console.error(`\n❌ DIAGNOSTIC ERROR: ${err.message}`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
