// Safe diagnostic script for admin user authentication issues
// READ-ONLY - never modifies data, never logs passwords or full hashes

import dotenv from 'dotenv';

dotenv.config();

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@fleetnimble.com';

function describeHash(hash) {
  if (!hash || typeof hash !== 'string') return { format: 'missing', length: 0 };
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
    return { format: 'bcrypt', rounds: Number(hash.split('$')[2] || 0), length: hash.length };
  }
  return { format: 'unknown', length: hash.length };
}

try {
  console.log('=== ADMIN USER DIAGNOSTIC ===\n');
  
  const user = await prisma.user.findFirst({
    where: { email: ADMIN_EMAIL },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      roleId: true,
      companyId: true,
      deletedAt: true,
      createdAt: true,
      role: {
        select: { name: true }
      }
    }
  });

  if (!user) {
    console.log('❌ USER NOT FOUND');
    console.log(`   Email: ${ADMIN_EMAIL}`);
    console.log('   The admin user does not exist in the database.');
    console.log('\nROOT CAUSE: User missing - need to run bootstrap script');
    process.exit(1);
  }

  console.log('✅ USER FOUND');
  console.log(`   ID: ${user.id}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Name: ${user.name}`);
  console.log(`   Role: ${user.role?.name}`);
  console.log(`   Company ID: ${user.companyId || 'NULL'}`);
  console.log(`   Created: ${user.createdAt.toISOString()}`);
  
  const hashInfo = describeHash(user.passwordHash);
  console.log(`   Password Hash: ${hashInfo.format} (rounds: ${hashInfo.rounds}, length: ${hashInfo.length})`);
  
  if (user.deletedAt) {
    console.log(`   ⚠️  DELETED: ${user.deletedAt.toISOString()}`);
    console.log('\nROOT CAUSE: User is soft-deleted');
    process.exit(1);
  }

  if (hashInfo.format !== 'bcrypt') {
    console.log('\n⚠️  WARNING: Password hash is not in bcrypt format');
    console.log('ROOT CAUSE: Invalid password hash format');
    process.exit(1);
  }

  // Check organization membership
  if (user.companyId) {
    const membership = await prisma.organizationMember.findFirst({
      where: {
        userId: user.id,
        organizationId: user.companyId,
        status: 'ACTIVE'
      }
    });
    
    if (membership) {
      console.log(`   Organization Membership: ACTIVE (role: ${membership.role})`);
    } else {
      console.log(`   Organization Membership: NONE or INACTIVE`);
    }
  } else {
    console.log(`   Organization Membership: No companyId set`);
  }

  console.log('\n=== DIAGNOSTIC COMPLETE ===');
  console.log('User exists with valid bcrypt hash.');
  console.log('If login still fails, the password being used may not match the stored hash.');
  console.log('To reset password safely, run: node scripts/bootstrap-admin.mjs');
  
} catch (err) {
  console.error(`\n❌ DIAGNOSTIC ERROR: ${err.message}`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
