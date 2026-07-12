import logger from '../utils/logger.js';

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

export function notFoundHandler(req, res, next) {
  try {
    console.log('[NOTFOUND]', { method: req.method, originalUrl: req.originalUrl, baseUrl: req.baseUrl, path: req.path, url: req.url });
    if (req.app && req.app._router && Array.isArray(req.app._router.stack)) {
      const layers = req.app._router.stack
        .filter((l) => l && l.regexp)
        .map((l) => ({ name: l.name || '<anon>', regexp: l.regexp.source }))
        .slice(0, 12);
      console.log('[NOTFOUND] app layers sample', layers);
    }
  } catch (err) {
    console.log('[NOTFOUND] error logging', err && err.message);
  }
  next(new AppError(`Route ${req.method} ${req.path} not found`, 404, 'NOT_FOUND'));
}

export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';

  if (statusCode >= 500) {
    logger.error(err.message, { stack: err.stack, path: req.path });
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: err.isOperational ? err.message : 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && !err.isOperational
        ? { stack: err.stack }
        : {}),
    },
    message: err.isOperational ? err.message : 'Internal server error',
  });
}
