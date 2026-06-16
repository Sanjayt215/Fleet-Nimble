import { Router } from 'express';
import * as ctrl from '../controllers/vehicleController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.post('/', ctrl.create);
router.get('/', ctrl.list);
router.get('/my', ctrl.getMyVehicles);
router.get('/:id', ctrl.getById);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

export default router;
