import { config } from '../config/index.js';
import { LIVE_TOOL_DEFINITIONS } from './receptionistLiveTools.service.js';

const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
const GEMINI_VOICE_MAP = {
  alloy: 'Puck',
  echo: 'Charon',
  fable: 'Kore',
  onyx: 'Fenrir',
  nova: 'Aoede',
  shimmer: 'Puck',
};

export const AI_RECEPTIONIST_GREETING =
  "Hi! Thank you for calling FleetNimble. I'm FleetNimble's AI Receptionist, and I'm here to help. I can answer your questions about our fleet management platform, help you explore what FleetNimble can do for your business, or help you book a demo. How can I help you today?";

export function buildGreetingMessage(customerMemory = null) {
  if (customerMemory?.isReturning && customerMemory?.customer?.name) {
    return `Welcome back, ${customerMemory.customer.name}. Last time we discussed FleetNimble. I'm FleetNimble's AI Receptionist, and I'm here to help. How may I help you today?`;
  }
  return AI_RECEPTIONIST_GREETING;
}

const BOOKING_CONFIRMATION_PATTERNS = [
  /shall i (?:go ahead and|proceed to)?\s*(?:book|schedule|confirm)/i,
  /(?:go ahead|confirm|ready to)\s*(?:and)?\s*(?:book|schedule)/i,
  /book (?:this|that|the) (?:demo|appointment|meeting)/i,
  /should i (?:go ahead|book|schedule)/i,
  /may i (?:go ahead|book|schedule)/i,
  /i(?:'| a)?ll (?:go ahead|book|schedule)/i,
];

export function isBookingConfirmationRequest(text) {
  if (!text || typeof text !== 'string') return false;
  return BOOKING_CONFIRMATION_PATTERNS.some((pattern) => pattern.test(text));
}

export function mapToOpenAIVoice(voiceId) {
  if (OPENAI_VOICES.includes(voiceId?.toLowerCase())) {
    return voiceId.toLowerCase();
  }
  return config.openai.voice || 'alloy';
}

export function mapToProviderVoice(provider, voiceId) {
  if (provider === 'gemini') {
    return GEMINI_VOICE_MAP[voiceId?.toLowerCase()] || voiceId || 'Puck';
  }
  return mapToOpenAIVoice(voiceId);
}

const BASE_PROMPT_CACHE = new Map();

export function buildSystemPrompt(config, memoryContext = '', businessContext = null) {
  const businessName = config.businessName || 'FleetNimble';
  const cacheKey = `${businessName}_${config.realtime?.businessToolsEnabled ?? true}`;
  if (BASE_PROMPT_CACHE.has(cacheKey) && !memoryContext && !businessContext) {
    return BASE_PROMPT_CACHE.get(cacheKey);
  }

  const businessToolsEnabled = config.realtime?.businessToolsEnabled ?? true;

  const toolsIntro = businessToolsEnabled
    ? 'Use tools via function calling when needed. Never describe tools to the caller.'
    : 'Business tools disabled. General questions only.';

  const memorySection = memoryContext
    ? `\nCaller: ${memoryContext}`
    : '';

  const businessSection = businessContext
    ? `\n\nBusiness context for this call:\n${businessContext}\n\nAnswer questions about this business using the business context and the knowledge tools before anything else. Never invent business information that is not present above. If the information is not available, say you do not have that information and offer to connect them with the team.`
    : '';

  const prompt = `You are ${businessName}'s AI Receptionist.

Your job is to warmly welcome callers, understand their needs, answer questions about ${businessName}, help qualified callers book demos, collect the necessary information naturally, and ensure collected information is persisted correctly.

Every new call MUST begin with a warm ${businessName} greeting. Never begin a new call by immediately requesting personal information such as name, company, phone number, email, or fleet size. Greet the caller warmly first and ask how you can help, then let them explain why they called.

Listen to the caller. If the caller interrupts you, stop speaking immediately and respond naturally to what they said. Never repeat the greeting after the call has started.

Speak naturally, 1-2 short sentences. Ask one question at a time. Be conversational, concise, professional, warm, and helpful.

Use retrieve_knowledge for product/pricing/feature questions before answering.

For a general question, answer the caller's question directly and then ask if there is anything else they need. Do not collect personal or business details unless they are needed for an action such as booking a demo.

When the caller wants to book a demo:
1. Confirm they want to book a demo.
2. Collect the required details one at a time, conversationally: full name, company name, email, phone number, fleet size (number of vehicles), preferred demo date/time, and timezone. Never ask all of them in one robotic block.
3. When all details are collected, read the full details back to the caller and ask for their explicit confirmation before calling create_appointment.

Never call create_appointment until the caller has explicitly confirmed the full details. Do not silently create appointments.

After a tool succeeds, confirm the outcome to the caller in plain words, e.g. "You're all set, your demo is scheduled." If a tool returns missing_fields or an error, ask the caller for the missing details.

At the end of a successful conversation, politely say goodbye before the call ends.

Never invent ${businessName} features, pricing, availability, appointments, or customer information.

${toolsIntro}${memorySection}${businessSection}`;

  if (!memoryContext && !businessContext) {
    BASE_PROMPT_CACHE.set(cacheKey, prompt);
  }

  return prompt;
}

/**
 * Builds a compact business context string injected into the system prompt.
 * Includes business name, description, products/services, pricing summary,
 * locations, hours, agent personality/goals and custom business context.
 */
export function buildBusinessContext(businessProfile, agentConfig) {
  const parts = [];

  if (agentConfig?.businessContext) parts.push(`Context: ${agentConfig.businessContext}`);
  if (agentConfig?.agentName) parts.push(`Agent name: ${agentConfig.agentName}`);
  if (agentConfig?.personality) parts.push(`Personality: ${agentConfig.personality}`);
  if (agentConfig?.tone) parts.push(`Tone: ${agentConfig.tone}`);
  if (agentConfig?.primaryGoal) parts.push(`Primary goal: ${agentConfig.primaryGoal}`);
  const secondaryGoals = agentConfig?.secondaryGoals;
  if (Array.isArray(secondaryGoals) && secondaryGoals.length > 0) {
    parts.push(`Secondary goals: ${secondaryGoals.join('; ')}`);
  }

  if (businessProfile) {
    if (businessProfile.businessName) parts.push(`Business name: ${businessProfile.businessName}`);
    if (businessProfile.description) parts.push(`About: ${businessProfile.description}`);
    const products = businessProfile.products;
    if (Array.isArray(products) && products.length > 0) {
      parts.push(`Products: ${products.map((p) => (typeof p === 'string' ? p : p?.name)).filter(Boolean).join(', ')}`);
    }
    const services = businessProfile.services;
    if (Array.isArray(services) && services.length > 0) {
      parts.push(`Services: ${services.map((s) => (typeof s === 'string' ? s : s?.name)).filter(Boolean).join(', ')}`);
    }
    const pricing = businessProfile.pricing;
    if (pricing && typeof pricing === 'object') {
      const entries = Object.entries(pricing).filter(([, v]) => v);
      if (entries.length > 0) {
        parts.push(`Pricing summary: ${entries.map(([k, v]) => `${k}: ${v}`).join(', ')}`);
      }
    }
    const locations = businessProfile.locations;
    if (Array.isArray(locations) && locations.length > 0) {
      parts.push(`Locations: ${locations.map((l) => (typeof l === 'string' ? l : [l?.city, l?.address].filter(Boolean).join(', '))).filter(Boolean).join('; ')}`);
    }
    const hours = businessProfile.businessHours;
    if (hours && typeof hours === 'object' && Object.keys(hours).length > 0) {
      parts.push(`Business hours: ${Object.entries(hours).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
    }
    const faqs = businessProfile.faqs;
    if (Array.isArray(faqs) && faqs.length > 0) {
      const faqText = faqs.slice(0, 3).map((f) => (typeof f === 'string' ? f : [f?.question || f?.q, f?.answer || f?.a].filter(Boolean).join(' — '))).filter(Boolean);
      if (faqText.length > 0) parts.push(`FAQs: ${faqText.join(' | ')}`);
    }
  }

  return parts.join('\n');
}

export function buildToolDefinitions(businessToolsEnabled = true) {
  if (!businessToolsEnabled) return [];

  const businessTools = [
    {
      type: 'function',
      name: 'lookup_customer',
      description: 'Look up an existing customer by phone number to personalize the conversation',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Caller phone number in E.164 format' },
        },
      },
    },
    {
      type: 'function',
      name: 'create_appointment',
      description: 'Schedule a meeting or demo appointment for the caller in the FleetNimble CRM. Only call this after the caller has explicitly confirmed all details.',
      parameters: {
        type: 'object',
        properties: {
          callerName: { type: 'string', description: 'Caller full name' },
          companyName: { type: 'string', description: 'Caller company name' },
          fleetSize: { type: 'number', description: 'Number of vehicles in fleet' },
          industry: { type: 'string', description: 'Caller industry (e.g. logistics, construction, food delivery)' },
          email: { type: 'string', description: 'Caller email address' },
          phone: { type: 'string', description: 'Caller phone number' },
          meetingPurpose: { type: 'string', description: 'Purpose of the meeting (e.g. demo, pricing, onboarding)' },
          scheduledDateTime: { type: 'string', description: 'Scheduled date and time in ISO format' },
          timezone: { type: 'string', description: 'Caller timezone (e.g. Asia/Kolkata, America/New_York)' },
          durationMinutes: { type: 'number', description: 'Meeting duration in minutes (default 30)' },
        },
        required: ['callerName', 'meetingPurpose', 'scheduledDateTime'],
      },
    },
    {
      type: 'function',
      name: 'create_support_ticket',
      description: 'Create a support ticket for the caller. Only call this after the caller has explicitly confirmed all details.',
      parameters: {
        type: 'object',
        properties: {
          callerName: { type: 'string', description: 'Caller full name' },
          callerPhone: { type: 'string', description: 'Caller phone number' },
          callerEmail: { type: 'string', description: 'Caller email address' },
          companyName: { type: 'string', description: 'Company name' },
          issueTitle: { type: 'string', description: 'Brief title of the issue (max 200 chars)' },
          issueDescription: { type: 'string', description: 'Detailed description of the issue' },
          urgency: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], description: 'Urgency level' },
          relatedVehicle: { type: 'string', description: 'Vehicle name or plate number if relevant' },
        },
        required: ['callerName', 'issueTitle'],
      },
    },
    {
      type: 'function',
      name: 'save_customer_note',
      description: 'Save a note about the customer conversation',
      parameters: {
        type: 'object',
        properties: {
          customerId: { type: 'string', description: 'Customer ID in the system' },
          content: { type: 'string', description: 'Note content' },
          noteType: { type: 'string', enum: ['GENERAL', 'CALL', 'FOLLOW_UP', 'SYSTEM'], description: 'Type of note' },
        },
        required: ['customerId', 'content'],
      },
    },
    {
      type: 'function',
      name: 'request_human_handoff',
      description: 'Request transfer to a human team member',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Reason for the handoff' },
          department: { type: 'string', enum: ['sales', 'support', 'emergency'], description: 'Department to route to' },
        },
        required: ['reason'],
      },
    },
    {
      type: 'function',
      name: 'end_call',
      description: 'End the call gracefully when the caller indicates they are done',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Reason for ending the call' },
        },
      },
    },
    {
      type: 'function',
      name: 'update_conversation_memory',
      description: 'Store important information about the caller for future conversations. Use this to remember key facts like preferences, decisions, or personal details.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Memory key, e.g. "preferred_contact_time", "interested_in_feature", "caller_preference"' },
          value: { type: 'string', description: 'Memory value, e.g. "Afternoon", "GPS Tracking", "Prefers email contact"' },
        },
        required: ['key', 'value'],
      },
    },
  ];

  const ragTool = [
    {
      type: 'function',
      name: 'retrieve_knowledge',
      description: 'Search the FleetNimble knowledge base for information about products, features, pricing, troubleshooting, and capabilities. Uses semantic retrieval to find the most relevant approved articles. Use this for any factual question about FleetNimble.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query, e.g. "How does GPS tracking work?" or "What are the pricing plans?"' },
        },
        required: ['query'],
      },
    },
  ];

  return [...ragTool, ...businessTools, ...LIVE_TOOL_DEFINITIONS];
}
