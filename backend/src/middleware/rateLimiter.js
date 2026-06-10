import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests' } },
  skip: (req) => {
    const path = req.path || '';
    return path.startsWith('/obd/live-data');
  },
});

/** High-throughput limiter for telemetry (1–2 Hz per vehicle) */
export const obdTelemetryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.OBD_RATE_LIMIT_MAX || '180', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.userId || 'anon'}:${req.body?.vehicleId || 'unknown'}`,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Telemetry rate limit exceeded' } },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many auth attempts' } },
});
