import { Router } from 'express';
import * as ctrl from '../controllers/maintenanceController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.post('/', ctrl.create);
router.get('/:vehicleId', ctrl.list);
router.put('/:id', ctrl.update);

export default router;
