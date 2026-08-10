import { Router } from 'express';
import * as fleetController from '../controllers/fleetController.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/roles.js';

const router = Router();
router.use(authenticate);

router.post('/fuel', fleetController.createFuel);
router.get('/fuel/:vehicleId', fleetController.getFuel);
router.post('/maintenance', fleetController.createMaintenance);
router.get('/maintenance/:vehicleId', fleetController.getMaintenance);
router.put('/maintenance/:id', fleetController.updateMaintenance);
router.get('/alerts/:vehicleId', fleetController.getAlerts);
router.post('/alerts', fleetController.createAlert);
router.put('/alerts/:id/read', fleetController.markAlertRead);
router.get('/reports/:type/:vehicleId', fleetController.getReports);
router.get('/drivers', fleetController.getDrivers);
router.get('/work-orders', fleetController.getWorkOrders);
router.post('/work-orders', fleetController.createWorkOrder);
router.get('/admin/stats', requireAdmin, fleetController.adminStats);
router.get('/admin/users', requireAdmin, fleetController.adminUsers);

export default router;
