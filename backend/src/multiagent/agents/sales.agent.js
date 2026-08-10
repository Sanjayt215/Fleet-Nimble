import { BaseAgent } from './baseAgent.js';
import { buildResponse, successResponse, TASK_STATUS } from '../protocol.js';

const BUYING_SIGNALS = [
  { pattern: /\b(demo|walkthrough|see\s+it\s+in\s+action)\b/i, label: 'demo_request', weight: 3 },
  { pattern: /\b(pricing|quote|cost|how\s+much|rate)\b/i, label: 'pricing_inquiry', weight: 2 },
  { pattern: /\b(fleet\s+size|vehicles?|trucks?)\s*(of|is|we\s+have|about|around)\b/i, label: 'fleet_context', weight: 1.5 },
  { pattern: /\b(budget|roi|return\s+on\s+investment|save\s+money|cut\s+costs)\b/i, label: 'budget_signal', weight: 2.5 },
  { pattern: /\b(compare|comparison|competitor|vs\.?|versus)\b/i, label: 'comparison_signal', weight: 1.5 },
  { pattern: /\b(decision|approve|sign\s+off|procurement|purchase\s+order)\b/i, label: 'decision_maker', weight: 2 },
  { pattern: /\b(upgrade|expand|growing|adding)\b/i, label: 'growth_signal', weight: 1.5 },
  { pattern: /\b(soon|asap|this\s+month|next\s+month|right\s+away)\b/i, label: 'timeline_signal', weight: 1.5 },
];

const DEMO_TEMPLATES = [
  { key: 'morning', time: '10:00', text: '10 AM' },
  { key: 'afternoon', time: '14:00', text: '2 PM' },
];

export class SalesAgent extends BaseAgent {
  constructor({ memory = null, health = null, deps = null } = {}) {
    super({ id: 'sales', memory, health });
  }

  async run(task, context) {
    const { type, payload } = task.task;

    switch (type) {
      case 'qualify':
        return this._qualify(task, payload);
      case 'composePricing':
        return this._composePricing(task, payload);
      case 'proposeDemoSlots':
        return this._proposeDemoSlots(task, payload);
      default:
        return buildResponse({
          task,
          status: TASK_STATUS.FAILED,
          error: new Error(`sales agent does not support task type "${type}"`),
          confidence: 0,
        });
    }
  }

  _qualify(task, payload) {
    const text = String(payload.text || '').trim();
    const signals = [];
    let score = 0;
    for (const entry of BUYING_SIGNALS) {
      if (entry.pattern.test(text)) {
        signals.push(entry.label);
        score += entry.weight;
      }
    }

    const qualified = score >= 2;
    const stage = qualified ? 'QUALIFIED' : 'LEAD';
    const urgency = signals.includes('timeline_signal') ? 'HIGH' : score >= 4 ? 'MEDIUM' : 'LOW';

    if (this.memory) {
      this.memory.set('sales', 'businessIntelligence', 'buyingSignals', signals);
      this.memory.set('sales', 'businessIntelligence', 'buyingStage', stage);
      this.memory.set('sales', 'lead', 'qualified', qualified);
      this.memory.set('sales', 'lead', 'stage', stage);
    }

    return successResponse(task, { qualified, signals, score, stage, urgency }, {
      confidence: Math.min(1, 0.4 + score * 0.1),
      cost: { dbQueries: 0, cacheHits: 0 },
    });
  }

  _composePricing(task, payload) {
    const fleetSize = Number(payload.fleetSize || this.memory?.get('identity', 'fleetSize') || 0);
    const tier = fleetSize >= 50 ? 'enterprise' : fleetSize >= 10 ? 'medium' : 'small';

    let priceLine = 'FleetNimble pricing depends on your fleet size and the features you need.';
    if (tier === 'small') {
      priceLine = 'For small fleets, our plans are designed to be cost-effective while covering GPS tracking, live diagnostics, maintenance, alerts, and analytics.';
    } else if (tier === 'medium') {
      priceLine = 'For medium fleets, our plans bundle GPS tracking, live diagnostics, maintenance management, alerts, and analytics with volume pricing per vehicle.';
    } else {
      priceLine = 'For enterprise fleets of 50+ vehicles, we offer custom plans with API access, white-label options, and dedicated support.';
    }

    const knowledgeAnswer = payload.knowledgeAnswer;
    const reply = knowledgeAnswer && knowledgeAnswer.trim().length > 20
      ? `${knowledgeAnswer} Based on your fleet of ${fleetSize || 'approximately'} vehicle(s), ${priceLine.toLowerCase()}`
      : `${priceLine} I can schedule a demo so our team can share a tailored quote.`;

    if (this.memory) {
      this.memory.set('sales', 'lead', 'score', Math.min(100, 30 + Math.min(fleetSize, 50)));
    }

    return successResponse(task, { reply, tier, fleetSize }, {
      confidence: 0.8,
      cost: { dbQueries: 0, cacheHits: 0 },
    });
  }

  _proposeDemoSlots(task, payload) {
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    if (candidates.length === 0) {
      return successResponse(task, { slots: [], reply: null }, { confidence: 0.3 });
    }

    const preference = String(payload.preference || '').toLowerCase();
    const slots = [];
    for (const template of DEMO_TEMPLATES) {
      const match = candidates.find(candidate => candidate.time?.toLowerCase().includes(template.time));
      if (match) slots.push({ time: template.text, candidate: match });
      if (slots.length >= 2) break;
    }
    if (slots.length < 2) {
      const fallback = candidates.slice(0, 2 - slots.length);
      for (const candidate of fallback) {
        slots.push({ time: candidate.time, candidate });
      }
    }
    if (slots.length === 0) {
      return successResponse(task, { slots: [], reply: null }, { confidence: 0.2 });
    }

    const reply = `I can schedule a demo — does ${slots[0].time} or ${slots[1]?.time || slots[0].time} work better for you?`;
    return successResponse(task, { slots, reply }, { confidence: 0.85 });
  }
}
