import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import apiRoutes from './routes/index.js';
import v1Routes from './routes/v1/index.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { performanceMonitor, getPerformanceMetrics } from './middleware/performanceMonitor.js';
import prisma, { getPrismaMetrics } from './utils/prisma.js';

const app = express();

// Fix Render X-Forwarded-For express-rate-limit warnings
app.set('trust proxy', 1);

const corsOptions = {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

// CORS must come first
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Performance monitoring
app.use(performanceMonitor);

// ── Liveness: always returns 200 when the process is alive ──
app.get('/api/health/live', (_req, res) => {
  res.json({
    status: 'alive',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ── Readiness: reflects critical dependency status ──
app.get('/api/health/ready', async (_req, res) => {
  const { getStatus } = await import('./utils/databaseStatusManager.js');
  const db = getStatus();
  if (db.state === 'connected') {
    return res.json({
      status: 'healthy',
      database: 'connected',
      twilio: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) ? 'configured' : 'not_configured',
      realtime: Boolean(process.env.AI_RECEPTIONIST_MODEL && process.env.OPENAI_API_KEY) ? 'configured' : 'not_configured',
      mediaStream: process.env.AI_RECEPTIONIST_MEDIA_STREAM_ENABLED === 'true' ? 'enabled' : 'disabled',
      timestamp: new Date().toISOString(),
    });
  }
  return res.status(503).json({
    status: 'degraded',
    database: db.state,
    lastError: db.lastError,
    twilio: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) ? 'configured' : 'not_configured',
    realtime: Boolean(process.env.AI_RECEPTIONIST_MODEL && process.env.OPENAI_API_KEY) ? 'configured' : 'not_configured',
    mediaStream: process.env.AI_RECEPTIONIST_MEDIA_STREAM_ENABLED === 'true' ? 'enabled' : 'disabled',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', apiLimiter);
app.use('/api/v1', v1Routes);
app.use('/api', apiRoutes);

// Performance metrics endpoint (admin only)
app.get('/api/admin/performance', (req, res) => {
  const apiMetrics = getPerformanceMetrics();
  const dbMetrics = getPrismaMetrics();
  res.json({
    apiMetrics,
    dbMetrics,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});

// Root health check route
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'FleetNimble API',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'FleetNimble API',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
