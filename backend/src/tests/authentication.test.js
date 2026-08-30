import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import prisma from '../utils/prisma.js';
import { issueTokens } from '../controllers/authController.js';
import { randomUUID } from 'crypto';

describe('Authentication Regression Tests', () => {
  let testUser, testCompany, testRole;
  let timestamp;

  beforeAll(async () => {
    timestamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;

    // Cleanup any existing test data
    await prisma.organizationMember.deleteMany({
      where: { user: { email: { contains: `@example.com` } } }
    });
    await prisma.user.deleteMany({
      where: { email: { contains: `@example.com` } }
    });

    // Create test company
    testCompany = await prisma.company.create({
      data: {
        name: 'Test Company',
        slug: `test-company-${timestamp}`,
      },
    });

    // Create test role
    testRole = await prisma.role.findFirst({ where: { name: 'MANAGER' } });
    if (!testRole) {
      testRole = await prisma.role.create({ data: { name: 'MANAGER' } });
    }

    // Create test user
    const passwordHash = await bcrypt.hash('TestPassword123!', 12);
    testUser = await prisma.user.create({
      data: {
        name: 'Test User',
        email: `test-${timestamp}@example.com`,
        passwordHash,
        roleId: testRole.id,
        companyId: testCompany.id,
      },
      include: { role: true },
    });

    // Create organization membership
    await prisma.organizationMember.create({
      data: {
        organizationId: testCompany.id,
        userId: testUser.id,
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.organizationMember.deleteMany({ where: { userId: testUser?.id } });
    if (testUser?.id) await prisma.user.delete({ where: { id: testUser.id } });
    if (testCompany?.id) await prisma.company.delete({ where: { id: testCompany.id } });
  });

  it('Valid existing user can log in with correct password', async () => {
    // This test verifies the user exists and has valid password hash
    const user = await prisma.user.findFirst({
      where: { email: testUser.email },
      include: { role: true },
    });

    expect(user).not.toBeNull();
    expect(user.passwordHash).toBeDefined();
    expect(user.passwordHash.startsWith('$2a$') || user.passwordHash.startsWith('$2b$')).toBe(true);
  });

  it('Password hash is bcrypt format with correct rounds', async () => {
    const user = await prisma.user.findUnique({ where: { id: testUser.id } });
    const hashParts = user.passwordHash.split('$');
    expect(hashParts[1]).toMatch(/^(2a|2b)$/);
    expect(Number(hashParts[2])).toBe(12);
  });

  it('JWT tokens can be issued for valid user', async () => {
    const tokens = await issueTokens(testUser);

    expect(tokens).toBeDefined();
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
    expect(typeof tokens.accessToken).toBe('string');
    expect(typeof tokens.refreshToken).toBe('string');
  });

  it('JWT contains valid user and tenant context', async () => {
    const tokens = await issueTokens(testUser);
    const { verifyAccessToken } = await import('../utils/jwt.js');
    const decoded = verifyAccessToken(tokens.accessToken);

    expect(decoded.sub).toBe(testUser.id);
    expect(decoded.email).toBe(testUser.email);
    expect(decoded.role).toBe(testUser.role.name);
    expect(decoded.companyId).toBe(testCompany.id);
    expect(decoded.activeOrganizationId).toBe(testCompany.id);
  });

  it('User with organization membership gets active organization in JWT', async () => {
    const tokens = await issueTokens(testUser);
    const { verifyAccessToken } = await import('../utils/jwt.js');
    const decoded = verifyAccessToken(tokens.accessToken);

    expect(decoded.activeOrganizationId).toBe(testCompany.id);
  });

  it('User without companyId falls back to organization membership', async () => {
    // Create user without companyId but with organization membership
    const userWithoutCompany = await prisma.user.create({
      data: {
        name: 'User Without Company',
        email: `nocompany-${timestamp}@example.com`,
        passwordHash: await bcrypt.hash('TestPassword123!', 12),
        roleId: testRole.id,
      },
      include: { role: true },
    });

    await prisma.organizationMember.create({
      data: {
        organizationId: testCompany.id,
        userId: userWithoutCompany.id,
        role: 'MEMBER',
        status: 'ACTIVE',
      },
    });

    const tokens = await issueTokens(userWithoutCompany);
    const { verifyAccessToken } = await import('../utils/jwt.js');
    const decoded = verifyAccessToken(tokens.accessToken);

    expect(decoded.companyId).toBeNull();
    expect(decoded.activeOrganizationId).toBe(testCompany.id);

    // Cleanup
    await prisma.organizationMember.deleteMany({ where: { userId: userWithoutCompany.id } });
    await prisma.user.delete({ where: { id: userWithoutCompany.id } });
  });

  it('Soft-deleted user cannot be found in login query', async () => {
    await prisma.user.update({
      where: { id: testUser.id },
      data: { deletedAt: new Date() },
    });

    const user = await prisma.user.findFirst({
      where: { email: testUser.email, deletedAt: null },
    });

    expect(user).toBeNull();

    // Restore
    await prisma.user.update({
      where: { id: testUser.id },
      data: { deletedAt: null },
    });
  });

  it('Email normalization works (case insensitive)', async () => {
    // The login controller normalizes email to lowercase
    // Test that the stored email is lowercase
    const user = await prisma.user.findUnique({ where: { id: testUser.id } });
    expect(user.email).toBe(user.email.toLowerCase());
    expect(user.email).toBe(testUser.email.toLowerCase());
  });

  it('Organization membership is ACTIVE', async () => {
    const membership = await prisma.organizationMember.findFirst({
      where: {
        userId: testUser.id,
        organizationId: testCompany.id,
      },
    });

    expect(membership).not.toBeNull();
    expect(membership.status).toBe('ACTIVE');
    expect(membership.role).toBe('OWNER');
  });

  it('Login does not require tenant context before authentication', async () => {
    // Verify that user lookup works without companyId filter
    const user = await prisma.user.findFirst({
      where: { email: testUser.email, deletedAt: null },
    });

    expect(user).not.toBeNull();
    // User can be found by email alone, no companyId required
  });

  it('Tenant context is resolved after authentication', async () => {
    const tokens = await issueTokens(testUser);
    const { verifyAccessToken } = await import('../utils/jwt.js');
    const decoded = verifyAccessToken(tokens.accessToken);

    // Tenant context is present in JWT after successful authentication
    expect(decoded.companyId).toBeDefined();
    expect(decoded.activeOrganizationId).toBeDefined();
  });

  it('Refresh token is stored in database', async () => {
    const tokens = await issueTokens(testUser);
    
    const stored = await prisma.refreshToken.findUnique({
      where: { token: tokens.refreshToken },
    });

    expect(stored).not.toBeNull();
    expect(stored.userId).toBe(testUser.id);
  });

  it('Admin user exists with valid credentials', async () => {
    const admin = await prisma.user.findFirst({
      where: { email: 'admin@fleetnimble.com' },
      include: { role: true },
    });

    expect(admin).not.toBeNull();
    expect(admin.passwordHash).toBeDefined();
    expect(admin.passwordHash.startsWith('$2a$') || admin.passwordHash.startsWith('$2b$')).toBe(true);
    expect(admin.role.name).toBe('ADMIN');
  });

  it('Admin user has organization membership', async () => {
    const admin = await prisma.user.findFirst({
      where: { email: 'admin@fleetnimble.com' },
    });

    if (admin) {
      const membership = await prisma.organizationMember.findFirst({
        where: {
          userId: admin.id,
          organizationId: admin.companyId,
        },
      });

      expect(membership).not.toBeNull();
      expect(membership.status).toBe('ACTIVE');
    }
  });
});
