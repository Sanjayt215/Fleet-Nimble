import { Router } from 'express';
import { getLiveGps, getLiveGpsByVehicleId, getGpsHistoryByVehicleId } from '../controllers/gpsController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/live', getLiveGps);
router.get('/live/:vehicleId', getLiveGpsByVehicleId);
router.get('/history/:vehicleId', getGpsHistoryByVehicleId);

export default router;
