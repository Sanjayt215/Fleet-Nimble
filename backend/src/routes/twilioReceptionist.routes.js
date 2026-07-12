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
  const modelCheck = RealtimeModelValidator.validate(config.realtime.model);
  const lastFailure = RealtimeModelValidator.getLastError(config.realtime.model);
  res.json({
    status: 'ok',
    module: 'ai-receptionist',
    twilioConfigured: config.twilio.configured,
    phoneConfigured: config.twilio.phoneConfigured,
    phoneNumber: config.twilio.phoneNumber || null,
    mediaStreamEnabled: config.realtime.mediaStreamEnabled,
    businessToolsEnabled: config.realtime.businessToolsEnabled,
    modelConfigured: Boolean(config.realtime.model),
    modelValidated: modelCheck.valid,
    modelValidationReason: modelCheck.valid ? null : modelCheck.reason,
    realtimeConfigured: config.realtime.configured,
    realtimeProviderVerified: modelCheck.valid && !modelCheck.cached,
    lastRealtimeError: lastFailure?.reason || null,
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
router.post('/twilio/stream-status', twilioWebhookLimiter, ctrl.handleStreamStatus);
router.post('/twilio/post-stream', twilioWebhookLimiter, ctrl.handlePostStreamFallback);

// ── Admin / Dashboard (JWT auth required) ──
router.get('/live-calls', authenticate, ctrl.getLiveCalls);
router.post('/live-calls/:callSid/end', authenticate, ctrl.endCall);
router.post('/live-calls/:callSid/escalate', authenticate, ctrl.escalateCall);
router.get('/analytics', authenticate, ctrl.getAnalytics);
router.get('/transcripts/:id', authenticate, ctrl.getCallTranscript);

export default router;