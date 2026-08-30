// Check knowledge_staged_articles table schema
import dotenv from 'dotenv';

dotenv.config();

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

try {
  console.log('=== KNOWLEDGE_STAGED_ARTICLES SCHEMA CHECK ===\n');
  
  // Check if table exists
  const tableExists = await prisma.$queryRawUnsafe(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'knowledge_staged_articles'
    )
  `);
  
  console.log(`Table exists: ${tableExists[0].exists}`);
  
  if (!tableExists[0].exists) {
    console.log('Table does not exist. Migration may not have run.');
    process.exit(0);
  }
  
  // Get column information
  const columns = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'knowledge_staged_articles'
    ORDER BY ordinal_position
  `);
  
  console.log('\nColumns in database:');
  columns.forEach(col => {
    console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
  });
  
  // Check for rejectionReason specifically (mapped to rejection_reason in database)
  const hasRejectionReason = columns.some(col => col.column_name === 'rejection_reason');
  console.log(`\nrejectionReason column (mapped to rejection_reason) exists: ${hasRejectionReason}`);
  
  // Try a simple query
  console.log('\nTesting Prisma query...');
  try {
    const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "knowledge_staged_articles"`);
    console.log(`✅ Direct query successful: ${result[0].count} rows`);
  } catch (err) {
    console.log(`❌ Direct query failed: ${err.message}`);
  }
  
  // Disconnect to clear any cached plans
  await prisma.$disconnect();
  
  // Reconnect for Prisma client test
  const prisma2 = new PrismaClient();
  try {
    const result = await prisma2.knowledgeStagedArticle.findMany();
    console.log(`✅ Prisma client query successful: ${result.length} rows`);
  } catch (err) {
    console.log(`❌ Prisma client query failed: ${err.message}`);
  } finally {
    await prisma2.$disconnect();
  }
  
} catch (err) {
  console.error(`\n❌ ERROR: ${err.message}`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
