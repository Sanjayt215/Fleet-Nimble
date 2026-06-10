import bcrypt from 'bcrypt';
import prisma from '../utils/prisma.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { AppError } from '../middleware/errorHandler.js';
import { randomUUID } from 'crypto';

export async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError('Email already registered', 409, 'CONFLICT');

    let role = await prisma.role.findUnique({ where: { name: 'MANAGER' } });
    if (!role) {
      role = await prisma.role.create({ data: { name: 'MANAGER' } });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, roleId: role.id },
      include: { role: true },
    });

    const tokens = await issueTokens(user);
    res.status(201).json({
      success: true,
      data: { user: sanitizeUser(user), ...tokens },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: { role: true },
    });
    if (!user) throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');

    const tokens = await issueTokens(user);
    res.json({ success: true, data: { user: sanitizeUser(user), ...tokens } });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }
    res.json({ success: true, message: 'Logged out' });
  } catch (err) {
    next(err);
  }
}

export async function profile(req, res, next) {
  try {
    res.json({ success: true, data: { user: sanitizeUser(req.user) } });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError('Refresh token required', 400, 'VALIDATION_ERROR');

    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { include: { role: true } } },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new AppError('Invalid refresh token', 401, 'UNAUTHORIZED');
    }

    verifyRefreshToken(refreshToken);
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    const tokens = await issueTokens(stored.user);
    res.json({ success: true, data: tokens });
  } catch (err) {
    next(err);
  }
}

async function issueTokens(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role.name,
    companyId: user.companyId || null,
  };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken({ ...payload, jti: randomUUID() });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: { userId: user.id, token: refreshToken, expiresAt },
  });
  return { accessToken, refreshToken };
}

function sanitizeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}
