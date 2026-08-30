// Clear Prisma advisory lock using DIRECT_DATABASE_URL
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
  console.log('=== ADVISORY LOCK CLEARANCE (DIRECT) ===\n');
  
  // Check for locks
  const locks = await prisma.$queryRawUnsafe(`
    SELECT locktype, classid, objid, objsubid, pid, mode, granted
    FROM pg_locks
    WHERE locktype = 'advisory'
    AND classid = 72707369
  `);
  
  console.log(`Found ${locks.length} advisory lock(s) for key 72707369`);
  
  if (locks.length === 0) {
    console.log('No locks to clear');
    process.exit(0);
  }
  
  locks.forEach(lock => {
    console.log(`  Lock: pid=${lock.pid}, mode=${lock.mode}, granted=${lock.granted}`);
  });
  
  // Terminate the backend session holding the lock
  const result = await prisma.$queryRawUnsafe(`
    SELECT pg_terminate_backend(pid) as terminated
    FROM pg_locks
    WHERE locktype = 'advisory'
    AND classid = 72707369
    AND granted = true
  `);
  
  console.log(`\nTerminated ${result.length} session(s)`);
  console.log('✅ Lock cleared');
  
} catch (err) {
  console.error(`\n❌ ERROR: ${err.message}`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
