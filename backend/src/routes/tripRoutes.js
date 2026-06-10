import { Router } from 'express';
import * as ctrl from '../controllers/tripController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.post('/start', ctrl.startTrip);
router.post('/end', ctrl.endTrip);
router.get('/:vehicleId', ctrl.listTrips);

export default router;
