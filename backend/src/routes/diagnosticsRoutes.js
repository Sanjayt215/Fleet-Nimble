import { Router } from 'express';
import * as diagnosticsController from '../controllers/diagnosticsController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Single vehicle diagnostics
router.get('/:vehicleId', diagnosticsController.getLiveDiagnostics);
router.get('/:vehicleId/history', diagnosticsController.getTelemetryHistory);
router.get('/:vehicleId/events', diagnosticsController.getVehicleEvents);

// Fleet-wide diagnostics
router.get('/fleet/overview', diagnosticsController.getFleetDiagnosticsOverview);

export default router;
