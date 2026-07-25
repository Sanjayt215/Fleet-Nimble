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
  "Hello. Thank you for calling FleetNimble. I'm the FleetNimble AI Receptionist. How may I help you today?";

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

export function buildSystemPrompt(config, memoryContext = '') {
  const cacheKey = `${config.businessName || 'FleetNimble'}_${config.realtime?.businessToolsEnabled ?? true}`;
  if (BASE_PROMPT_CACHE.has(cacheKey) && !memoryContext) {
    return BASE_PROMPT_CACHE.get(cacheKey);
  }

  const businessToolsEnabled = config.realtime?.businessToolsEnabled ?? true;

  const toolsIntro = businessToolsEnabled
    ? 'Use tools via function calling when needed. Never describe tools to the caller.'
    : 'Business tools disabled. General questions only.';

  const memorySection = memoryContext
    ? `\nCaller: ${memoryContext}`
    : '';

  const prompt = `You are ${config.businessName || 'FleetNimble'}'s AI Receptionist.

Speak naturally, 1-2 sentences. One question at a time. If interrupted, stop.

Use retrieve_knowledge for product/pricing/feature questions before answering.

${toolsIntro}${memorySection}`;

  if (!memoryContext) {
    BASE_PROMPT_CACHE.set(cacheKey, prompt);
  }

  return prompt;
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
