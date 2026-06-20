import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { setupVehicle, getMyVehicles, vinDecode } from '../controllers/mobileVehicleController.js';
import { submitLiveTelemetry, getLatestLiveTelemetry, getTelemetryHistory } from '../controllers/mobileTelemetryController.js';

const router = Router();

router.use(authenticate);

router.post('/vehicles/vin-decode', vinDecode);
router.post('/vehicles/setup', setupVehicle);
router.get('/vehicles/my', getMyVehicles);

router.post('/telemetry/live', submitLiveTelemetry);
router.get('/telemetry/latest', getLatestLiveTelemetry);
router.get('/telemetry/history/:vehicleId', getTelemetryHistory);

export default router;
