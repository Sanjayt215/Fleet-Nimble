import { Router } from 'express';
import { getTwin, getAllTwins } from '../controllers/twinController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', getAllTwins);
router.get('/:vehicleId', getTwin);

export default router;
