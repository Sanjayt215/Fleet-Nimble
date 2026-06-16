import { Router } from 'express';
import * as ctrl from '../controllers/obdController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { obdLiveDataSchema, obdBatchSchema } from '../schemas/obdSchemas.js';
import { obdTelemetryLimiter } from '../middleware/rateLimiter.js';

const router = Router();
router.use(authenticate);

// POST /api/telemetry/live - Submit live OBD telemetry
router.post('/live', obdTelemetryLimiter, validate(obdLiveDataSchema), ctrl.postLiveData);

// GET /api/telemetry/latest/:vehicleId - Get latest telemetry for a vehicle
router.get('/latest/:vehicleId', ctrl.getLatest);

export default router;
