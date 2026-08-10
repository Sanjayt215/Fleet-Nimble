import { PrismaClient } from '@prisma/client';
import { prismaTimingMiddleware } from './prismaTiming.js';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

// Add query timing middleware
prisma.$use(prismaTimingMiddleware);

export default prisma;
export { getPrismaMetrics, resetPrismaMetrics } from './prismaTiming.js';
