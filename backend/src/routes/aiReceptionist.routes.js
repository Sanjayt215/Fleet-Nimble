import { Router } from 'express';
import * as ctrl from '../controllers/aiReceptionist.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
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
