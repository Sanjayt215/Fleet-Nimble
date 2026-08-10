import { BaseAgent } from './baseAgent.js';
import { buildResponse, successResponse, TASK_STATUS, INTENTS } from '../protocol.js';
import { classifyIntent } from '../intents.js';
import logger from '../../utils/logger.js';

const DEFAULT_GREETING = 'Hello! Thank you for calling FleetNimble. How can I assist you today?';

function afterHoursMessage(workingHours) {
  try {
    const hours = workingHours || {};
    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'lowercase' });
    const slot = hours[day];
    if (!slot || !slot.start) return null;
    const minutes = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = String(slot.start).split(':').map(Number);
    const [eh, em] = String(slot.end).split(':').map(Number);
    if (minutes < sh * 60 + sm || minutes > eh * 60 + em) {
      return 'Thank you for calling. Our business hours are Monday to Friday, 9 AM to 5 PM. Please leave a message and we will get back to you.';
    }
  } catch {
    return null;
  }
  return null;
}

export class ReceptionistAgent extends BaseAgent {
  constructor({ memory = null, health = null, deps = null } = {}) {
    super({ id: 'receptionist', memory, health });
  }

  async run(task, context) {
    const { type, payload } = task.task;

    switch (type) {
      case 'classify':
        return this._classify(task, payload);
      case 'greeting':
        return this._greeting(task, payload);
      case 'composeReply':
        return this._composeReply(task, payload);
      default:
        return buildResponse({
          task,
          status: TASK_STATUS.FAILED,
          error: new Error(`receptionist agent does not support task type "${type}"`),
          confidence: 0,
        });
    }
  }

  _classify(task, payload) {
    const classification = classifyIntent(payload.text || '');
    if (this.memory) {
      const conversation = this.memory.get('conversation') || {};
      this.memory.set('receptionist', 'conversation', {
        ...conversation,
        previousState: conversation.state,
        state: 'INTENT',
        intent: classification.intent,
      });
    }
    return successResponse(task, classification, { confidence: classification.confidence });
  }

  _greeting(task, payload) {
    const afterHours = afterHoursMessage(payload.workingHours);
    const reply = afterHours || payload.greetingMessage || DEFAULT_GREETING;
    return successResponse(task, { reply, afterHours: Boolean(afterHours) }, { confidence: 1 });
  }

  _composeReply(task, payload) {
    const intent = payload.intent || INTENTS.UNKNOWN;
    const merged = payload.merged || {};
    const reply = this._buildReply(intent, payload, merged);
    if (this.memory) {
      this.memory.set('receptionist', 'conversation', {
        ...(this.memory.get('conversation') || {}),
        state: 'RESPONDING',
        intent,
      });
    }
    return successResponse(task, { reply, intent }, {
      confidence: Math.min(1, (merged.confidence || 0.5) + 0.2),
      artifacts: { fromAgents: Object.keys(merged.agents || {}) },
    });
  }

  _buildReply(intent, payload, merged) {
    const agents = merged.agents || {};
    const resultOf = (id) => {
      const entry = agents[id];
      if (entry?.result) return entry.result;
      return merged[id]?.result || merged[id] || null;
    };
    const knowledge = resultOf('knowledge');
    const sales = resultOf('sales');
    const scheduling = resultOf('scheduling');
    const support = resultOf('support');
    const fleet = resultOf('fleetExpert');
    const crm = resultOf('crm');

    switch (intent) {
      case INTENTS.EMERGENCY: {
        const supportPhone = payload.config?.escalationPhone || payload.supportPhone;
        const base = "I'm sorry, that sounds urgent. Let me escalate this right away to our team so they can help immediately.";
        return supportPhone ? `${base} You can also reach us directly at ${supportPhone}.` : base;
      }
      case INTENTS.SCHEDULE_MEETING: {
        const parsed = scheduling?.parsed ?? scheduling ?? null;
        if (parsed?.requiresClarification) {
          const dateText = parsed.preferredDate
            ? `on ${new Date(parsed.preferredDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
            : 'what date works best for you';
          const timeText = parsed.preferredTime ? ` at ${parsed.preferredTime}` : ' and at what time';
          return `I'd be happy to schedule that. Just to confirm — ${dateText}${timeText}. Does that work for you?`;
        }
        if (parsed?.preferredDate || parsed?.scheduledDateTimeLocal) {
          const when = parsed.scheduledDateTimeLocal
            || `${parsed.preferredDate}${parsed.preferredTime ? ` at ${parsed.preferredTime}` : ''}`;
          return `Great — I've got your demo scheduled for ${when}. Shall I go ahead and book it?`;
        }
        if (scheduling?.summary) {
          return `${scheduling.summary} I'll get that confirmed for you right away.`;
        }
        if (sales?.reply) return sales.reply;
        return "Of course! I can schedule a demo for you. Could you tell me your name, company, and a preferred date and time?";
      }
      case INTENTS.SUPPORT_REQUEST:
      case INTENTS.TECHNICAL_ISSUE: {
        if (support?.created && support.ticket?.id) {
          return `I've created a support ticket for you (${support.ticket.id.slice(0, 8)}). Our team will follow up with you shortly. Is there anything else I can help with?`;
        }
        if (support?.urgency) {
          return `I'm sorry you're experiencing that. I've noted it as ${support.urgency.toLowerCase()} priority and our support team will reach out. Can you describe the issue in a bit more detail?`;
        }
        return "I'm sorry to hear that. Please tell me more about the issue and our support team will take care of it.";
      }
      case INTENTS.PRICING_QUESTION: {
        if (sales?.reply) return sales.reply;
        if (knowledge?.answer) return `${knowledge.answer} I can also schedule a demo so our team can share a tailored quote.`;
        return "FleetNimble offers flexible pricing plans based on fleet size. I can schedule a demo and our sales team will share a tailored quote.";
      }
      case INTENTS.FLEET_QUESTION: {
        if (fleet?.answer) return fleet.answer;
        if (knowledge?.answer) return knowledge.answer;
        return "That's a great question about your fleet. Let me have our fleet specialist follow up with more details.";
      }
      case INTENTS.PRODUCT_QUESTION:
      case INTENTS.GENERAL_QUESTION: {
        if (knowledge?.answer) return knowledge.answer;
        if (fleet?.answer) return fleet.answer;
        return "Let me check that for you — one moment please.";
      }
      case INTENTS.SALES_INTEREST: {
        if (sales?.reply) return sales.reply;
        if (knowledge?.answer) return knowledge.answer;
        return "We'd love to help you explore FleetNimble. Would you like to schedule a demo to see it in action?";
      }
      case INTENTS.GREETING:
        return payload.greetingMessage || DEFAULT_GREETING;
      case INTENTS.UNKNOWN:
      default:
        return "I'm sorry, I didn't catch that. Could you repeat what you'd like help with?";
    }
  }
}
