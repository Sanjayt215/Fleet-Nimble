import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import apiRoutes from './routes/index.js';
import v1Routes from './routes/v1/index.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

const app = express();

// Global unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION', reason);
  console.error('Promise:', promise);
});

// Global uncaught exception handler
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION', err);
  console.error(err.stack);
});

// Early request logger to ensure all incoming requests are observed during debugging
app.use((req, _res, next) => {
  try {
    console.log('[REQ-EARLY]', req.method, req.originalUrl);
  } catch (e) {
    // ignore
  }
  next();
});

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

app.use('/api', apiLimiter);
app.use('/api/v1', v1Routes);
app.use('/api', apiRoutes);

// Temporary request-logging middleware to aid routing/debugging.
// Logs request details and a short list of router layers that regex-match the incoming URL.
app.use((req, _res, next) => {
  try {
    const candidates = (app._router && app._router.stack) || [];
    const matches = candidates
      .filter((l) => l && l.regexp)
      .map((l) => ({ name: l.name || '<anon>', regexp: l.regexp.source }))
      .filter((m) => {
        try {
          return new RegExp(m.regexp).test(req.originalUrl);
        } catch (e) {
          return false;
        }
      })
      .slice(0, 6);

    console.log('[REQ-TRACE]', req.method, req.originalUrl, {
      baseUrl: req.baseUrl,
      path: req.path,
      url: req.url,
      originalUrl: req.originalUrl,
      matchedLayers: matches,
    });
  } catch (err) {
    console.log('[REQ-TRACE] error', err && err.message);
  }
  next();
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
