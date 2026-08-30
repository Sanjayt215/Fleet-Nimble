// Safe diagnostic script for company existence
// READ-ONLY - never modifies data

import dotenv from 'dotenv';

dotenv.config();

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

const DEFAULT_COMPANY_SLUG = 'default';

try {
  console.log('=== COMPANY DIAGNOSTIC ===\n');
  
  const company = await prisma.company.findUnique({
    where: { slug: DEFAULT_COMPANY_SLUG },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true
    }
  });

  if (!company) {
    console.log('❌ COMPANY NOT FOUND');
    console.log(`   Slug: ${DEFAULT_COMPANY_SLUG}`);
    console.log('   The default company does not exist in the database.');
    console.log('\nROOT CAUSE: Company missing - seed script will create it');
    process.exit(1);
  }

  console.log('✅ COMPANY FOUND');
  console.log(`   ID: ${company.id}`);
  console.log(`   Name: ${company.name}`);
  console.log(`   Slug: ${company.slug}`);
  console.log(`   Created: ${company.createdAt.toISOString()}`);
  
  console.log('\n=== DIAGNOSTIC COMPLETE ===');
  console.log('Default company exists. Seed script can proceed.');
  
} catch (err) {
  console.error(`\n❌ DIAGNOSTIC ERROR: ${err.message}`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
