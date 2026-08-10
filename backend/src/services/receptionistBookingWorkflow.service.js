import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { emitToUser } from '../utils/socketHub.js';
import * as appointmentService from './receptionistAppointment.service.js';
import * as memoryService from './receptionistMemory.service.js';
import * as callService from './receptionistCall.service.js';
import * as notificationService from './receptionistNotification.service.js';
import * as followUpService from './followUp.service.js';
import { generateConversationSummaries } from './conversationSummary.service.js';
import { computeConversationAnalytics } from './conversationAnalytics.service.js';
import { recordTimelineEvent, TIMELINE_EVENT_TYPES } from './conversationTimeline.service.js';
import { wallClockToUtc } from '../utils/scheduling.js';

/**
 * Calculate lead score based on customer data
 */
function calculateLeadScore(data) {
  let score = 0;
  if (data.fleetSize) {
    if (data.fleetSize >= 100) score += 40;
    else if (data.fleetSize >= 20) score += 25;
    else if (data.fleetSize >= 5) score += 10;
    else score += 5;
  }
  if (data.company) score += 15;
  return Math.min(score, 100);
}

/**
 * Complete Appointment Booking Workflow
 * 
 * This service orchestrates the entire appointment booking workflow in a single transaction
 * to ensure data consistency and prevent partial failures.
 * 
 * Workflow Steps:
 * 1. Create or find Contact (Customer) with duplicate prevention
 * 2. Create Company if not exists (based on company name)
 * 3. Create Lead (ReceptionistCustomer with LEAD status)
 * 4. Create Appointment with duplicate prevention
 * 5. Link Appointment to Call
 * 6. Generate Conversation Summary
 * 7. Save Transcript
 * 8. Generate Conversation Analytics
 * 9. Create CRM Activity (Customer Note)
 * 10. Emit Socket.IO events for real-time updates
 * 11. Send Email confirmation
 * 12. Send SMS confirmation
 * 13. Generate Follow-up Reminders
 */

/**
 * Main workflow function - executes all steps in a transaction
 */
export async function executeAppointmentBookingWorkflow({
  userId,
  callId = null,
  callSid = null,
  extractedData = {},
  transcript = [],
  sessionMetrics = null,
}) {
  const { callerName, phone, email, company, fleetSize, industry, meetingPurpose, preferredDate, preferredTime, timezone } = extractedData;

  logger.info('BOOKING_WORKFLOW_STARTED', { userId, callId, callerName, company });

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Step 1: Create or find Contact (Customer) with duplicate prevention
      const customer = await findOrCreateCustomerInTransaction(tx, userId, {
        callerName,
        phone,
        email,
        company,
        fleetSize,
        industry,
      });

      if (!customer) {
        throw new Error('Failed to create or find customer');
      }

      // Step 2: Create Company if not exists
      let companyId = null;
      if (company && !customer.companyId) {
        const companyRecord = await findOrCreateCompanyInTransaction(tx, userId, company);
        companyId = companyRecord.id;
        
        // Link customer to company
        await tx.receptionistCustomer.update({
          where: { id: customer.id },
          data: { companyId },
        });
      } else if (customer.companyId) {
        companyId = customer.companyId;
      }

      // Step 3: Create Lead (already done in findOrCreateCustomer - status is LEAD)
      // Ensure lead score is calculated
      const leadScore = calculateLeadScore({ fleetSize, company });
      if (customer.leadScore === 0) {
        await tx.receptionistCustomer.update({
          where: { id: customer.id },
          data: { leadScore },
        });
      }

      // Step 4: Create Appointment with duplicate prevention
      const parsedDateTime = parseDateTime(preferredDate, preferredTime, timezone);
      const appointment = await createAppointmentInTransaction(tx, userId, {
        callerName,
        phone,
        email,
        companyName: company,
        fleetSize,
        industry,
        meetingPurpose,
        meetingTitle: meetingPurpose ? `${meetingPurpose} - FleetNimble` : 'FleetNimble Meeting',
        scheduledDate: parsedDateTime.scheduledDate,
        durationMinutes: 30,
        timezone: parsedDateTime.timezone || 'UTC',
        notes: transcript.map(m => `${m.role}: ${m.content}`).join('\n'),
        callId,
      });

      // Step 5: Link Appointment to Call
      if (callId) {
        const existingCall = await tx.aiReceptionistCall.findUnique({ where: { id: callId }, select: { id: true } });
        if (existingCall) {
          await tx.aiReceptionistCall.update({
            where: { id: callId },
            data: {
              appointmentId: appointment.id,
              customerId: customer.id,
              callStatus: 'COMPLETED',
              callEndedAt: new Date(),
              transcript: JSON.stringify(transcript),
              extractedData,
            },
          });
        } else {
          logger.warn('DATABASE_SKIPPED', { operation: 'call_update', callId, reason: 'call_not_found' });
        }
      }

      // Step 6: Generate Conversation Summary
      const summary = await generateConversationSummaries({
        userId,
        callId,
        callSid,
        customerId: customer.id,
        transcriptEntries: transcript,
        collectedData: { ...extractedData, appointmentCreated: true },
        callIntent: 'schedule_meeting',
        leadProfile: { leadScore, industry, fleetSize },
      });

      // Step 7: Save Transcript (already done in Step 5)
      // Transcript is saved in the call record

      // Step 8: Generate Conversation Analytics
      const analytics = await computeConversationAnalytics({
        userId,
        callId,
        callSid,
        transcriptEntries: transcript,
        collectedData: { ...extractedData, appointmentCreated: true, leadScore },
        intent: 'schedule_meeting',
        sentiment: 'positive',
        sessionMetrics,
      });

      // Step 9: Create CRM Activity (Customer Note)
      const crmNote = await tx.receptionistCustomerNote.create({
        data: {
          customerId: customer.id,
          userId,
          type: 'APPOINTMENT_BOOKED',
          content: `Demo appointment booked for ${parsedDateTime.scheduledDate.toLocaleString()}. Ref: ${appointment.id.substring(0, 8)}. Purpose: ${meetingPurpose || 'General inquiry'}.`,
        },
      });

      // Update customer appointment count
      await tx.receptionistCustomer.update({
        where: { id: customer.id },
        data: {
          totalAppointments: { increment: 1 },
          lastContactAt: new Date(),
          lastIntent: 'schedule_meeting',
          lastSummary: summary.executiveSummary,
          preferredDate: preferredDate,
          preferredTime: preferredTime,
        },
      });

      return {
        customer,
        companyId,
        appointment,
        summary,
        analytics,
        crmNote,
      };
    }, {
      maxWait: 5000, // 5 seconds
      timeout: 15000, // 15 seconds
    });

    logger.info('BOOKING_WORKFLOW_TRANSACTION_SUCCESS', { 
      userId, 
      appointmentId: result.appointment.id,
      customerId: result.customer.id 
    });

    // Step 10: Emit Socket.IO events (outside transaction)
    emitToUser(userId, 'appointment.created', { appointment: result.appointment });
    emitToUser(userId, 'crm.customer.updated', { customer: result.customer });
    emitToUser(userId, 'call.completed', { callId, appointmentId: result.appointment.id });
    emitToUser(userId, 'dashboard.refresh', { reason: 'appointment_booked' });

    // Step 11: Send Email confirmation
    const emailResult = await notificationService.sendConfirmationEmail(userId, result.appointment);
    logger.info('BOOKING_WORKFLOW_EMAIL_SENT', { userId, appointmentId: result.appointment.id, sent: emailResult.sent });

    // Step 12: Send SMS confirmation
    const smsResult = await notificationService.sendSmsNotification(
      userId,
      result.appointment.callerPhone,
      `Your FleetNimble demo is confirmed for ${result.appointment.scheduledDate.toLocaleString()}. Ref ${result.appointment.id.substring(0, 8)}.`
    );
    logger.info('BOOKING_WORKFLOW_SMS_SENT', { userId, appointmentId: result.appointment.id, sent: smsResult.sent });

    // Step 13: Generate Follow-up Reminders
    const followUpResult = await followUpService.createFollowUpBundle({
      userId,
      companyId: result.companyId,
      callId,
      callSid,
      customerId: result.customer.id,
      appointment: result.appointment,
    });
    logger.info('BOOKING_WORKFLOW_FOLLOW_UP_CREATED', { 
      userId, 
      appointmentId: result.appointment.id,
      followUps: followUpResult?.created?.length || 0 
    });

    // Record timeline event
    await recordTimelineEvent({
      userId,
      callId,
      callSid,
      eventType: TIMELINE_EVENT_TYPES.APPOINTMENT_CONFIRMED,
      label: 'Appointment booking workflow completed',
      data: {
        appointmentId: result.appointment.id,
        customerId: result.customer.id,
        emailSent: emailResult.sent,
        smsSent: smsResult.sent,
        followUpsCreated: followUpResult?.created?.length || 0,
      },
    });

    return {
      success: true,
      appointment: result.appointment,
      customer: result.customer,
      summary: result.summary,
      analytics: result.analytics,
      emailSent: emailResult.sent,
      smsSent: smsResult.sent,
      followUps: followUpResult?.created || [],
    };

  } catch (error) {
    logger.error('BOOKING_WORKFLOW_FAILED', { 
      userId, 
      callId, 
      error: error.message,
      stack: error.stack 
    });
    
    // Record failure in timeline
    if (callId) {
      await recordTimelineEvent({
        userId,
        callId,
        callSid,
        eventType: 'BOOKING_WORKFLOW_FAILED',
        label: 'Appointment booking workflow failed',
        data: { error: error.message },
      }).catch(() => {});
    }

    throw error;
  }
}

/**
 * Find or create customer in transaction with duplicate prevention
 */
async function findOrCreateCustomerInTransaction(tx, userId, extracted) {
  const { callerName, phone, email, company, fleetSize, industry } = extracted;
  
  if (!phone && !email && !callerName) {
    return null;
  }

  const where = { userId };
  const orClauses = [];
  if (phone) orClauses.push({ phone });
  if (email) orClauses.push({ email });
  if (orClauses.length === 0) return null;
  where.OR = orClauses;

  let customer = await tx.receptionistCustomer.findFirst({ where });

  if (!customer) {
    customer = await tx.receptionistCustomer.create({
      data: {
        userId,
        phone: phone || null,
        email: email || null,
        name: callerName || 'Unknown',
        companyName: company || null,
        fleetSize: fleetSize || null,
        industry: industry || null,
        status: 'LEAD',
        leadScore: calculateLeadScore({ fleetSize, company }),
        lastContactAt: new Date(),
      },
    });
    logger.info('CUSTOMER_CREATED_IN_TX', { userId, customerId: customer.id });
  } else {
    const updates = { lastContactAt: new Date() };
    if (callerName && !customer.name) updates.name = callerName;
    if (company && customer.companyName !== company) updates.companyName = company;
    if (fleetSize != null && customer.fleetSize !== fleetSize) updates.fleetSize = fleetSize;
    if (phone && !customer.phone) updates.phone = phone;
    if (email && !customer.email) updates.email = email;
    if (industry && !customer.industry) updates.industry = industry;

    customer = await tx.receptionistCustomer.update({
      where: { id: customer.id },
      data: {
        ...updates,
        totalCalls: { increment: 1 },
      },
    });
    logger.info('CUSTOMER_UPDATED_IN_TX', { userId, customerId: customer.id });
  }

  return customer;
}

/**
 * Find or create company in transaction with duplicate prevention
 */
async function findOrCreateCompanyInTransaction(tx, userId, companyName) {
  if (!companyName) return null;

  // Try to find existing company by name
  let company = await tx.company.findFirst({
    where: {
      name: {
        equals: companyName,
        mode: 'insensitive',
      },
    },
  });

  if (!company) {
    // Create new company
    const slug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    company = await tx.company.create({
      data: {
        name: companyName,
        slug: slug || `company-${Date.now()}`,
        plan: 'standard',
        settings: {},
      },
    });
    logger.info('COMPANY_CREATED_IN_TX', { userId, companyId: company.id, companyName });
  }

  return company;
}

/**
 * Create appointment in transaction with duplicate prevention
 */
async function createAppointmentInTransaction(tx, userId, data) {
  const { callerPhone, callerEmail, scheduledDate } = data;

  // Check for duplicate appointment (same phone/email, same date/time within 1 hour)
  const duplicateCheck = await tx.aiReceptionistAppointment.findFirst({
    where: {
      userId,
      OR: [
        callerPhone ? { callerPhone } : {},
        callerEmail ? { callerEmail } : {},
      ].filter(w => Object.keys(w).length > 0),
      scheduledDate: {
        gte: new Date(new Date(scheduledDate).getTime() - 3600000), // 1 hour before
        lte: new Date(new Date(scheduledDate).getTime() + 3600000), // 1 hour after
      },
      status: {
        in: ['SCHEDULED', 'CONFIRMED'],
      },
    },
  });

  if (duplicateCheck) {
    logger.warn('DUPLICATE_APPOINTMENT_PREVENTED', { 
      userId, 
      existingId: duplicateCheck.id,
      requestedDate: scheduledDate 
    });
    throw new Error(`Duplicate appointment detected. You already have an appointment scheduled for ${duplicateCheck.scheduledDate.toLocaleString()}.`);
  }

  const appointment = await tx.aiReceptionistAppointment.create({
    data: {
      userId,
      ...data,
      scheduledDate: new Date(scheduledDate),
    },
  });

  logger.info('APPOINTMENT_CREATED_IN_TX', { userId, appointmentId: appointment.id });
  return appointment;
}

/**
 * Parse date/time with timezone support (DST-aware via Intl)
 */
function parseDateTime(preferredDate, preferredTime, timezone) {
  let scheduledDate = new Date();

  const resolved = wallClockToUtc({ preferredDate, preferredTime, timezone });
  if (resolved) {
    scheduledDate = resolved;
  } else if (preferredDate) {
    const parsed = new Date(preferredDate);
    if (!isNaN(parsed.getTime())) {
      scheduledDate = parsed;
    }
    if (preferredTime) {
      const [hours, minutes] = preferredTime.split(':').map(Number);
      if (!isNaN(hours) && !isNaN(minutes)) {
        scheduledDate.setHours(hours, minutes, 0, 0);
      }
    }
  }

  return {
    scheduledDate,
    timezone: timezone || 'UTC',
  };
}
