import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { setupVehicle, getMyVehicles, vinDecode } from '../controllers/mobileVehicleController.js';
import { submitLiveTelemetry, getLatestLiveTelemetry, getTelemetryHistory } from '../controllers/mobileTelemetryController.js';
import { submitAlert, getVehicleAlerts, markAlertRead } from '../controllers/mobileAlertsController.js';

const router = Router();

router.use(authenticate);

router.post('/vehicles/vin-decode', vinDecode);
router.post('/vehicles/setup', setupVehicle);
router.get('/vehicles/my', getMyVehicles);

router.post('/telemetry/live', submitLiveTelemetry);
router.get('/telemetry/latest', getLatestLiveTelemetry);
router.get('/telemetry/history/:vehicleId', getTelemetryHistory);

router.post('/alerts', submitAlert);
router.get('/alerts/:vehicleId', getVehicleAlerts);
router.put('/alerts/:alertId/read', markAlertRead);

export default router;
