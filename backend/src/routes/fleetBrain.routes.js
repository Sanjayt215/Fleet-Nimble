import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as fleetBrainController from '../controllers/fleetBrain.controller.js';

const router = Router();

router.use(authenticate);

router.get('/fleet-brain/dashboard', fleetBrainController.getDashboard);
router.get('/fleet-brain/context', fleetBrainController.getContext);
router.get('/fleet-brain/memory', fleetBrainController.getMemory);
router.get('/fleet-brain/plans', fleetBrainController.getPlans);
router.get('/fleet-brain/workflows', fleetBrainController.getWorkflows);
router.get('/fleet-brain/workflows/:runId', fleetBrainController.getWorkflowById);
router.get('/fleet-brain/insights', fleetBrainController.getInsights);
router.post('/fleet-brain/insights/generate', fleetBrainController.generateInsights);
router.get('/fleet-brain/learnings', fleetBrainController.getLearnings);
router.post('/fleet-brain/learnings/:id/apply', fleetBrainController.applyRecommendation);
router.get('/fleet-brain/skills', fleetBrainController.getSkills);
router.get('/fleet-brain/decisions', fleetBrainController.getDecisions);
router.get('/fleet-brain/tool-capabilities', fleetBrainController.getToolCapabilities);
router.get('/fleet-brain/fleet/:query', fleetBrainController.answerFleetQuery);
router.get('/fleet-brain/fleet-kpis', fleetBrainController.getFleetKpis);

export default router;
