import { Router } from 'express';
import * as ctrl from '../controllers/driverController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/scores', ctrl.listScores);
router.post('/scores', ctrl.upsertScore);
router.get('/users', ctrl.listUsers);

export default router;
