import logger from '../utils/logger.js';

const INTENTS = {
  BOOK_DEMO: 'book_demo',
  SCHEDULE_MEETING: 'schedule_meeting',
  SUPPORT_REQUEST: 'support_request',
  PRICING_QUESTION: 'pricing_question',
  ONBOARDING_HELP: 'onboarding_help',
  TECHNICAL_ISSUE: 'technical_issue',
  EMERGENCY_ESCALATION: 'emergency_escalation',
  GENERAL_QUESTION: 'general_question',
  CANCEL_APPOINTMENT: 'cancel_appointment',
  RESCHEDULE: 'reschedule',
  CHECK_APPOINTMENT: 'check_appointment',
  TICKET_STATUS: 'ticket_status',
  UNKNOWN: 'unknown',
};

function classifyIntent(message) {
  const lower = message.toLowerCase();

  if (lower.includes('emergency') || lower.includes('urgent') || lower.includes('accident') || lower.includes('breakdown') || lower.includes('stranded')) {
    return INTENTS.EMERGENCY_ESCALATION;
  }
  if (lower.includes('cancel') && (lower.includes('appointment') || lower.includes('meeting') || lower.includes('booking'))) {
    return INTENTS.CANCEL_APPOINTMENT;
  }
  if ((lower.includes('reschedule') || lower.includes('change date') || lower.includes('change time') || lower.includes('postpone')) && (lower.includes('appointment') || lower.includes('meeting'))) {
    return INTENTS.RESCHEDULE;
  }
  if ((lower.includes('check') || lower.includes('status') || lower.includes('when')) && (lower.includes('appointment') || lower.includes('meeting') || lower.includes('demo'))) {
    return INTENTS.CHECK_APPOINTMENT;
  }
  if ((lower.includes('ticket') || lower.includes('support status') || lower.includes('issue status'))) {
    return INTENTS.TICKET_STATUS;
  }
  if (lower.includes('demo') || lower.includes('book') || lower.includes('schedule') || lower.includes('appointment') || lower.includes('meeting')) {
    return INTENTS.SCHEDULE_MEETING;
  }
  if (lower.includes('support') || lower.includes('help') || lower.includes('issue') || lower.includes('problem') || lower.includes('broken') || lower.includes('not working')) {
    return INTENTS.SUPPORT_REQUEST;
  }
  if (lower.includes('price') || lower.includes('pricing') || lower.includes('cost') || lower.includes('quote') || lower.includes('subscription') || lower.includes('plan') || lower.includes('package')) {
    return INTENTS.PRICING_QUESTION;
  }
  if (lower.includes('onboarding') || lower.includes('setup') || lower.includes('getting started') || lower.includes('begin') || lower.includes('start') || lower.includes('new to')) {
    return INTENTS.ONBOARDING_HELP;
  }
  if (lower.includes('technical') || lower.includes('error') || lower.includes('bug') || lower.includes('crash') || lower.includes('fail')) {
    return INTENTS.TECHNICAL_ISSUE;
  }
  if (lower.includes('how') || lower.includes('what') || lower.includes('tell me') || lower.includes('explain') || lower.includes('question') || lower.includes('wondering')) {
    return INTENTS.GENERAL_QUESTION;
  }
  return INTENTS.UNKNOWN;
}

function extractDetails(message) {
  const extracted = {
    callerName: null,
    phone: null,
    email: null,
    company: null,
    fleetSize: null,
    preferredDate: null,
    preferredTime: null,
    issue: null,
    urgency: null,
    vehicleReference: null,
    meetingPurpose: null,
  };

  const nameMatch = message.match(/my name is (\w+\s*\w*)/i) || message.match(/name['"]?s?\s*(\w+\s*\w*)/i) || message.match(/I['"]?m (\w+\s*\w*)/i) || message.match(/this is (\w+\s*\w*)/i) || message.match(/calling (?:from|as)\s+(\w+\s*\w*)/i);
  if (nameMatch) extracted.callerName = nameMatch[1].trim();

  const phoneMatch = message.match(/([\+\d][\d\s\-\(\)]{7,15}\d)/);
  if (phoneMatch) extracted.phone = phoneMatch[1].trim().replace(/[\s\-\(\)]/g, '');

  const emailMatch = message.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) extracted.email = emailMatch[1].toLowerCase();

  const companyMatch = message.match(/(?:from|at|for)\s+(\w+(?:\s+\w+)?)\s+(?:company|fleet|logistics|transport|corporation|inc|llc|ltd|solutions|group)/i) ||
    message.match(/(?:company|company name|organization|business)\s*(?:is|name)?\s*['"]?(\w+(?:\s+\w+)?)['"]?/i) ||
    message.match(/(\w+(?:\s+\w+)?)\s+(?:logistics|transport|fleet|trucking|shipping)/i);
  if (companyMatch) extracted.company = companyMatch[1].trim();

  const fleetMatch = message.match(/(\d+)\s*(?:vehicle|truck|car|fleet|units)/i) || message.match(/(?:fleet|have|operate|manage)\s*(?:of|about|around)?\s*(\d+)/i);
  if (fleetMatch) extracted.fleetSize = parseInt(fleetMatch[1], 10);

  const vehicleMatch = message.match(/(?:vehicle|truck|car|van|bus)\s*(?:number|name|id|#)?\s*[#:]?\s*([A-Za-z0-9\-\s]{2,})/i);
  if (vehicleMatch) extracted.vehicleReference = vehicleMatch[1].trim();

  const dateMatch = message.match(/(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)/i);
  if (dateMatch) {
    extracted.preferredDate = resolveDayToDate(dateMatch[0]);
  } else {
    const dateStr = message.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)/i);
    if (dateStr) extracted.preferredDate = dateStr[0];
  }

  const timeMatch = message.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeMatch) extracted.preferredTime = timeMatch[0];

  const issueMatch = message.match(/(?:issue|problem|help with|trouble|error|broken|not working) (?:with|is|:)?\s*(.+?)(?:\.|,|$)/i);
  if (issueMatch) extracted.issue = issueMatch[1].trim();

  const purposeMatch = message.match(/(?:for|regarding|about|wanted to discuss|interested in|looking for)\s*(.+?)(?:\.|,|$)/i);
  if (purposeMatch && !extracted.issue) extracted.meetingPurpose = purposeMatch[1].trim();

  if (message.match(/urgent|asap|immediately|critical|emergency|ASAP/i)) {
    extracted.urgency = 'HIGH';
  } else if (message.match(/important|soon|needed|priority/i)) {
    extracted.urgency = 'MEDIUM';
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

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function detectLanguage(message) {
  const commonEnglish = /^(hi|hello|hey|good|how|what|when|where|can|i|we|my|the|a|an|is|are|was|were|do|does|did)/i;
  const commonHindi = /(namaste|kaise|kya|aap|main|hum|hai|hain|ho|ka|ki|ke|se|ko|mein|tha|the)/i;
  const commonTamil = /(vanakkam|eppadi|enna|nalla|ungal|enakku|illa|ama|varuga)/i;
  const commonTelugu = /(namaskaram|ela|emiti|miku|naku|kavali|avunu|kaadu)|(చే|ను|ము|దు|ను)/i;

  if (commonHindi.test(message)) return 'hi';
  if (commonTamil.test(message)) return 'ta';
  if (commonTelugu.test(message)) return 'te';
  return 'en';
}

const GREETINGS = {
  en: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' },
  hi: { morning: 'Suprabhat', afternoon: 'Namaste', evening: 'Shubh Sandhya' },
  ta: { morning: 'Kaalai Vanakkam', afternoon: 'Madhiya Vanakkam', evening: 'Malai Vanakkam' },
  te: { morning: 'Subhodhayam', afternoon: 'Namaskaram', evening: 'Subha Sandhyam' },
};

function localGreeting(lang) {
  const hour = new Date().getHours();
  const g = GREETINGS[lang] || GREETINGS.en;
  if (hour < 12) return g.morning;
  if (hour < 17) return g.afternoon;
  return g.evening;
}

export function processSimulatedCall(message, session, customerMemory = null) {
  logger.info('AI_RECEPTIONIST_REQUEST', { message: message?.substring(0, 100) });

  const intent = classifyIntent(message);
  const details = extractDetails(message);
  const lang = detectLanguage(message);
  const confirmed = /^(yes|yeah|sure|ok(?:ay)?|correct|right|go ahead|please do|confirm|yep|हाँ|हां|ji haan|avunu|ama)/i.test(message.trim());
  const denied = /^(no|nope|not|don't|cancel|wrong|change|nah|नहीं|nahi|illa|kaadu)/i.test(message.trim()) && !confirmed;

  session.details = { ...session.details, ...details };
  session.messages = session.messages || [];
  session.messages.push({ role: 'user', content: message });

  const memoryPrompt = customerMemory ? buildMemoryContext(customerMemory) : '';

  if (intent === INTENTS.EMERGENCY_ESCALATION) {
    session.intent = 'emergency';
    return respond(session,
      `${localGreeting(lang)}. I understand this is an emergency situation. I am immediately notifying our team to assist you. Please stay safe and share your current location. A support agent will be with you shortly.`,
      'emergency', true);
  }

  if (intent === INTENTS.CANCEL_APPOINTMENT) {
    if (session.confirming) {
      if (confirmed) {
        session.intent = 'cancelled';
        return respond(session,
          'I have cancelled the appointment. You will receive a confirmation email shortly. Is there anything else I can help you with?',
          'cancelled', false, true);
      }
      if (denied) { session.confirming = false; return respond(session, 'No problem! Your appointment remains as scheduled. Anything else?', 'updated', false); }
      return respond(session, 'To confirm, would you like me to cancel your appointment?', 'awaiting_confirmation');
    }
    session.confirming = true;
    session.pendingIntent = 'cancel_appointment';
    return respond(session,
      `I can help cancel that appointment. Just to confirm, would you like me to cancel your scheduled meeting?`,
      'awaiting_confirmation');
  }

  if (intent === INTENTS.CHECK_APPOINTMENT) {
    return respond(session,
      `Let me check your appointment status for you. One moment please.`,
      'checking', false, false, true);
  }

  if (intent === INTENTS.TICKET_STATUS) {
    return respond(session,
      `Let me check the status of your support ticket.`,
      'checking', false, false, true);
  }

  if (session.confirming && session.pendingIntent === 'schedule_meeting') {
    if (confirmed) {
      session.confirmed = true;
      session.intent = 'schedule_meeting';
      return respond(session,
        `Excellent! I've noted your confirmation. Let me create that appointment for you now.`,
        'schedule_meeting', false, true);
    }
    if (denied) {
      session.confirming = false;
      session.pendingIntent = null;
      return respond(session,
        'No problem at all! Please let me know what you would like to change. A different date, time, or anything else?',
        'updating', false);
    }
    return respond(session,
      'I just need a quick confirmation. Should I proceed with scheduling this appointment? Please say yes or no.',
      'awaiting_confirmation');
  }

  if (session.confirming && session.pendingIntent === 'support_request') {
    if (confirmed) {
      session.confirmed = true;
      session.intent = 'support_request';
      return respond(session,
        `Thank you for confirming. I'll create a support ticket right away and our team will follow up.`,
        'support_request', false, true);
    }
    if (denied) {
      session.confirming = false;
      session.pendingIntent = null;
      return respond(session,
        'No worries! Can you provide more details about what you need help with?',
        'updating', false);
    }
    return respond(session,
      'Should I go ahead and create this support ticket? Please confirm yes or no.',
      'awaiting_confirmation');
  }

  if (intent === INTENTS.SCHEDULE_MEETING || intent === INTENTS.BOOK_DEMO) {
    const missing = [];
    if (!session.details.callerName) missing.push('your name');
    if (!session.details.company) missing.push('your company name');
    if (!session.details.phone && !session.details.email) missing.push('your phone number or email');
    if (!session.details.fleetSize) missing.push('the size of your fleet');
    if (!session.details.preferredDate) missing.push('your preferred date');
    if (!session.details.preferredTime) missing.push('your preferred time');

    if (missing.length > 0) {
      return respond(session,
        `I'd be happy to help with that! Could you please share ${missing.join(', ')}?`,
        'collecting_details');
    }

    const name = session.details.callerName || '';
    const date = session.details.preferredDate || 'to be confirmed';
    const time = session.details.preferredTime || 'to be confirmed';

    session.confirming = true;
    session.pendingIntent = 'schedule_meeting';
    return respond(session,
      `Thank you ${name}! Here is a quick summary:\n- **Purpose**: ${session.details.meetingPurpose || 'General meeting'}\n- **Company**: ${session.details.company || 'N/A'}\n- **Fleet Size**: ${session.details.fleetSize || 'N/A'} vehicles\n- **Date**: ${date}\n- **Time**: ${time}\n\nShall I schedule this meeting? Please confirm yes or no.`,
      'awaiting_confirmation');
  }

  if (intent === INTENTS.SUPPORT_REQUEST || intent === INTENTS.TECHNICAL_ISSUE) {
    const missing = [];
    if (!session.details.callerName) missing.push('your name');
    if (!session.details.issue) missing.push('a brief description of the issue');
    if (!session.details.vehicleReference) missing.push('the vehicle name or number');

    if (missing.length > 0) {
      return respond(session,
        `I'm sorry to hear you're experiencing this. To create a support ticket, I'll need ${missing.join(', ')}. Please go ahead.`,
        'collecting_details');
    }

    const name = session.details.callerName || '';
    session.confirming = true;
    session.pendingIntent = 'support_request';
    return respond(session,
      `Thank you ${name}. Here is what I have for the support ticket:\n- **Issue**: ${session.details.issue}\n- **Vehicle**: ${session.details.vehicleReference || 'N/A'}\n- **Urgency**: ${session.details.urgency || 'MEDIUM'}\n\nShould I create this support ticket?`,
      'awaiting_confirmation');
  }

  if (intent === INTENTS.PRICING_QUESTION) {
    return respond(session,
      `Great question! We offer flexible pricing plans based on fleet size. Could you share your name, company name, and approximate fleet size? I'll have our team send you the most relevant pricing information.`,
      'pricing');
  }

  if (intent === INTENTS.ONBOARDING_HELP) {
    return respond(session,
      `Welcome to FleetNimble! I'm excited to help you get started. Our onboarding covers vehicle setup, GPS tracking, OBD device connection, and dashboard configuration. Could you share your name and company so I can personalize the experience?`,
      'onboarding');
  }

  if (intent === INTENTS.GENERAL_QUESTION) {
    return respond(session,
      `Great question! I'd be happy to help. Let me connect you with the right information. Could you share your name and the best way to reach you?`,
      'general');
  }

  if (intent === INTENTS.RESCHEDULE) {
    if (session.details.preferredDate || session.details.preferredTime) {
      session.confirming = true;
      session.pendingIntent = 'reschedule';
      return respond(session,
        `I can help reschedule. Shall I update it to ${session.details.preferredDate || ''} ${session.details.preferredTime || ''}?`,
        'awaiting_confirmation');
    }
    return respond(session,
      `I can help reschedule your appointment. What date and time would work better for you?`,
      'collecting_details');
  }

  if (session.details.callerName || message.length > 10) {
    session.confirming = true;
    session.pendingIntent = 'schedule_meeting';
    return respond(session,
      `Thank you for reaching out! I'd be happy to assist. Are you looking to schedule a meeting, create a support ticket, or get information about our products and pricing?`,
      'clarifying');
  }

  const greeting = memoryPrompt
    ? `${localGreeting(lang)}! Welcome back${session.details.callerName ? ' ' + session.details.callerName : ''}! Great to hear from you again. How can I assist you today?`
    : `${localGreeting(lang)} and thank you for calling FleetNimble! I'm your AI receptionist. How can I assist you today? You can ask about scheduling a demo, support, pricing, or anything else.`;

  return respond(session, greeting, 'greeting');
}

function respond(session, response, intent, escalate = false, confirmed = false, requiresAction = false) {
  return {
    response,
    intent,
    extracted: session.details,
    escalate,
    confirmed,
    requiresAction,
    session,
  };
}

function buildMemoryContext(memory) {
  if (!memory || !memory.customer) return '';
  const { customer, recentCalls, recentAppointments, recentTickets, isReturning } = memory;
  const parts = [];

  if (isReturning && customer.name) {
    parts.push(`Returning caller: ${customer.name}`);
    if (customer.companyName) parts.push(`Company: ${customer.companyName}`);
    if (customer.lastSummary) parts.push(`Last conversation: ${customer.lastSummary}`);
  }

  if (customer.fleetSize != null) parts.push(`Fleet: ${customer.fleetSize} vehicles`);
  if (customer.status) parts.push(`Status: ${customer.status}`);
  if (customer.leadScore > 0) parts.push(`Lead score: ${customer.leadScore}`);

  return parts.join('\n');
}
