import { config } from '../config/index.js';

function getEnvOrigins() {
  const origins = [];
  [config.corsOrigin, process.env.FRONTEND_URL, process.env.CLIENT_URL].forEach((val) => {
    if (val) {
      val.split(',').map((o) => o.trim()).filter(Boolean).forEach((o) => origins.push(o));
    }
  });
  return origins;
}

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5173',
  'http://10.0.2.2:5000',
  ...getEnvOrigins(),
];

export function isAllowedOrigin(origin) {
  if (!origin) return true;

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1|host\.docker\.internal|10\.0\.2\.2|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
    return true;
  }

  // In production, be permissive with known deployment origins
  if (process.env.NODE_ENV === 'production') {
    if (/^https:\/\/.+\.(vercel\.app|onrender\.com|netlify\.app|railway\.app)$/.test(origin)) {
      return true;
    }
    if (/^https:\/\/[a-zA-Z0-9-]+\.\w+\.(com|app|io|dev|tech)$/.test(origin)) {
      return true;
    }
  }

  return false;
}

export function socketCorsOrigin(origin, callback) {
  if (isAllowedOrigin(origin)) {
    return callback(null, true);
  }

  return callback(new Error('CORS origin not allowed'));
}

export const corsAllowedOrigins = allowedOrigins;