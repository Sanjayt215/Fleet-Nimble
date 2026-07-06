import { Router } from 'express';
import * as ctrl from '../controllers/twilioReceptionist.controller.js';
import { authenticate } from '../middleware/auth.js';
import { twilioWebhookLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// ── Public Twilio webhooks (no JWT auth — validated via Twilio signature) ──
router.post('/twilio/voice', twilioWebhookLimiter, ctrl.handleIncomingCall);
router.post('/twilio/status', twilioWebhookLimiter, ctrl.handleStatusCallback);
router.post('/twilio/recording', twilioWebhookLimiter, ctrl.handleRecordingCallback);
router.get('/twilio/media-stream', ctrl.handleMediaStream);

// ── Admin / Dashboard (JWT auth required) ──
router.get('/live-calls', authenticate, ctrl.getLiveCalls);
router.post('/live-calls/:callSid/end', authenticate, ctrl.endCall);
router.post('/live-calls/:callSid/escalate', authenticate, ctrl.escalateCall);
router.get('/analytics', authenticate, ctrl.getAnalytics);
router.get('/transcripts/:id', authenticate, ctrl.getCallTranscript);

export default router;