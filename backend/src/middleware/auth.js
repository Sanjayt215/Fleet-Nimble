import { verifyAccessToken } from '../utils/jwt.js';
import prisma from '../utils/prisma.js';
import { AppError } from './errorHandler.js';

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
    console.error('AUTH ERROR', err);
    console.error(err.stack);
    // Always return 401 for auth errors, never 500
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
      });
    }
    // Convert any error to 401 to prevent 500
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: err.message || 'Authentication failed' }
    });
  }
}

export function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  authenticate(req, res, next);
}
