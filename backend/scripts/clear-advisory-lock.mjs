// Safe script to clear Prisma migration advisory lock
// Only clears the specific Prisma migration lock (72707369)

import dotenv from 'dotenv';

dotenv.config();

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

const PRISMA_LOCK_KEY = 72707369;

try {
  console.log('=== ADVISORY LOCK CLEARANCE ===\n');
  
  // Check current lock state
  const locks = await prisma.$queryRawUnsafe(`
    SELECT pid, classid, objid, granted, mode
    FROM pg_locks
    WHERE locktype = 'advisory' AND objid = $1
  `, PRISMA_LOCK_KEY);
  
  console.log(`Found ${locks.length} advisory lock(s) for Prisma migrate (key ${PRISMA_LOCK_KEY})`);
  
  if (locks.length === 0) {
    console.log('No Prisma migration lock found. Nothing to clear.');
    process.exit(0);
  }
  
  for (const lock of locks) {
    console.log(`  PID ${lock.pid}: granted=${lock.granted} mode=${lock.mode}`);
    
    // Terminate the session holding the lock
    console.log(`  Terminating session ${lock.pid}...`);
    await prisma.$queryRawUnsafe(`SELECT pg_terminate_backend($1::integer)`, lock.pid);
    console.log(`  ✅ Session ${lock.pid} terminated`);
  }
  
  console.log('\n✅ All Prisma migration locks cleared');
  console.log('You can now run: npx prisma migrate deploy');
  
} catch (err) {
  console.error(`\n❌ LOCK CLEARANCE ERROR: ${err.message}`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
