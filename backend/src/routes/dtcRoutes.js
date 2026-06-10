import { Router } from 'express';
import * as ctrl from '../controllers/dtcController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.post('/read', ctrl.readDtc);
router.post('/clear', ctrl.clearDtc);
router.get('/history/:vehicleId', ctrl.getHistory);
router.get('/:vehicleId', ctrl.getActive);

export default router;
