import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import { queryKnowledgeBase } from './receptionistKnowledgeBase.service.js';
import * as appointmentService from './receptionistAppointment.service.js';
import * as supportService from './receptionistSupport.service.js';
import * as callService from './receptionistCall.service.js';
import * as memoryService from './receptionistMemory.service.js';
import * as crmService from './receptionistCRM.service.js';

const SESSIONS = new Map();

const STAGES = {
  GREETING: 'greeting',
  COLLECTING_NAME: 'collecting_name',
  COLLECTING_COMPANY: 'collecting_company',
  COLLECTING_CONTACT: 'collecting_contact',
  COLLECTING_FLEET_SIZE: 'collecting_fleet_size',
  COLLECTING_DATE: 'collecting_date',
  COLLECTING_TIME: 'collecting_time',
  COLLECTING_PURPOSE: 'collecting_purpose',
  COLLECTING_ISSUE: 'collecting_issue',
  COLLECTING_VEHICLE: 'collecting_vehicle',
  COLLECTING_URGENCY: 'collecting_urgency',
  SUMMARIZE_APPOINTMENT: 'summarize_appointment',
  SUMMARIZE_SUPPORT: 'summarize_support',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  COMPLETED: 'completed',
  ANSWERING_QUESTION: 'answering_question',
  CLARIFYING: 'clarifying',
};

const INTENTS = {
  BOOK_DEMO: 'book_demo',
  SCHEDULE_MEETING: 'schedule_meeting',
  SUPPORT_REQUEST: 'support_request',
  PRICING_QUESTION: 'pricing_question',
  ONBOARDING_HELP: 'onboarding_help',
  TECHNICAL_ISSUE: 'technical_issue',
  GENERAL_QUESTION: 'general_question',
  PRODUCT_QUESTION: 'product_question',
  UNKNOWN: 'unknown',
};

function classifyIntent(message) {
  const lower = message.toLowerCase().trim();

  if (lower.includes('emergency') || lower.includes('accident') || lower.includes('breakdown') || lower.includes('stranded') || lower.includes('urgent help')) {
    return 'emergency';
  }

  const knowledgeAnswer = queryKnowledgeBase(message);
  if (knowledgeAnswer) {
    return INTENTS.PRODUCT_QUESTION;
  }

  if ((lower.includes('demo') || lower.includes('book')) && (lower.includes('schedule') || lower.includes('appointment') || lower.includes('meeting') || lower.includes('call'))) {
    return INTENTS.SCHEDULE_MEETING;
  }
  if (lower.includes('demo') || (lower.includes('book') && !lower.includes('ticket'))) {
    return INTENTS.BOOK_DEMO;
  }
  if (lower.includes('schedule') || lower.includes('appointment') || lower.includes('meeting')) {
    return INTENTS.SCHEDULE_MEETING;
  }
  if (lower.includes('support') || (lower.includes('help') && !lower.includes('onboard'))) {
    return INTENTS.SUPPORT_REQUEST;
  }
  if (lower.includes('issue') || lower.includes('problem') || lower.includes('broken') || lower.includes('not working') || lower.includes('error')) {
    return INTENTS.TECHNICAL_ISSUE;
  }
  if (lower.includes('price') || lower.includes('pricing') || lower.includes('cost') || lower.includes('how much') || lower.includes('plan') || lower.includes('subscription') || lower.includes('package')) {
    return INTENTS.PRICING_QUESTION;
  }
  if (lower.includes('onboard') || lower.includes('setup') || lower.includes('getting started') || lower.includes('new to') || lower.includes('first time')) {
    return INTENTS.ONBOARDING_HELP;
  }
  if (lower.includes('how') || lower.includes('what') || lower.includes('where') || lower.includes('tell me') || lower.includes('explain') || lower.includes('can you') || lower.includes('wondering')) {
    return INTENTS.GENERAL_QUESTION;
  }
  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey') || lower.includes('good morning') || lower.includes('good afternoon')) {
    return 'greeting';
  }

  return INTENTS.UNKNOWN;
}

function extractDetails(message, existing = {}) {
  const extracted = { ...existing };

  const nameMatch = message.match(/my name is (\w+\s*\w*)/i)
    || message.match(/name['"]?s?\s*(\w+\s*\w*)/i)
    || message.match(/I['"]?m (\w+\s*\w*)/i)
    || message.match(/this is (\w+\s*\w*)/i)
    || message.match(/calling (?:from|as)\s+(\w+\s*\w*)/i)
    || message.match(/I am (\w+\s*\w*)/i);
  if (nameMatch) extracted.callerName = nameMatch[1].trim();
  else if (message.length < 30 && !extracted.callerName) {
    const words = message.trim().split(/\s+/);
    if (words.length >= 1 && words.length <= 3 && !message.match(/^(yes|no|sure|okay|ok|correct|right|yeah|yep|nope|nah)/i)) {
      extracted.callerName = message.trim();
    }
  }

  const phoneMatch = message.match(/([\+\d][\d\s\-\(\)]{7,15}\d)/);
  if (phoneMatch) extracted.phone = phoneMatch[1].trim().replace(/[\s\-\(\)]/g, '');

  const emailMatch = message.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) extracted.email = emailMatch[1].toLowerCase();

  const companyMatch = message.match(/(?:from|at|for|work at|work for)\s+(\w+(?:\s+\w+)?)\s*(?:company|fleet|logistics|transport|corp|inc|llc|ltd|solutions|group|technologies|tech)?/i)
    || message.match(/(?:company|company name|organization|business)\s*(?:is|name)?\s*['"]?(\w+(?:\s+\w+)?)['"]?/i);
  if (companyMatch) extracted.company = companyMatch[1].trim();

  const fleetMatch = message.match(/(\d+)\s*(?:vehicle|truck|car|van|bus|fleet|units)/i)
    || message.match(/(?:fleet|have|operate|manage|about|around)\s*(?:of|about|around)?\s*(\d+)/i);
  if (fleetMatch) extracted.fleetSize = parseInt(fleetMatch[1], 10);

  const vehicleMatch = message.match(/(?:vehicle|truck|car|van|bus)\s*(?:number|name|id|#)?\s*[#:]?\s*([A-Za-z0-9\-\s]{2,15})/i);
  if (vehicleMatch) extracted.vehicleReference = vehicleMatch[1].trim();

  const dateMatch = message.match(/(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)/i);
  if (dateMatch) {
    extracted.preferredDate = resolveDayToDate(dateMatch[0]);
  } else {
    const dateStr = message.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)/i);
    if (dateStr) {
      const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const monthKey = dateStr[2].toLowerCase().substring(0, 3);
      const month = months[monthKey];
      if (month !== undefined) {
        const day = parseInt(dateStr[1], 10);
        const now = new Date();
        let year = now.getFullYear();
        const date = new Date(year, month, day);
        if (date < now) year++;
        extracted.preferredDate = new Date(year, month, day).toISOString().split('T')[0];
      }
    }
  }

  const timeMatch = message.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const mins = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    if (timeMatch[3].toLowerCase() === 'pm' && hours < 12) hours += 12;
    if (timeMatch[3].toLowerCase() === 'am' && hours === 12) hours = 0;
    extracted.preferredTime = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  const issueMatch = message.match(/(?:issue|problem|help with|trouble|error|broken|not working)\s*(?:is|with|:)?\s*(.+?)(?:\.|,|$)/i)
    || message.match(/(.+?)\s*(?:is|are)\s*(?:not working|broken|having issue)/i);
  if (issueMatch) extracted.issue = issueMatch[1].trim();

  const purposeMatch = message.match(/(?:for|regarding|about|wanted to discuss|interested in|looking for)\s*(.+?)(?:\.|,|$)/i);
  if (purposeMatch && !extracted.issue && !extracted.meetingPurpose) {
    extracted.meetingPurpose = purposeMatch[1].trim();
  }

  if (message.match(/urgent|asap|immediately|critical|emergency/i)) {
    extracted.urgency = 'HIGH';
  } else if (message.match(/important|soon\r\n/i)) {
    extracted.urgency = 'MEDIUM';
  }

  const confirmationWords = ['yes', 'yeah', 'sure', 'okay', 'ok', 'correct', 'right', 'go ahead', 'please do', 'confirm', 'yep', 'do it', 'please'];
  const denialWords = ['no', 'nope', 'not', "don't", 'cancel', 'nah', 'wrong', 'change', 'never mind'];

  const firstWord = message.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
  if (confirmationWords.includes(firstWord)) {
    extracted._confirmed = true;
  } else if (denialWords.includes(firstWord)) {
    extracted._denied = true;
  }

  return extracted;
}

function resolveDayToDate(dayStr) {
  const days = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const dayNum = days[dayStr.toLowerCase()];
  if (dayNum === undefined) return dayStr;
  const now = new Date();
  const today = now.getDay();
  let diff = dayNum - today;
  if (diff <= 0) diff += 7;
  if (dayStr.toLowerCase() === 'tomorrow') diff = 1;
  const target = new Date(now);
  target.setDate(now.getDate() + diff);
  return target.toISOString().split('T')[0];
}

function getLocalGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function missingAppointmentFields(details, stage) {
  const order = ['callerName', 'company', 'phone', 'email', 'fleetSize', 'preferredDate', 'preferredTime', 'meetingPurpose'];
  const currentIndex = order.indexOf(stage?.replace('collecting_', ''));
  if (currentIndex === -1) return order[0];

  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    if (!details[key] || (typeof details[key] === 'string' && !details[key].trim())) {
      return key;
    }
  }
  return null;
}

function missingSupportFields(details) {
  if (!details.callerName) return 'callerName';
  if (!details.issue) return 'issue';
  return null;
}

function createSession() {
  const sessionId = uuidv4();
  const session = {
    sessionId,
    stage: STAGES.GREETING,
    intent: null,
    details: {},
    messages: [],
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    userId: null,
    callId: null,
    pendingAction: null,
  };
  SESSIONS.set(sessionId, session);
  return session;
}

function getSession(sessionId) {
  return SESSIONS.get(sessionId);
}

function updateSession(sessionId, updates) {
  const session = SESSIONS.get(sessionId);
  if (session) {
    Object.assign(session, updates);
    session.lastActivityAt = Date.now();
  }
  return session;
}

function buildResponse(session, reply, conversationStage, intent, options = {}) {
  return {
    sessionId: session.sessionId,
    reply,
    conversationStage,
    intent: intent || session.intent,
    extractedData: { ...session.details },
    missingFields: options.missingFields || [],
    requiresConfirmation: !!options.requiresConfirmation,
    pendingAction: options.pendingAction || null,
    isComplete: options.isComplete || false,
    suggestedReplies: options.suggestedReplies || [],
  };
}

export async function startSession(userId) {
  const session = createSession();
  session.userId = userId;

  const greeting = `${getLocalGreeting()} and welcome to FleetNimble! I am your AI receptionist. How can I help you today? You can ask to book a demo, schedule a meeting, request support, or ask me anything about FleetNimble.`;

  session.messages.push({ role: 'assistant', content: greeting });
  session.stage = STAGES.GREETING;

  return buildResponse(session, greeting, STAGES.GREETING, 'greeting', {
    suggestedReplies: ['I want to book a demo', 'I need support', 'Tell me about FleetNimble', 'What is the pricing?'],
  });
}

export async function processMessage(sessionId, message, mode = 'text') {
  const session = getSession(sessionId);
  if (!session) {
    return {
      error: true,
      reply: 'Session expired or not found. Please start a new conversation.',
    };
  }

  session.messages.push({ role: 'user', content: message, mode });
  session.lastActivityAt = Date.now();

  const details = extractDetails(message, session.details);
  session.details = details;

  const isConfirmed = details._confirmed;
  const isDenied = details._denied;
  delete details._confirmed;
  delete details._denied;

  if (session.stage === STAGES.AWAITING_CONFIRMATION) {
    if (isConfirmed) {
      return handleConfirmation(session);
    } else if (isDenied) {
      session.stage = STAGES.CLARIFYING;
      session.pendingAction = null;
      return buildResponse(session,
        'No problem at all! Let me know what you would like to change or how I can help you differently.',
        STAGES.CLARIFYING, session.intent, {
          suggestedReplies: ['I want to change the date', 'I need something else', 'Tell me about FleetNimble'],
        });
    }
    return buildResponse(session,
      'I just need a quick yes or no. Should I go ahead with what we discussed?',
      STAGES.AWAITING_CONFIRMATION, session.intent, {
        requiresConfirmation: true,
        pendingAction: session.pendingAction,
      });
  }

  const intent = classifyIntent(message);

  if (intent === 'emergency') {
    return handleEmergency(session);
  }

  if (intent === INTENTS.PRODUCT_QUESTION) {
    const answer = queryKnowledgeBase(message);
    session.messages.push({ role: 'assistant', content: answer });
    return buildResponse(session, answer, STAGES.ANSWERING_QUESTION, 'product_question', {
      suggestedReplies: ['I want to book a demo', 'I need support', 'That is all, thanks', 'Tell me more about pricing'],
    });
  }

  if (intent === INTENTS.GENERAL_QUESTION && !session.intent) {
    const answer = queryKnowledgeBase(message);
    if (answer) {
      session.messages.push({ role: 'assistant', content: answer });
      return buildResponse(session, answer, STAGES.ANSWERING_QUESTION, 'product_question', {
        suggestedReplies: ['I want to book a demo', 'I need support', 'Can you help me with something else?'],
      });
    }
    if (!session.details.callerName) {
      session.stage = STAGES.COLLECTING_NAME;
      session.intent = INTENTS.GENERAL_QUESTION;
      return buildResponse(session,
        'Great question! I would be happy to help. First, may I know your name?',
        STAGES.COLLECTING_NAME, INTENTS.GENERAL_QUESTION, {
          missingFields: ['callerName'],
        });
    }
    return buildResponse(session,
      'Thank you for your question. Is there anything specific about FleetNimble you would like to know? I can help with demos, support, pricing, and more.',
      STAGES.CLARIFYING, 'general', {
        suggestedReplies: ['Tell me about GPS tracking', 'How does live diagnostics work?', 'What are the pricing plans?'],
      });
  }

  if (intent === INTENTS.PRICING_QUESTION) {
    const answer = queryKnowledgeBase(message);
    if (answer) {
      session.messages.push({ role: 'assistant', content: answer });
      if (!session.details.callerName || !session.details.company || !session.details.fleetSize) {
        session.stage = STAGES.CLARIFYING;
        session.intent = INTENTS.PRICING_QUESTION;
        return buildResponse(session,
          `${answer}\n\nTo help me provide the most relevant pricing, could you share your name, company name, and approximate fleet size?`,
          STAGES.CLARIFYING, INTENTS.PRICING_QUESTION, {
            missingFields: ['callerName', 'company', 'fleetSize'].filter(f => !session.details[f]),
            suggestedReplies: ['My name is...', 'I have 20 vehicles', 'Schedule a pricing call'],
          });
      }
      return buildResponse(session,
        `${answer}\n\nWould you like me to schedule a call with our sales team to discuss pricing in detail?`,
        STAGES.CLARIFYING, INTENTS.PRICING_QUESTION, {
          suggestedReplies: ['Yes, please schedule', 'Not right now, thanks'],
        });
    }
  }

  if (intent === INTENTS.ONBOARDING_HELP) {
    const answer = queryKnowledgeBase(message);
    if (answer) {
      session.messages.push({ role: 'assistant', content: answer });
    }
    if (!session.details.callerName) {
      session.stage = STAGES.COLLECTING_NAME;
      session.intent = INTENTS.ONBOARDING_HELP;
      return buildResponse(session,
        'I am excited to help you get started with FleetNimble! May I know your name so I can personalize the experience?',
        STAGES.COLLECTING_NAME, INTENTS.ONBOARDING_HELP, {
          missingFields: ['callerName'],
        });
    }
    return buildResponse(session,
      `${answer || 'Welcome to FleetNimble!'} Would you like me to schedule an onboarding session with our team? They can walk you through everything step by step.`,
      STAGES.CLARIFYING, INTENTS.ONBOARDING_HELP, {
        suggestedReplies: ['Yes, schedule onboarding', 'I will explore on my own first', 'I have some questions'],
      });
  }

  if (intent === INTENTS.SCHEDULE_MEETING || intent === INTENTS.BOOK_DEMO) {
    session.intent = INTENTS.SCHEDULE_MEETING;

    if (!session.details.callerName) {
      session.stage = STAGES.COLLECTING_NAME;
      return buildResponse(session,
        'I would be happy to schedule a meeting! First, may I know your name?',
        STAGES.COLLECTING_NAME, INTENTS.SCHEDULE_MEETING, {
          missingFields: ['callerName'],
        });
    }

    if (!session.details.company) {
      session.stage = STAGES.COLLECTING_COMPANY;
      return buildResponse(session,
        `Thank you ${session.details.callerName}! Which company are you with?`,
        STAGES.COLLECTING_COMPANY, INTENTS.SCHEDULE_MEETING, {
          missingFields: ['company'],
        });
    }

    if (!session.details.phone && !session.details.email) {
      session.stage = STAGES.COLLECTING_CONTACT;
      return buildResponse(session,
        `Great, ${session.details.company}! What is the best phone number or email to reach you?`,
        STAGES.COLLECTING_CONTACT, INTENTS.SCHEDULE_MEETING, {
          missingFields: ['phone', 'email'],
        });
    }

    if (!session.details.fleetSize) {
      session.stage = STAGES.COLLECTING_FLEET_SIZE;
      return buildResponse(session,
        'And approximately how many vehicles are in your fleet?',
        STAGES.COLLECTING_FLEET_SIZE, INTENTS.SCHEDULE_MEETING, {
          missingFields: ['fleetSize'],
        });
    }

    if (!session.details.meetingPurpose) {
      session.stage = STAGES.COLLECTING_PURPOSE;
      return buildResponse(session,
        'What would you like the meeting to be about? For example, a product demo, pricing discussion, or technical consultation?',
        STAGES.COLLECTING_PURPOSE, INTENTS.SCHEDULE_MEETING, {
          missingFields: ['meetingPurpose'],
        });
    }

    if (!session.details.preferredDate) {
      session.stage = STAGES.COLLECTING_DATE;
      return buildResponse(session,
        'What date works best for the meeting?',
        STAGES.COLLECTING_DATE, INTENTS.SCHEDULE_MEETING, {
          missingFields: ['preferredDate'],
        });
    }

    if (!session.details.preferredTime) {
      session.stage = STAGES.COLLECTING_TIME;
      return buildResponse(session,
        'What time would you prefer?',
        STAGES.COLLECTING_TIME, INTENTS.SCHEDULE_MEETING, {
          missingFields: ['preferredTime'],
        });
    }

    session.stage = STAGES.SUMMARIZE_APPOINTMENT;
    session.pendingAction = 'create_appointment';
    const summary = `Thank you ${session.details.callerName}! Here is a summary of your meeting request:\n\n- **Name**: ${session.details.callerName}\n- **Company**: ${session.details.company || 'N/A'}\n- **Contact**: ${session.details.phone || session.details.email || 'N/A'}\n- **Fleet Size**: ${session.details.fleetSize || 'N/A'} vehicles\n- **Purpose**: ${session.details.meetingPurpose || 'General meeting'}\n- **Date**: ${session.details.preferredDate}\n- **Time**: ${session.details.preferredTime}\n\nShould I go ahead and schedule this meeting?`;

    return buildResponse(session, summary, STAGES.SUMMARIZE_APPOINTMENT, INTENTS.SCHEDULE_MEETING, {
      requiresConfirmation: true,
      pendingAction: 'create_appointment',
      suggestedReplies: ['Yes, please schedule it', 'No, let me change something', 'Actually, I need support instead'],
    });
  }

  if (intent === INTENTS.SUPPORT_REQUEST || intent === INTENTS.TECHNICAL_ISSUE) {
    session.intent = INTENTS.SUPPORT_REQUEST;

    if (!session.details.callerName) {
      session.stage = STAGES.COLLECTING_NAME;
      return buildResponse(session,
        'I am sorry to hear you are experiencing an issue. First, may I know your name?',
        STAGES.COLLECTING_NAME, INTENTS.SUPPORT_REQUEST, {
          missingFields: ['callerName'],
        });
    }

    if (!session.details.issue) {
      session.stage = STAGES.COLLECTING_ISSUE;
      return buildResponse(session,
        `Thank you ${session.details.callerName}. Could you briefly describe the issue you are facing?`,
        STAGES.COLLECTING_ISSUE, INTENTS.SUPPORT_REQUEST, {
          missingFields: ['issue'],
        });
    }

    if (!session.details.phone && !session.details.email) {
      session.stage = STAGES.COLLECTING_CONTACT;
      return buildResponse(session,
        'What is the best phone number or email where we can reach you regarding this issue?',
        STAGES.COLLECTING_CONTACT, INTENTS.SUPPORT_REQUEST, {
          missingFields: ['phone', 'email'],
        });
    }

    session.stage = STAGES.SUMMARIZE_SUPPORT;
    session.pendingAction = 'create_support_ticket';
    const summary = `Thank you ${session.details.callerName}. Here is a summary of your support request:\n\n- **Issue**: ${session.details.issue}\n- **Contact**: ${session.details.phone || session.details.email || 'N/A'}\n- **Urgency**: ${session.details.urgency || 'MEDIUM'}\n\nShould I create a support ticket for this issue? Our team will follow up promptly.`;

    return buildResponse(session, summary, STAGES.SUMMARIZE_SUPPORT, INTENTS.SUPPORT_REQUEST, {
      requiresConfirmation: true,
      pendingAction: 'create_support_ticket',
      suggestedReplies: ['Yes, create the ticket', 'No, let me provide more details'],
    });
  }

  if (intent === 'greeting') {
    if (session.details.callerName) {
      return buildResponse(session,
        `${getLocalGreeting()} again, ${session.details.callerName}! How can I assist you today?`,
        STAGES.GREETING, 'greeting', {
          suggestedReplies: ['I want to book a demo', 'I need support', 'Tell me about FleetNimble'],
        });
    }
    return buildResponse(session,
      `${getLocalGreeting()}! Welcome back to FleetNimble. How can I help you today?`,
      STAGES.GREETING, 'greeting', {
        suggestedReplies: ['I want to book a demo', 'I need support', 'Tell me about FleetNimble'],
      });
  }

  if (session.stage === STAGES.GREETING || !session.intent) {
    session.stage = STAGES.CLARIFYING;
    return buildResponse(session,
      'Thank you for reaching out! How can I assist you today? I can help schedule a demo, create a support ticket, or answer questions about FleetNimble.',
      STAGES.CLARIFYING, 'clarifying', {
        suggestedReplies: ['I want to book a demo', 'I need technical support', 'Tell me about FleetNimble', 'What is the pricing?'],
      });
  }

  if (session.stage === STAGES.CLARIFYING) {
    session.stage = STAGES.GREETING;
    return buildResponse(session,
      'I am here to help! You can ask me to schedule a meeting, request support, or answer any questions about FleetNimble. What would you like to do?',
      STAGES.GREETING, 'clarifying', {
        suggestedReplies: ['Book a demo', 'Request support', 'Tell me about GPS tracking'],
      });
  }

  if (session.details.callerName || message.length > 10) {
    session.stage = STAGES.CLARIFYING;
    return buildResponse(session,
      'Thank you! How can I assist you today? I can help with scheduling a demo, support requests, or answer any FleetNimble questions.',
      STAGES.CLARIFYING, 'clarifying', {
        suggestedReplies: ['I want to book a demo', 'I need support', 'Tell me about FleetNimble'],
      });
  }

  return buildResponse(session,
    `${getLocalGreeting()} and welcome to FleetNimble! I am your AI receptionist. How can I help you today?`,
    STAGES.GREETING, 'greeting', {
      suggestedReplies: ['I want to book a demo', 'I need support', 'Tell me about FleetNimble'],
    });
}

async function handleConfirmation(session) {
  if (session.pendingAction === 'create_appointment') {
    try {
      const appointment = await appointmentService.createAppointment(session.userId, {
        callerName: session.details.callerName || 'Caller',
        callerPhone: session.details.phone || null,
        callerEmail: session.details.email || null,
        companyName: session.details.company || null,
        fleetSize: session.details.fleetSize || null,
        meetingPurpose: session.details.meetingPurpose || 'General inquiry',
        scheduledDate: session.details.preferredDate
          ? new Date(session.details.preferredDate + (session.details.preferredTime ? `T${session.details.preferredTime}:00` : 'T10:00:00')).toISOString()
          : new Date(Date.now() + 86400000).toISOString(),
        durationMinutes: 30,
      });

      if (session.callId) {
        await callService.updateCall(session.userId, session.callId, {
          appointmentId: appointment.id,
          callStatus: 'COMPLETED',
          callEndedAt: new Date(),
        });
      }

      const customer = session.details.phone || session.details.email
        ? await memoryService.findOrCreateCustomer(session.userId, session.details).catch(() => null)
        : null;
      if (customer) {
        await memoryService.updateCustomerAfterCall(customer.id, {
          appointmentId: appointment.id,
          intent: 'schedule_meeting',
          summary: `Scheduled meeting: ${session.details.meetingPurpose || 'General'}`,
          sentiment: 'positive',
        }).catch(() => {});
      }

      session.stage = STAGES.COMPLETED;
      session.pendingAction = null;

      const reply = `Perfect! I have successfully scheduled your meeting.\n\n- **Meeting**: ${session.details.meetingPurpose || 'General meeting'}\n- **Date**: ${session.details.preferredDate}\n- **Time**: ${session.details.preferredTime || '10:00'}\n\nA confirmation has been saved. Is there anything else I can help you with?`;

      session.messages.push({ role: 'assistant', content: reply });

      return buildResponse(session, reply, STAGES.COMPLETED, 'appointment_created', {
        isComplete: true,
        pendingAction: null,
        suggestedReplies: ['No, that is all thanks', 'Yes, I have another question'],
      });
    } catch (err) {
      logger.error('APPOINTMENT_CREATION_ERROR', { error: err.message });
      return buildResponse(session,
        'I apologize, but I encountered an issue creating the appointment. Please try again or contact our support team directly.',
        STAGES.CLARIFYING, 'error', {
          suggestedReplies: ['Try again', 'Contact support instead'],
        });
    }
  }

  if (session.pendingAction === 'create_support_ticket') {
    try {
      const ticket = await supportService.createSupportTicket(session.userId, {
        callerName: session.details.callerName || 'Caller',
        callerPhone: session.details.phone || null,
        callerEmail: session.details.email || null,
        companyName: session.details.company || null,
        issueTitle: session.details.issue?.substring(0, 200) || 'Support request',
        issueDescription: session.details.issue || null,
        urgency: session.details.urgency || 'MEDIUM',
        relatedVehicleId: session.details.vehicleReference || null,
      });

      if (session.callId) {
        await callService.updateCall(session.userId, session.callId, {
          supportTicketId: ticket.id,
          callStatus: 'COMPLETED',
          callEndedAt: new Date(),
        });
      }

      const customer = session.details.phone || session.details.email
        ? await memoryService.findOrCreateCustomer(session.userId, session.details).catch(() => null)
        : null;
      if (customer) {
        await memoryService.updateCustomerAfterCall(customer.id, {
          ticketId: ticket.id,
          intent: 'support_request',
          summary: `Support ticket: ${session.details.issue?.substring(0, 100)}`,
          sentiment: 'neutral',
        }).catch(() => {});
      }

      session.stage = STAGES.COMPLETED;
      session.pendingAction = null;

      const reply = `Done! I have created a support ticket for your issue.\n\n- **Issue**: ${session.details.issue}\n- **Ticket ID**: ${ticket.id.substring(0, 8)}...\n- **Urgency**: ${session.details.urgency || 'MEDIUM'}\n\nOur support team will follow up with you soon. Is there anything else I can help you with?`;

      session.messages.push({ role: 'assistant', content: reply });

      return buildResponse(session, reply, STAGES.COMPLETED, 'support_ticket_created', {
        isComplete: true,
        pendingAction: null,
        suggestedReplies: ['No, that is all thanks', 'I also need to book a demo'],
      });
    } catch (err) {
      logger.error('TICKET_CREATION_ERROR', { error: err.message });
      return buildResponse(session,
        'I apologize, but I encountered an issue creating the support ticket. Please try again or contact our support team directly.',
        STAGES.CLARIFYING, 'error', {
          suggestedReplies: ['Try again', 'Contact support directly'],
        });
    }
  }

  session.stage = STAGES.CLARIFYING;
  session.pendingAction = null;
  return buildResponse(session,
    'How else can I help you today?',
    STAGES.CLARIFYING, 'clarifying', {
      suggestedReplies: ['Book a demo', 'Request support', 'Ask a question'],
    });
}

function handleEmergency(session) {
  const reply = 'I understand this is urgent. I am noting this and recommend you contact our emergency support line directly. In the meantime, please stay safe. Is there anything immediate I can do to help?';
  session.messages.push({ role: 'assistant', content: reply });
  return buildResponse(session, reply, STAGES.COMPLETED, 'emergency', {
    isComplete: true,
    suggestedReplies: ['Call emergency number', 'I need roadside assistance'],
  });
}

export async function confirmAction(sessionId, action) {
  const session = getSession(sessionId);
  if (!session) {
    return { error: true, message: 'Session not found' };
  }

  if (action === 'create_appointment' || (session.pendingAction === 'create_appointment' && action === 'confirm')) {
    return handleConfirmation(session);
  }

  if (action === 'create_support_ticket' || (session.pendingAction === 'create_support_ticket' && action === 'confirm')) {
    return handleConfirmation(session);
  }

  return buildResponse(session,
    'I am not sure what to confirm. How can I help you?',
    STAGES.CLARIFYING, 'clarifying');
}

export function endSession(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;

  const transcript = session.messages;
  const summary = transcript
    .filter(m => m.role === 'assistant')
    .slice(-3)
    .map(m => m.content?.substring(0, 100))
    .join(' | ');

  if (session.userId && (session.callId || transcript.length > 2)) {
    callService.createCall(session.userId, {
      callerName: session.details.callerName || 'Voice Caller',
      callerPhone: session.details.phone || null,
      callerEmail: session.details.email || null,
      companyName: session.details.company || null,
      fleetSize: session.details.fleetSize || null,
      callType: mapIntentToCallType(session.intent),
      callStatus: 'COMPLETED',
      callEndedAt: new Date(),
      transcript: JSON.stringify(transcript),
      summary,
      extractedData: session.details,
    }).catch(err => logger.error('SAVE_CALL_ERROR', { error: err.message }));
  }

  SESSIONS.delete(sessionId);
  return { transcript, summary };
}

export function cleanupStaleSessions(maxAgeMs = 1800000) {
  const now = Date.now();
  let count = 0;
  SESSIONS.forEach((session, sessionId) => {
    if (now - session.lastActivityAt > maxAgeMs) {
      endSession(sessionId);
      count++;
    }
  });
  return count;
}

function mapIntentToCallType(intent) {
  const map = {
    schedule_meeting: 'DEMO',
    book_demo: 'DEMO',
    support_request: 'SUPPORT',
    pricing_question: 'PRICING',
    onboarding_help: 'ONBOARDING',
    technical_issue: 'SUPPORT',
    product_question: 'GENERAL',
    general_question: 'GENERAL',
    emergency: 'EMERGENCY',
  };
  return map[intent] || 'OTHER';
}

export { getSession, STAGES, INTENTS, SESSIONS };
