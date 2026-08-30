// Resolve incomplete migrations by marking them as rolled back
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
  console.log('=== RESOLVE INCOMPLETE MIGRATIONS ===\n');
  
  // Get incomplete migrations
  const incomplete = await prisma.$queryRawUnsafe(`
    SELECT id, migration_name, started_at
    FROM _prisma_migrations
    WHERE finished_at IS NULL
    ORDER BY started_at
  `);
  
  console.log(`Found ${incomplete.length} incomplete migration(s):`);
  incomplete.forEach(m => {
    console.log(`  - ${m.migration_name} (started: ${m.started_at})`);
  });
  
  if (incomplete.length === 0) {
    console.log('No incomplete migrations to resolve');
    process.exit(0);
  }
  
  console.log('\nMarking as rolled back...');
  
  for (const migration of incomplete) {
    await prisma.$queryRawUnsafe(`
      UPDATE _prisma_migrations
      SET finished_at = NOW(),
          applied_steps_count = 0
      WHERE id = $1
    `, migration.id);
    console.log(`  ✅ Marked ${migration.migration_name} as rolled back`);
  }
  
  console.log('\n✅ All incomplete migrations resolved');
  console.log('You can now run migrations again');
  
} catch (err) {
  console.error(`\n❌ ERROR: ${err.message}`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
