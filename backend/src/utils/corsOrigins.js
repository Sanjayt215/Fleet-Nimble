import { config } from '../config/index.js';

const allowedOrigins = config.corsOrigin.split(',').map((o) => o.trim()).filter(Boolean);

/** Shared CORS check for Express and Socket.IO */
export function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(
    origin
  );
}

export function socketCorsOrigin(origin, callback) {
  if (isAllowedOrigin(origin)) return callback(null, true);
  return callback(new Error('CORS origin not allowed'));
}
