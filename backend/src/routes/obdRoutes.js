import { Router } from 'express';
import * as ctrl from '../controllers/obdController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { obdLiveDataSchema, obdBatchSchema } from '../schemas/obdSchemas.js';
import { obdTelemetryLimiter } from '../middleware/rateLimiter.js';

const router = Router();
router.use(authenticate);

router.post('/live-data', obdTelemetryLimiter, validate(obdLiveDataSchema), ctrl.postLiveData);
router.post('/live-data/batch', obdTelemetryLimiter, validate(obdBatchSchema), ctrl.postLiveDataBatch);
router.get('/latest/:vehicleId', ctrl.getLatest);
router.get('/history/:vehicleId', ctrl.getHistory);

export default router;
