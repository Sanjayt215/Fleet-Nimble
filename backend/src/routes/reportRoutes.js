import { Router } from 'express';
import * as ctrl from '../controllers/reportController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/fuel/:vehicleId', ctrl.fuelReport);
router.get('/trips/:vehicleId', ctrl.tripsReport);
router.get('/maintenance/:vehicleId', ctrl.maintenanceReport);
router.get('/diagnostics/:vehicleId', ctrl.diagnosticsReport);

export default router;
