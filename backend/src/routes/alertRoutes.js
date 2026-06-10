import { Router } from 'express';
import * as ctrl from '../controllers/alertController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/:vehicleId', ctrl.list);
router.post('/', ctrl.create);
router.put('/:id/read', ctrl.markRead);

export default router;
