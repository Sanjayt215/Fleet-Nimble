import { config } from '../config/index.js';

const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

export function mapToOpenAIVoice(voiceId) {
  if (OPENAI_VOICES.includes(voiceId?.toLowerCase())) {
    return voiceId.toLowerCase();
  }
  return config.openai.voice || 'alloy';
}

export function buildSystemPrompt(config, memoryContext = '') {
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const prompt = `You are ${config.businessName || 'FleetNimble'}'s AI receptionist. Your name is FleetNimble Assistant.

${timeGreeting}! You are handling a phone call.

INSTRUCTIONS:
1. Greet the caller naturally and warmly
2. Detect the caller's language and respond in the same language if possible
3. Collect caller details: name, phone, company, fleet size
4. Determine intent:
   - schedule_meeting / book_demo
   - support_request
   - pricing_question
   - onboarding_help
   - emergency_escalation
   - general_question
5. Before taking any action, ask for confirmation
6. Handle interruptions gracefully - let the caller finish speaking
7. If the caller asks for a human, or if you detect anger/emergency/confusion, offer to transfer to a team member
8. If there is silence for more than 5 seconds, prompt the caller gently
9. End the call politely after completing the task
10. Keep responses concise and conversational - this is a phone call

CONFIRMATION FLOW:
- After collecting enough details, summarize what the caller wants
- Ask "Shall I go ahead with that?"
- Wait for explicit confirmation before creating appointments or tickets

ESCALATION TRIGGERS:
- Caller explicitly asks to speak to a human
- Caller sounds angry or frustrated
- Emergency situation detected
- AI confidence is low on the intent

${memoryContext ? `CALLER CONTEXT:\n${memoryContext}\n\nUse this context to personalize the conversation.` : ''}

Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
Current time is ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}.

IMPORTANT: Respond conversationally as if on a phone call. Use natural speech patterns. Ask one question at a time.`;

  return prompt;
}

export function buildToolDefinitions() {
  return [
    {
      type: 'function',
      name: 'schedule_appointment',
      description: 'Schedule a meeting or demo appointment for the caller',
      parameters: {
        type: 'object',
        properties: {
          callerName: { type: 'string', description: 'Caller full name' },
          callerPhone: { type: 'string', description: 'Caller phone number' },
          callerEmail: { type: 'string', description: 'Caller email address' },
          companyName: { type: 'string', description: 'Caller company name' },
          fleetSize: { type: 'number', description: 'Number of vehicles in fleet' },
          meetingPurpose: { type: 'string', description: 'Purpose of the meeting' },
          preferredDate: { type: 'string', description: 'Preferred date (ISO format)' },
          preferredTime: { type: 'string', description: 'Preferred time' },
        },
        required: ['callerName', 'meetingPurpose'],
      },
    },
    {
      type: 'function',
      name: 'create_support_ticket',
      description: 'Create a support ticket for the caller',
      parameters: {
        type: 'object',
        properties: {
          callerName: { type: 'string', description: 'Caller full name' },
          callerPhone: { type: 'string', description: 'Caller phone number' },
          callerEmail: { type: 'string', description: 'Caller email' },
          companyName: { type: 'string', description: 'Company name' },
          issueTitle: { type: 'string', description: 'Brief title of the issue' },
          issueDescription: { type: 'string', description: 'Detailed description of the issue' },
          urgency: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
        },
        required: ['callerName', 'issueTitle'],
      },
    },
    {
      type: 'function',
      name: 'lookup_customer',
      description: 'Look up an existing customer by phone or email',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Phone number to look up' },
          email: { type: 'string', description: 'Email to look up' },
        },
      },
    },
    {
      type: 'function',
      name: 'escalate_to_human',
      description: 'Transfer the call to a human team member',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Reason for escalation' },
          department: { type: 'string', enum: ['sales', 'support', 'emergency'] },
        },
        required: ['reason'],
      },
    },
  ];
}