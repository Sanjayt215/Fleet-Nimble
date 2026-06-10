import { Router } from 'express';
import * as ctrl from '../controllers/gpsController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.post('/update', ctrl.updateGps);
router.get('/history/:tripId', ctrl.getHistory);

export default router;
