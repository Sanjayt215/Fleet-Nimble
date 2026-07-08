import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

const isDev = config.env !== 'production';

export const apiLimiter = isDev
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: { code: 'RATE_LIMIT', message: 'Too many requests' },
      },
      skip: (req) => {
        const path = req.path || '';
        return (
          path.startsWith('/obd/live-data') ||
          path.startsWith('/mobile/telemetry/live') ||
          path.startsWith('/auth/login') ||
          path.startsWith('/auth/register')
        );
      },
    });

export const obdTelemetryLimiter = isDev
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 60 * 1000,
      max: parseInt(process.env.OBD_RATE_LIMIT_MAX || '180', 10),
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) =>
        `${req.userId || 'anon'}:${req.body?.vehicleId || 'unknown'}`,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMIT',
          message: 'Telemetry rate limit exceeded',
        },
      },
    });

export const authLimiter = isDev
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: { code: 'RATE_LIMIT', message: 'Too many auth attempts' },
      },
    });

export const twilioWebhookLimiter = isDev
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 60 * 1000,
      max: 60,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.body?.CallSid || req.ip,
      message: {
        success: false,
        error: { code: 'RATE_LIMIT', message: 'Too many webhook requests' },
      },
    });

export const aiChatLimiter = isDev
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 60 * 1000,
      max: config.ai.maxMessagesPerMinute,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => `${req.userId || 'anon'}:ai-chat`,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMIT',
          message: 'Too many AI messages. Please wait a moment and try again.',
        },
      },
    });

export const aiReceptionistLimiter = isDev
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 60 * 1000,
      max: config.ai.maxMessagesPerMinute,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => `${req.userId || 'anon'}:ai-receptionist`,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMIT',
          message: 'Too many AI messages. Please wait a moment and try again.',
        },
      },
    });