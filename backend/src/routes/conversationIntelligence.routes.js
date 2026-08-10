import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as ctrl from '../controllers/conversationIntelligence.controller.js';

const router = Router();

router.use(authenticate);

router.get('/conversations/live', ctrl.getLiveDashboard);
router.get('/conversations/timeline/stats', ctrl.getTimelineStats);
router.get('/conversations/timelines', ctrl.getRecentTimelines);
router.get('/conversations/timeline/:callId', ctrl.getTimeline);
router.get('/conversations/summaries', ctrl.getSummaries);
router.get('/conversations/summaries/:callId', ctrl.getSummaryByCall);
router.get('/conversations/analytics', ctrl.getConversationAnalytics);
router.get('/conversations/analytics/:callId', ctrl.getConversationAnalyticsByCall);
router.get('/conversations/follow-ups', ctrl.getFollowUps);
router.get('/conversations/follow-ups/appointment/:appointmentId', ctrl.getFollowUpsByAppointment);
router.post('/conversations/follow-ups/:id/complete', ctrl.completeFollowUp);
router.get('/conversations/leads', ctrl.getLeads);
router.get('/conversations/leads/:customerId', ctrl.getLeadByCustomer);
router.get('/conversations/supervisor', ctrl.getSupervisor);
router.get('/conversations/replay/:callId', ctrl.getReplay);

export default router;
