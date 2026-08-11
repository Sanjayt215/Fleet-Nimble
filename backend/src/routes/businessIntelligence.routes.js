import { Router } from 'express';
import * as ctrl from '../controllers/businessIntelligence.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// ── Business Onboarding / Profile ──
router.get('/business/profile', ctrl.getBusinessProfile);
router.post('/business/profile', ctrl.createBusinessProfile);
router.patch('/business/profile', ctrl.updateBusinessProfile);
router.delete('/business/profile', ctrl.deleteBusinessProfile);

// ── Business Knowledge Documents ──
router.get('/knowledge/documents', ctrl.listDocuments);
router.get('/knowledge/documents/:id', ctrl.getDocument);
router.post('/knowledge/documents', ctrl.createDocument);
router.patch('/knowledge/documents/:id', ctrl.updateDocument);
router.delete('/knowledge/documents/:id', ctrl.deleteDocument);
router.post('/knowledge/documents/:id/approve', ctrl.approveDocument);

// ── Agent Configuration ──
router.get('/agent/config', ctrl.getAgentConfig);
router.patch('/agent/config', ctrl.updateAgentConfig);
router.put('/agent/greeting', ctrl.updateGreeting);

// ── Test Your AI ──
router.post('/agent/test', ctrl.testYourAI);

// ── Observability ──
router.get('/interactions', ctrl.listInteractions);
router.get('/analytics/business', ctrl.getBusinessAnalytics);

// ── Controlled tools ──
router.get('/tools', ctrl.listControlledTools);

export default router;
