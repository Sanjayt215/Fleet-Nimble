import { z } from 'zod';

export const createCallSchema = z.object({
  body: z.object({
    callerName: z.string().min(1).max(200),
    callerPhone: z.string().max(50).optional().nullable(),
    callerEmail: z.string().email().max(200).optional().nullable(),
    companyName: z.string().max(200).optional().nullable(),
    fleetSize: z.number().int().min(0).optional().nullable(),
    callType: z.enum(['DEMO','SUPPORT','PRICING','ONBOARDING','COMPLAINT','EMERGENCY','GENERAL','OTHER']).optional().default('OTHER'),
    callStatus: z.enum(['NEW','IN_PROGRESS','COMPLETED','ESCALATED','FAILED']).optional().default('NEW'),
    transcript: z.string().optional().nullable(),
    summary: z.string().optional().nullable(),
  }),
});

export const updateCallStatusSchema = z.object({
  body: z.object({
    callStatus: z.enum(['NEW','IN_PROGRESS','COMPLETED','ESCALATED','FAILED']),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const createAppointmentSchema = z.object({
  body: z.object({
    callerName: z.string().min(1).max(200),
    callerPhone: z.string().max(50).optional().nullable(),
    callerEmail: z.string().email().max(200).optional().nullable(),
    companyName: z.string().max(200).optional().nullable(),
    fleetSize: z.number().int().min(0).optional().nullable(),
    meetingTitle: z.string().max(300).optional().default('Scheduled Meeting'),
    meetingPurpose: z.string().max(1000).optional().nullable(),
    scheduledDate: z.string().refine((v) => !isNaN(Date.parse(v)), 'Invalid date'),
    durationMinutes: z.number().int().min(5).max(480).optional().default(30),
    notes: z.string().max(2000).optional().nullable(),
    assignedTo: z.string().uuid().optional().nullable(),
    callId: z.string().uuid().optional().nullable(),
  }),
});

export const updateAppointmentSchema = z.object({
  body: z.object({
    status: z.enum(['SCHEDULED','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW']).optional(),
    meetingTitle: z.string().max(300).optional(),
    meetingPurpose: z.string().max(1000).optional().nullable(),
    scheduledDate: z.string().optional(),
    durationMinutes: z.number().int().min(5).max(480).optional(),
    notes: z.string().max(2000).optional().nullable(),
    assignedTo: z.string().uuid().optional().nullable(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const createSupportTicketSchema = z.object({
  body: z.object({
    callerName: z.string().min(1).max(200),
    callerPhone: z.string().max(50).optional().nullable(),
    callerEmail: z.string().email().max(200).optional().nullable(),
    companyName: z.string().max(200).optional().nullable(),
    issueTitle: z.string().min(1).max(300),
    issueDescription: z.string().max(5000).optional().nullable(),
    urgency: z.enum(['LOW','MEDIUM','HIGH','CRITICAL']).optional().default('MEDIUM'),
    relatedVehicleId: z.string().uuid().optional().nullable(),
    callId: z.string().uuid().optional().nullable(),
  }),
});

export const updateConfigSchema = z.object({
  body: z.object({
    businessName: z.string().max(200).optional(),
    greetingMessage: z.string().max(2000).optional(),
    workingHours: z.object({}).passthrough().optional(),
    timezone: z.string().max(100).optional(),
    escalationPhone: z.string().max(50).optional().nullable(),
    escalationEmail: z.string().email().max(200).optional().nullable(),
    salesHandoffNumber: z.string().max(50).optional().nullable(),
    supportHandoffNumber: z.string().max(50).optional().nullable(),
    emergencyHandoffNumber: z.string().max(50).optional().nullable(),
    afterHoursBehavior: z.enum(['voicemail', 'forward', 'message']).optional(),
    appointmentDuration: z.number().int().min(5).max(480).optional(),
    enabled: z.boolean().optional(),
  }),
});

export const simulateCallSchema = z.object({
  body: z.object({
    message: z.string().min(1).max(2000),
    callId: z.string().uuid().optional().nullable(),
  }),
});

export const paginationSchema = z.object({
  query: z.object({
    page: z.string().optional().default('1'),
    limit: z.string().optional().default('20'),
    status: z.string().optional(),
    type: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
});
