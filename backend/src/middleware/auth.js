import { verifyAccessToken } from '../utils/jwt.js';
import prisma from '../utils/prisma.js';
import { AppError } from './errorHandler.js';
import logger from '../utils/logger.js';

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    const token = header.slice(7);
    const decoded = verifyAccessToken(token);
    const user = await prisma.user.findFirst({
      where: { id: decoded.sub, deletedAt: null },
      include: { role: true },
    });
    if (!user) throw new AppError('User not found', 401, 'UNAUTHORIZED');
    req.user = user;
    req.userId = user.id;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      logger.info('ACCESS_TOKEN_EXPIRED', {
        path: req.originalUrl,
        method: req.method,
      });
      return res.status(401).json({
        success: false,
        code: 'ACCESS_TOKEN_EXPIRED',
        message: 'Your session access token has expired.',
        error: { code: 'ACCESS_TOKEN_EXPIRED', message: 'Your session access token has expired.' },
      });
    }
    if (err.name === 'JsonWebTokenError') {
      logger.warn('INVALID_ACCESS_TOKEN', {
        path: req.originalUrl,
        method: req.method,
      });
      return res.status(401).json({
        success: false,
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Authentication token is invalid.',
        error: { code: 'INVALID_ACCESS_TOKEN', message: 'Authentication token is invalid.' },
      });
    }
    if (err.isOperational) {
      return res.status(err.statusCode || 401).json({
        success: false,
        code: err.code || 'UNAUTHORIZED',
        message: err.message,
        error: { code: err.code || 'UNAUTHORIZED', message: err.message },
      });
    }
    logger.error('AUTH_INTERNAL_ERROR', { path: req.originalUrl, error: err.message });
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Authentication failed',
      error: { code: 'UNAUTHORIZED', message: 'Authentication failed' },
    });
  }
}

export function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  authenticate(req, res, next);
}
