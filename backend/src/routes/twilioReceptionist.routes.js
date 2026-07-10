import { Router } from 'express';
import * as ctrl from '../controllers/twilioReceptionist.controller.js';
import { authenticate } from '../middleware/auth.js';
import { twilioWebhookLimiter } from '../middleware/rateLimiter.js';
import { config } from '../config/index.js';
import { RealtimeSessionManager } from '../services/realtimeSessionManager.js';
import { RealtimeModelValidator } from '../services/realtimeModelValidator.js';

const router = Router();

// ── Public health check (no auth, no secrets exposed) ──
router.get('/health', (_req, res) => {
  const modelValid = RealtimeModelValidator.validate(config.realtime.model);
  res.json({
    status: 'ok',
    module: 'ai-receptionist',
    twilioConfigured: config.twilio.configured,
    phoneConfigured: config.twilio.phoneConfigured,
    mediaStreamEnabled: config.realtime.mediaStreamEnabled,
    modelConfigured: Boolean(config.realtime.model),
    modelValidated: modelValid.valid,
    modelValidationReason: modelValid.valid ? null : modelValid.reason,
    realtimeConfigured: config.realtime.configured,
    realtimeReady: config.realtime.configured && config.realtime.mediaStreamEnabled,
    voiceAgentMode: config.aiReceptionist.voiceAgentMode,
    activeCalls: RealtimeSessionManager.getCount(),
    sessionManagerVersion: '2.0',
    backendVersion: '1.0.0',
    metrics: RealtimeSessionManager.getMetrics(),
  });
});

// ── Public Twilio webhooks (no JWT auth — validated via Twilio signature) ──
router.post('/twilio/voice', twilioWebhookLimiter, ctrl.handleIncomingCall);
router.post('/twilio/fallback', twilioWebhookLimiter, ctrl.handleFallbackCall);
router.post('/twilio/status', twilioWebhookLimiter, ctrl.handleStatusCallback);
router.post('/twilio/recording', twilioWebhookLimiter, ctrl.handleRecordingCallback);

// ── Admin / Dashboard (JWT auth required) ──
router.get('/live-calls', authenticate, ctrl.getLiveCalls);
router.post('/live-calls/:callSid/end', authenticate, ctrl.endCall);
router.post('/live-calls/:callSid/escalate', authenticate, ctrl.escalateCall);
router.get('/analytics', authenticate, ctrl.getAnalytics);
router.get('/transcripts/:id', authenticate, ctrl.getCallTranscript);

export default router;