import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { recordTimelineEvent, TIMELINE_EVENT_TYPES } from './conversationTimeline.service.js';
import { isPersistenceAvailable } from './receptionistTenantResolver.service.js';
import { getEmailProvider, getSmsProvider, getAdminProvider } from './receptionistNotification.service.js';
import { createCalendarEvent } from './receptionistCalendar.service.js';

export const FOLLOW_UP_CHANNELS = Object.freeze({
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  CRM_ACTIVITY: 'CRM_ACTIVITY',
  REMINDER: 'REMINDER',
  CALENDAR: 'CALENDAR',
});

function formatDate(date) {
  try {
    return new Date(date).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return String(date);
  }
}

export function buildFollowUpEmailContent({ appointment, customer }) {
  const name = appointment.callerName || customer?.name || 'there';
  const date = formatDate(appointment.scheduledDate);
  return {
    subject: `Your FleetNimble Demo Confirmation — ${date}`,
    body: [
      `Hi ${name},`,
      '',
      `Thank you for scheduling a demo with FleetNimble. Your ${appointment.meetingTitle || 'demo'} is confirmed for ${date}.`,
      '',
      `Meeting reference: ${appointment.id.substring(0, 8)}`,
      appointment.meetingLink ? `Join link: ${appointment.meetingLink}` : 'You will receive a confirmation with meeting details by email or SMS.',
      '',
      'We will tailor the demo to your fleet needs — bring any questions about your current setup.',
      '',
      'Best regards,',
      'The FleetNimble Team',
    ].join('\n'),
  };
}

export function buildFollowUpSmsContent({ appointment, customer }) {
  const name = appointment.callerName || customer?.name || null;
  const date = formatDate(appointment.scheduledDate);
  const greeting = name ? `Hi ${name},` : 'Hi,';
  return `${greeting} your FleetNimble demo is confirmed for ${date}. Ref ${appointment.id.substring(0, 8)}. Reply or call us if you need to reschedule.`;
}

async function createReminder({ userId, customerId, appointmentId, callId, channel, subject, content, dueAt, status = 'PENDING' }) {
  const reminder = await prisma.followUpReminder.create({
    data: { userId, customerId, appointmentId, callId, channel, subject, content, dueAt, status },
  });
  logger.info('FOLLOW_UP_CREATED', { channel, reminderId: reminder.id, appointmentId });
  return reminder;
}

export async function createFollowUpBundle({ userId, companyId = null, callId = null, callSid = null, customerId = null, appointment }) {
  if (!appointment?.id) return null;
  try {
    return await createFollowUpBundleInner({ userId, companyId, callId, callSid, customerId, appointment });
  } catch (err) {
    logger.warn('FOLLOW_UP_BUNDLE_FAILED', { appointmentId: appointment.id, error: err.message });
    return null;
  }
}

async function createFollowUpBundleInner({ userId, companyId = null, callId = null, callSid = null, customerId = null, appointment }) {
  const customer = customerId
    ? await prisma.receptionistCustomer.findUnique({ where: { id: customerId }, select: { id: true, name: true, email: true, phone: true } }).catch(() => null)
    : null;

  const emailProvider = getEmailProvider();
  const smsProvider = getSmsProvider();
  const dueAt = new Date(appointment.scheduledDate);

  const created = [];

  if (emailProvider.available && (appointment.callerEmail || customer?.email)) {
    const email = buildFollowUpEmailContent({ appointment, customer });
    const reminder = await createReminder({
      userId, customerId: customer?.id || null, appointmentId: appointment.id, callId,
      channel: FOLLOW_UP_CHANNELS.EMAIL, subject: email.subject, content: email.body, dueAt,
    });
    const sent = await emailProvider.send({
      to: appointment.callerEmail || customer.email,
      subject: email.subject,
      body: email.body,
      userId,
      appointmentId: appointment.id,
    }).catch(err => {
      logger.warn('FOLLOW_UP_EMAIL_SEND_FAILED', { appointmentId: appointment.id, error: err.message });
      return { sent: false };
    });
    if (sent.sent) {
      await prisma.followUpReminder.update({ where: { id: reminder.id }, data: { status: 'SENT', sentAt: new Date() } });
    }
    created.push({ channel: FOLLOW_UP_CHANNELS.EMAIL, reminderId: reminder.id, sent: !!sent.sent });
  }

  if (smsProvider.available && (appointment.callerPhone || customer?.phone)) {
    const sms = buildFollowUpSmsContent({ appointment, customer });
    const reminder = await createReminder({
      userId, customerId: customer?.id || null, appointmentId: appointment.id, callId,
      channel: FOLLOW_UP_CHANNELS.SMS, subject: 'SMS confirmation', content: sms, dueAt,
    });
    const sent = await smsProvider.send({
      to: appointment.callerPhone || customer.phone,
      message: sms,
      userId,
      appointmentId: appointment.id,
    }).catch(err => {
      logger.warn('FOLLOW_UP_SMS_SEND_FAILED', { appointmentId: appointment.id, error: err.message });
      return { sent: false };
    });
    if (sent.sent) {
      await prisma.followUpReminder.update({ where: { id: reminder.id }, data: { status: 'SENT', sentAt: new Date() } });
    }
    created.push({ channel: FOLLOW_UP_CHANNELS.SMS, reminderId: reminder.id, sent: !!sent.sent });
  }

  if (customerId) {
    const note = await prisma.receptionistCustomerNote.create({
      data: {
        customerId,
        userId,
        type: 'FOLLOW_UP',
        content: `Demo scheduled for ${formatDate(appointment.scheduledDate)} — follow-up email/SMS sequence created. Ref ${appointment.id.substring(0, 8)}.`,
      },
    });
    created.push({ channel: FOLLOW_UP_CHANNELS.CRM_ACTIVITY, reminderId: note.id, sent: true });
  }

  const reminder = await createReminder({
    userId, customerId: customer?.id || null, appointmentId: appointment.id, callId,
    channel: FOLLOW_UP_CHANNELS.REMINDER,
    subject: 'Reminder: FleetNimble demo follow-up',
    content: `Follow up with the customer ${customer?.name ? `(${customer.name}) ` : ''}regarding the demo on ${formatDate(appointment.scheduledDate)}.`,
    dueAt: new Date(dueAt.getTime() - 3600000),
  });
  created.push({ channel: FOLLOW_UP_CHANNELS.REMINDER, reminderId: reminder.id, sent: true });

  const calResult = await createCalendarEvent(userId, appointment).catch(err => {
    logger.warn('FOLLOW_UP_CALENDAR_FAILED', { appointmentId: appointment.id, error: err.message });
    return { provider: 'internal', eventId: null };
  });
  if (calResult?.eventId) {
    const calReminder = await createReminder({
      userId, customerId: customer?.id || null, appointmentId: appointment.id, callId,
      channel: FOLLOW_UP_CHANNELS.CALENDAR,
      subject: 'Calendar event created',
      content: `Calendar event created via ${calResult.provider} (${calResult.eventId || 'internal'}).`,
      dueAt: new Date(appointment.scheduledDate),
      status: 'DONE',
    });
    created.push({ channel: FOLLOW_UP_CHANNELS.CALENDAR, reminderId: calReminder.id, sent: true });
    if (calResult.provider !== 'internal' && calResult.eventId) {
      await prisma.aiReceptionistAppointment.update({
        where: { id: appointment.id },
        data: { calendarProvider: calResult.provider, calendarEventId: calResult.eventId, meetingLink: calResult.meetingLink || null },
      }).catch(() => {});
    }
  }

  try {
    await getAdminProvider().send('follow_up_created', { userId, appointmentId: appointment.id, channels: created.map(c => c.channel) });
  } catch (err) {
    logger.warn('FOLLOW_UP_ADMIN_NOTIFY_FAILED', { appointmentId: appointment.id, error: err.message });
  }

  if (callId) {
    await recordTimelineEvent({
      userId,
      callId,
      callSid,
      eventType: TIMELINE_EVENT_TYPES.APPOINTMENT_CONFIRMED,
      data: { appointmentId: appointment.id, followUps: created.map(c => c.channel) },
    });
  }

  return { appointmentId: appointment.id, created };
}

export async function getFollowUps(userId, { status = null, limit = 50 } = {}) {
  if (!isPersistenceAvailable()) return [];
  try {
    const where = { userId };
    if (status) where.status = status;
    const reminders = await prisma.followUpReminder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        customer: { select: { id: true, name: true, companyName: true, phone: true, email: true } },
        appointment: { select: { id: true, meetingTitle: true, scheduledDate: true } },
      },
    });
    return reminders;
  } catch (err) {
    logger.warn('FOLLOW_UPS_QUERY_FAILED', { userId, error: err.message });
    return [];
  }
}

export async function getFollowUpsByAppointment(userId, appointmentId) {
  if (!isPersistenceAvailable()) return [];
  try {
    return await prisma.followUpReminder.findMany({
      where: { userId, appointmentId },
      orderBy: { channel: 'asc' },
    });
  } catch (err) {
    logger.warn('FOLLOW_UPS_BY_APPOINTMENT_FAILED', { appointmentId, error: err.message });
    return [];
  }
}

export async function completeFollowUp(userId, reminderId) {
  if (!isPersistenceAvailable()) return null;
  try {
    const reminder = await prisma.followUpReminder.findFirst({ where: { id: reminderId, userId } });
    if (!reminder) return null;
    return await prisma.followUpReminder.update({
      where: { id: reminderId },
      data: { status: 'DONE', sentAt: reminder.sentAt || new Date() },
    });
  } catch (err) {
    logger.warn('FOLLOW_UP_COMPLETE_FAILED', { reminderId, error: err.message });
    return null;
  }
}
