import { Router } from 'express';
import * as ctrl from '../controllers/aiReceptionist.controller.js';
import { authenticate } from '../middleware/auth.js';
import { aiReceptionistLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { config } from '../config/index.js';
import {
  createCallSchema,
  updateCallStatusSchema,
  createAppointmentSchema,
  updateAppointmentSchema,
  createSupportTicketSchema,
  updateConfigSchema,
  simulateCallSchema,
} from '../schemas/receptionist.schema.js';

const router = Router();

router.use(authenticate);

router.get('/status', (_req, res) => {
  res.json({
    success: true,
    data: {
      enabled: config.ai.receptionistEnabled,
      browserVoice: config.ai.voiceAgentMode === 'browser' || config.ai.voiceAgentMode === 'hybrid' ? 'available' : 'not_configured',
      twilioPhone: process.env.TWILIO_ACCOUNT_SID ? 'configured' : 'not_configured',
      phoneNumber: config.twilio.phoneNumber || null,
      openaiRealtime: process.env.OPENAI_API_KEY ? 'configured' : 'not_configured',
      voiceAgentMode: config.ai.voiceAgentMode,
      message: config.ai.voiceAgentMode === 'twilio' && !process.env.TWILIO_ACCOUNT_SID
        ? 'Phone calling requires TWILIO_ACCOUNT_SID. Browser voice agent is not available in twilio mode.'
        : config.ai.voiceAgentMode === 'browser'
          ? 'Browser voice agent is available. Phone calling requires Twilio configuration.'
          : 'All channels available.',
    },
  });
});

router.get('/summary', ctrl.getSummary);

router.get('/calls', ctrl.getCalls);
router.get('/calls/:id', ctrl.getCallById);
router.post('/calls', validate(createCallSchema), ctrl.createCall);
router.patch('/calls/:id/status', validate(updateCallStatusSchema), ctrl.updateCallStatus);

router.post('/appointments', validate(createAppointmentSchema), ctrl.createAppointment);
router.get('/appointments', ctrl.getAppointments);
router.patch('/appointments/:id', validate(updateAppointmentSchema), ctrl.updateAppointment);

router.post('/support-tickets', validate(createSupportTicketSchema), ctrl.createSupportTicket);
router.get('/support-tickets', ctrl.getSupportTickets);

router.get('/config', ctrl.getConfig);
router.patch('/config', validate(updateConfigSchema), ctrl.updateConfig);

router.post('/simulate-call', validate(simulateCallSchema), ctrl.simulateCall);

// ── Voice Agent ──
router.post('/agent/start', ctrl.startAgent);
router.post('/agent/message', aiReceptionistLimiter, ctrl.processAgentMessage);
router.post('/agent/confirm', aiReceptionistLimiter, ctrl.confirmAgentAction);
router.post('/agent/end', ctrl.endAgent);

// ── CRM ──
router.get('/customers', ctrl.getCustomers);
router.get('/customers/:id', ctrl.getCustomerById);
router.patch('/customers/:id/status', ctrl.updateCustomerStatus);
router.post('/customers/:id/notes', ctrl.addCustomerNote);
router.get('/pipeline', ctrl.getLeadPipeline);
router.post('/customers/:id/recalculate-score', ctrl.recalculateLeadScore);

// ── Audit ──
router.get('/audit-logs', ctrl.getAuditLogs);

export default router;
