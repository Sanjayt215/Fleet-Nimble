import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcrypt';

const ADMIN_EMAIL = 'admin@fleetnimble.com';
const ADMIN_PASSWORD = 'Admin123!';
const ADMIN_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 12);

const adminUser = {
  id: 'user-admin',
  name: 'Admin',
  email: ADMIN_EMAIL,
  passwordHash: ADMIN_HASH,
  companyId: 'company-1',
  deletedAt: null,
  role: { id: 'role-admin', name: 'ADMIN' },
};

const mockPrisma = {
  user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  role: { findUnique: vi.fn(), create: vi.fn() },
  refreshToken: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn((callback) => callback(mockPrisma)),
};

vi.mock('../src/utils/prisma.js', () => ({ default: mockPrisma }));

vi.mock('../src/config/index.js', () => ({
  config: {
    env: 'test',
    jwt: { secret: 'test-secret', refreshSecret: 'test-refresh-secret', expiresIn: '15m', refreshExpiresIn: '7d' },
    logLevel: 'error',
  },
}));

vi.mock('../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let authController;

beforeEach(async () => {
  vi.clearAllMocks();
  mockPrisma.user.findFirst.mockReset();
  mockPrisma.user.findUnique.mockReset();
  mockPrisma.refreshToken.findUnique.mockReset();
  mockPrisma.refreshToken.create.mockReset();
  mockPrisma.refreshToken.delete.mockReset();
  mockPrisma.refreshToken.deleteMany.mockReset();
  authController = await import('../src/controllers/authController.js');
});

function makeRes() {
  const res = { statusCode: 200, body: null };
  res.status = vi.fn((code) => { res.statusCode = code; return res; });
  res.json = vi.fn((body) => { res.body = body; return res; });
  return res;
}

function makeNext() {
  return vi.fn();
}

describe('authController.login', () => {
  it('rejects missing credentials with 400', async () => {
    const res = makeRes();
    const next = makeNext();
    await authController.login({ body: {} }, res, next);
    expect(next.mock.calls).toHaveLength(1);
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(next.mock.calls[0][0].code).toBe('VALIDATION_ERROR');
  });

  it('rejects unknown email with 401 Invalid credentials', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const res = makeRes();
    const next = makeNext();
    await authController.login({ body: { email: 'nobody@example.com', password: 'whatever' } }, res, next);
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'nobody@example.com', deletedAt: null } }),
    );
    expect(next.mock.calls[0][0].statusCode).toBe(401);
    expect(next.mock.calls[0][0].message).toBe('Invalid credentials');
  });

  it('rejects wrong password with 401 Invalid credentials', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(adminUser);
    const res = makeRes();
    const next = makeNext();
    await authController.login({ body: { email: ADMIN_EMAIL, password: 'WrongPass!23' } }, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
    expect(next.mock.calls[0][0].message).toBe('Invalid credentials');
  });

  it('normalizes email (trim + lowercase) before lookup', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const res = makeRes();
    const next = makeNext();
    await authController.login({ body: { email: '  ADMIN@FleetNimble.COM  ', password: ADMIN_PASSWORD } }, res, next);
    expect(mockPrisma.user.findFirst.mock.calls[0][0].where.email).toBe(ADMIN_EMAIL);
  });

  it('issues tokens and persists refresh token on valid credentials', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(adminUser);
    mockPrisma.refreshToken.create.mockResolvedValue({});
    const res = makeRes();
    const next = makeNext();
    await authController.login({ body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } }, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(ADMIN_EMAIL);
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(mockPrisma.refreshToken.create).toHaveBeenCalledTimes(1);
    const created = mockPrisma.refreshToken.create.mock.calls[0][0].data;
    expect(created.token).toBe(res.body.data.refreshToken);
    expect(created.userId).toBe(adminUser.id);
    expect(next.mock.calls).toHaveLength(0);
  });

  it('returns 401 instead of crashing on a corrupt (non-bcrypt) hash', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...adminUser, passwordHash: 'fleetmanager-placeholder' });
    const res = makeRes();
    const next = makeNext();
    await authController.login({ body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } }, res, next);
    expect(next.mock.calls).toHaveLength(1);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
    expect(next.mock.calls[0][0].message).toBe('Invalid credentials');
  });
});

describe('authController.refresh', () => {
  const storedToken = { id: 'rt-1', token: 'stored-jwt', expiresAt: new Date(Date.now() + 3600000), userId: adminUser.id, user: adminUser };

  it('rejects missing refresh token with 400', async () => {
    const res = makeRes();
    await authController.refresh({ body: {} }, res, makeNext());
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unknown refresh token with 401 INVALID_REFRESH_TOKEN', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue(null);
    const res = makeRes();
    await authController.refresh({ body: { refreshToken: 'unknown' } }, res, makeNext());
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('deletes and rejects expired stored token', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue({ ...storedToken, expiresAt: new Date(Date.now() - 1000) });
    mockPrisma.refreshToken.delete.mockResolvedValue({});
    const res = makeRes();
    await authController.refresh({ body: { refreshToken: 'expired' } }, res, makeNext());
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('REFRESH_TOKEN_EXPIRED');
    expect(mockPrisma.refreshToken.delete).toHaveBeenCalledWith({ where: { id: storedToken.id } });
  });

  it('deletes and rejects refresh token for a disabled user', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue({ ...storedToken, user: { ...adminUser, deletedAt: new Date() } });
    mockPrisma.refreshToken.delete.mockResolvedValue({});
    const res = makeRes();
    await authController.refresh({ body: { refreshToken: 'disabled' } }, res, makeNext());
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('USER_DISABLED');
  });

  it('rotates tokens and persists the new refresh token', async () => {
    const jwt = await import('jsonwebtoken');
    const goodToken = jwt.sign({ sub: adminUser.id, jti: 'jti-1' }, 'test-refresh-secret', { expiresIn: '7d' });
    mockPrisma.refreshToken.findUnique.mockResolvedValue({ ...storedToken, token: goodToken });
    mockPrisma.refreshToken.delete.mockResolvedValue({});
    mockPrisma.refreshToken.create.mockResolvedValue({});
    const res = makeRes();
    const next = makeNext();
    await authController.refresh({ body: { refreshToken: goodToken } }, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.refreshToken).not.toBe(goodToken);
    expect(mockPrisma.refreshToken.delete).toHaveBeenCalledWith({ where: { id: storedToken.id } });
    expect(mockPrisma.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(next.mock.calls).toHaveLength(0);
  });
});

describe('authController.logout', () => {
  it('deletes the refresh token and responds 200', async () => {
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    const res = makeRes();
    const next = makeNext();
    await authController.logout({ body: { refreshToken: 'rt-to-delete' } }, res, next);
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { token: 'rt-to-delete' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('authController.profile', () => {
  it('returns the sanitized user without passwordHash', async () => {
    const res = makeRes();
    const next = makeNext();
    await authController.profile({ user: adminUser }, res, next);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.user.email).toBe(ADMIN_EMAIL);
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });
});
