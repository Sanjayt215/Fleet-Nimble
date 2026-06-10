import { Router } from 'express';
import * as dashboardController from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Fleet-wide KPIs
router.get('/kpis', dashboardController.getFleetKpis);

// Vehicle-specific KPIs
router.get('/vehicle/:vehicleId/kpis', dashboardController.getVehicleKpis);

// Alerts summary
router.get('/alerts', dashboardController.getAlertsSummary);

export default router;
