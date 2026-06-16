import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { setupVehicle, getMyVehicles } from '../controllers/mobileVehicleController.js';
import { submitLiveTelemetry, getLatestLiveTelemetry, getTelemetryHistory } from '../controllers/mobileTelemetryController.js';

const router = Router();

// All mobile routes require authentication
router.use(authenticate);

// Vehicle endpoints
router.post('/vehicles/setup', setupVehicle);
router.get('/vehicles/my', getMyVehicles);

// Telemetry endpoints
router.post('/telemetry/live', submitLiveTelemetry);
router.get('/telemetry/latest', getLatestLiveTelemetry);
router.get('/telemetry/history/:vehicleId', getTelemetryHistory);

export default router;
