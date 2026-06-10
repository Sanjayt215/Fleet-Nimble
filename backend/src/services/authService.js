import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import prisma from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

function signTokens(userId) {
  const accessToken = jwt.sign({ userId }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
  const refreshToken = jwt.sign({ userId }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
  return { accessToken, refreshToken };
}

export async function register({ name, email, password }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');

  const driverRole = await prisma.role.findUnique({ where: { name: 'driver' } });
  if (!driverRole) throw new AppError('Default role not configured', 500);

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, roleId: driverRole.id },
    include: { role: true },
  });

  const tokens = signTokens(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: tokens.refreshToken },
  });

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role.name },
    ...tokens,
  };
}

export async function login({ email, password }) {
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    include: { role: true },
  });
  if (!user) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

  const tokens = signTokens(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: tokens.refreshToken },
  });

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role.name },
    ...tokens,
  };
}

export async function logout(userId) {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshToken: null },
  });
}

export async function getProfile(userId) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: { role: true },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      role: { select: { name: true } },
    },
  });
  if (!user) throw new AppError('User not found', 404);
  return { ...user, role: user.role.name };
}

export async function registerDevice(userId, token, platform = 'android') {
  return prisma.deviceToken.upsert({
    where: { token },
    update: { userId, platform },
    create: { userId, token, platform },
  });
}
