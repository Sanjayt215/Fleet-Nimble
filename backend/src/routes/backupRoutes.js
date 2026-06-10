import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as backup from '../controllers/backupController.js';

const router = Router();
router.use(authenticate);

// OBD BACKUP
router.get('/obd/:vehicleId', backup.getObdBackup);
router.post('/obd/bulk', backup.bulkObdUpload);

export default router;
