// Deployment configuration verification script
// Safely reports database connection configuration without exposing credentials

import dotenv from 'dotenv';

dotenv.config();

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

const dbUrl = getUrl('DATABASE_URL');
const directUrl = getUrl('DIRECT_DATABASE_URL');

console.log('=== DEPLOYMENT CONFIGURATION VERIFICATION ===\n');

console.log('DATABASE_URL:');
if (!dbUrl) {
  console.log('  ❌ NOT SET');
} else {
  console.log(`  ✅ Configured`);
  console.log(`  Host: ${urlHost(dbUrl)}`);
  console.log(`  Type: ${classifyHost(urlHost(dbUrl))}`);
  console.log(`  Protocol: ${dbUrl.split(':')[0]}://`);
}

console.log('\nDIRECT_DATABASE_URL:');
if (!directUrl) {
  console.log('  ❌ NOT SET');
  console.log('  ⚠️  CRITICAL: Migrations will fail with P1002 advisory lock error');
} else {
  console.log(`  ✅ Configured`);
  console.log(`  Host: ${urlHost(directUrl)}`);
  console.log(`  Type: ${classifyHost(urlHost(directUrl))}`);
  console.log(`  Protocol: ${directUrl.split(':')[0]}://`);
  
  if (/-pooler/i.test(directUrl)) {
    console.log('  ❌ ERROR: DIRECT_DATABASE_URL contains -pooler');
    console.log('  ⚠️  CRITICAL: Migrations will fail with P1002 advisory lock error');
    console.log('  Fix: Remove -pooler suffix from DIRECT_DATABASE_URL hostname');
  }
}

console.log('\n=== CONFIGURATION STATUS ===');

if (!dbUrl) {
  console.log('❌ DATABASE_URL missing - application cannot connect');
} else if (/-pooler/i.test(dbUrl)) {
  console.log('✅ DATABASE_URL is pooled (correct for application runtime)');
} else {
  console.log('⚠️  DATABASE_URL is not pooled (may be intentional)');
}

if (!directUrl) {
  console.log('❌ DIRECT_DATABASE_URL missing - migrations will fail');
} else if (/-pooler/i.test(directUrl)) {
  console.log('❌ DIRECT_DATABASE_URL is pooled - migrations will fail');
} else {
  console.log('✅ DIRECT_DATABASE_URL is direct (correct for migrations)');
}

console.log('\n=== EXPECTED CONFIGURATION ===');
console.log('DATABASE_URL: pooled endpoint (contains -pooler)');
console.log('DIRECT_DATABASE_URL: direct endpoint (NO -pooler)');
console.log('\nMigration command: npm run db:migrate:deploy');
console.log('This executes: node scripts/db-migrate-deploy.js');
console.log('The wrapper validates and uses DIRECT_DATABASE_URL for migrations');

console.log('\n=== VERIFICATION COMPLETE ===');
