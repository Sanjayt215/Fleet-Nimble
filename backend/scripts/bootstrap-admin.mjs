// Safe production bootstrap for an admin account.
//
// Idempotent. Never clobbers an existing VALID bcrypt hash unless BOOTSTRAP_ADMIN_FORCE=1.
// Password is taken from BOOTSTRAP_ADMIN_PASSWORD env (or --password arg) and is never
// logged. New/existing admins are bound to the same company as the AI Receptionist data
// (AI_RECEPTIONIST_DEFAULT_COMPANY_ID) so the dashboard shows persisted bookings.
//
// Usage (from backend/):
//   $env:BOOTSTRAP_ADMIN_PASSWORD='...' ; node scripts/bootstrap-admin.mjs
//   $env:BOOTSTRAP_ADMIN_PASSWORD='...' ; $env:BOOTSTRAP_ADMIN_EMAIL='...' ; node scripts/bootstrap-admin.mjs

import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const BCRYPT_ROUNDS = 12;
const DEFAULT_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@fleetnimble.com';

function argPassword() {
  const idx = process.argv.indexOf('--password');
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const rawPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || argPassword();
if (!rawPassword) {
  console.error('BOOTSTRAP_ADMIN_PASSWORD env (or --password arg) is required.');
  process.exit(1);
}
if (rawPassword.length < 10) {
  console.error('Password must be at least 10 characters.');
  process.exit(1);
}

const email = String(DEFAULT_EMAIL).trim().toLowerCase();
const companyId = process.env.BOOTSTRAP_ADMIN_COMPANY_ID || process.env.AI_RECEPTIONIST_DEFAULT_COMPANY_ID;
if (!companyId) {
  console.error('BOOTSTRAP_ADMIN_COMPANY_ID (or AI_RECEPTIONIST_DEFAULT_COMPANY_ID) env is required.');
  process.exit(1);
}

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

const isValidBcrypt = (hash) =>
  typeof hash === 'string' && (hash.startsWith('$2a$') || hash.startsWith('$2b$'));

try {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error(`Company ${companyId} does not exist. Aborting.`);
    process.exit(1);
  }

  const role = await prisma.role.findFirst({ where: { name: 'ADMIN' } });
  if (!role) {
    console.error('ADMIN role does not exist. Aborting.');
    process.exit(1);
  }

  const existing = await prisma.user.findFirst({ where: { email } });
  const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);

  if (existing) {
    if (isValidBcrypt(existing.passwordHash) && !process.env.BOOTSTRAP_ADMIN_FORCE) {
      console.log(
        `SKIP: admin ${email} (${existing.id}) already has a valid bcrypt hash. Set BOOTSTRAP_ADMIN_FORCE=1 to reset the password.`
      );
      await prisma.$disconnect();
      process.exit(0);
    }
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        roleId: role.id,
        companyId,
        deletedAt: null,
      },
      select: { id: true, email: true, companyId: true },
    });
    console.log(
      `HASH_REPLACED: admin ${updated.email} (${updated.id}) bound to company ${updated.companyId}.`
    );
  } else {
    const created = await prisma.user.create({
      data: {
        name: 'Administrator',
        email,
        passwordHash,
        roleId: role.id,
        companyId,
      },
      select: { id: true, email: true, companyId: true },
    });
    console.log(
      `CREATED: admin ${created.email} (${created.id}) bound to company ${created.companyId}.`
    );
  }
} catch (err) {
  console.error(`Bootstrap failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
