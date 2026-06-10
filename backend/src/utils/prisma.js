import { PrismaClient } from '@prisma/client';
import logger from './logger.js';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

prisma.$connect().catch((err) => {
  logger.error('Prisma connect failed', { err: err.message });
});

export default prisma;
