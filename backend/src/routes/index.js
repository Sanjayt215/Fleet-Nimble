import { Router } from 'express';
import authRoutes from './authRoutes.js';
import vehicleRoutes from './vehicleRoutes.js';
import obdRoutes from './obdRoutes.js';
import telemetryRoutes from './telemetryRoutes.js';
import dtcRoutes from './dtcRoutes.js';
import tripRoutes from './tripRoutes.js';
import gpsRoutes from './gpsRoutes.js';
import fuelRoutes from './fuelRoutes.js';
import maintenanceRoutes from './maintenanceRoutes.js';
import alertRoutes from './alertRoutes.js';
import reportRoutes from './reportRoutes.js';
import driverRoutes from './driverRoutes.js';
import workOrderRoutes from './workOrderRoutes.js';
import adminRoutes from './adminRoutes.js';
import backupRoutes from './backupRoutes.js';
import twinRoutes from './twinRoutes.js';
import mobileRoutes from './mobileRoutes.js';
import * as reportController from '../controllers/reportController.js';
import { authenticate } from '../middleware/auth.js';
import { getMqttStats } from '../mqtt/consumer.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ success: true, status: 'ok' }));

router.get('/health/mqtt', (_req, res) => {
  res.json({ success: true, data: getMqttStats() });
});

router.use('/auth', authRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/obd', obdRoutes);
router.use('/telemetry', telemetryRoutes);
router.use('/dtc', dtcRoutes);
router.use('/trips', tripRoutes);
router.use('/gps', gpsRoutes);
router.use('/fuel', fuelRoutes);
router.use('/maintenance', maintenanceRoutes);
router.use('/alerts', alertRoutes);
router.use('/reports', reportRoutes);
router.use('/drivers', driverRoutes);
router.use('/work-orders', workOrderRoutes);
router.use('/admin', adminRoutes);
router.use('/backup', backupRoutes);
router.use('/twin', twinRoutes);
router.use('/mobile', mobileRoutes);
router.get('/dashboard/stats', authenticate, reportController.dashboardStats);

export default router;
