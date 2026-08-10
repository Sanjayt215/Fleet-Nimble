import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as ctrl from '../controllers/receptionistMultiAgent.controller.js';

const router = Router();

router.use(authenticate);

router.get('/status', ctrl.getStatus);
router.get('/recent', ctrl.getRecentRuns);
router.get('/performance', ctrl.getPerformance);
router.get('/runs/:callId', ctrl.getRunsByCall);
router.get('/runs/:runId/tasks', ctrl.getRunTasks);

export default router;
