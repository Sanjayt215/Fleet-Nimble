import logger from '../utils/logger.js';

/**
 * Fleet Brain AI Skills registry.
 * Skills plug in through this registry — the core (planner, decision engine,
 * context engine) reads capabilities from here and never needs to change when
 * a new skill is added.
 */

const SKILL_DEFINITIONS = {
  'fleet-assistant': {
    id: 'fleet-assistant',
    name: 'Fleet Assistant',
    description: 'Answers fleet questions: maintenance, drivers, trips, fuel, GPS, alerts, telemetry, KPIs.',
    intents: ['FLEET_QUERY', 'MAINTENANCE_QUERY', 'DRIVER_QUERY', 'FUEL_QUERY', 'ALERT_QUERY', 'TRIP_QUERY', 'TELEMETRY_QUERY'],
    contextRequirements: ['fleet', 'company'],
    memorySections: ['fleet'],
    tools: ['search_knowledge', 'query_fleet', 'lookup_crm'],
    plannerHints: { goal: 'Resolve the fleet question with current fleet data', risk: 'LOW' },
  },
  receptionist: {
    id: 'receptionist',
    name: 'AI Receptionist',
    description: 'Handles inbound calls: greeting, intent triage, appointment scheduling, CRM updates, escalation.',
    intents: ['GREETING', 'SCHEDULE_MEETING', 'PRICING_QUESTION', 'SALES_INTEREST', 'SUPPORT_REQUEST', 'TECHNICAL_ISSUE', 'LEAD_QUALIFICATION'],
    contextRequirements: ['conversation', 'crm', 'customer', 'company'],
    memorySections: ['conversation', 'customer', 'crm'],
    tools: ['search_knowledge', 'lookup_crm', 'create_appointment', 'create_ticket', 'update_crm', 'transfer_to_human', 'schedule_follow_up'],
    plannerHints: { goal: 'Serve the caller: understand intent, answer, and take the correct business action', risk: 'MEDIUM' },
  },
  sales: {
    id: 'sales',
    name: 'Sales Agent',
    description: 'Overcomes objections, books demos, schedules follow-ups and moves leads through the pipeline.',
    intents: ['OBJECTION_HANDLING'],
    contextRequirements: ['conversation', 'crm', 'sales', 'customer', 'company'],
    memorySections: ['customer', 'sales', 'crm'],
    tools: ['search_knowledge', 'lookup_crm', 'create_appointment', 'update_crm', 'schedule_follow_up', 'run_analytics'],
    plannerHints: { goal: 'Move the lead toward a booked demo', risk: 'MEDIUM' },
  },
  support: {
    id: 'support',
    name: 'Support Agent',
    description: 'Resolves support requests, diagnoses technical issues, creates tickets, escalates when needed.',
    intents: ['COMPLAINT'],
    contextRequirements: ['conversation', 'crm', 'support', 'customer'],
    memorySections: ['customer', 'crm'],
    tools: ['search_knowledge', 'lookup_crm', 'create_ticket', 'transfer_to_human'],
    plannerHints: { goal: 'Resolve the customer issue or route it to a human', risk: 'HIGH' },
  },
  dispatcher: {
    id: 'dispatcher',
    name: 'Dispatcher',
    description: 'Monitors live fleet state: active vehicles, alerts, telemetry, trips; coordinates responses.',
    intents: ['DISPATCH_ACTION'],
    contextRequirements: ['fleet', 'company'],
    memorySections: ['fleet'],
    tools: ['query_fleet', 'run_analytics', 'search_knowledge'],
    plannerHints: { goal: 'Provide live fleet state and recommended dispatch action', risk: 'LOW' },
  },
  'executive-assistant': {
    id: 'executive-assistant',
    name: 'Executive Assistant',
    description: 'Produces executive insights, forecasts, KPIs, and business summaries for leadership.',
    intents: ['EXECUTIVE_QUERY', 'FORECAST_QUERY', 'KPI_QUERY', 'REPORT_QUERY'],
    contextRequirements: ['company', 'business'],
    memorySections: ['business'],
    tools: ['run_analytics', 'generate_insights', 'search_knowledge'],
    plannerHints: { goal: 'Deliver the requested business insight with accurate KPIs', risk: 'LOW' },
  },
  marketing: {
    id: 'marketing',
    name: 'Marketing Agent',
    description: 'Identifies market signals from conversations: demand, objections, common questions, segments.',
    intents: ['MARKETING_QUERY'],
    contextRequirements: ['business', 'sales'],
    memorySections: ['business', 'sales'],
    tools: ['run_analytics', 'generate_insights', 'search_knowledge'],
    plannerHints: { goal: 'Extract market signal from conversation and call data', risk: 'LOW' },
  },
  crm: {
    id: 'crm',
    name: 'CRM Agent',
    description: 'Maintains customer records, notes, lead scores, sales stages, and follow-up activities.',
    intents: ['CRM_UPDATE'],
    contextRequirements: ['crm', 'customer'],
    memorySections: ['customer', 'crm'],
    tools: ['lookup_crm', 'update_crm', 'create_appointment', 'schedule_follow_up'],
    plannerHints: { goal: 'Keep customer and lead data accurate', risk: 'MEDIUM' },
  },
};

const skills = new Map(Object.entries(SKILL_DEFINITIONS));

export function registerSkill(skill) {
  if (!skill?.id || !skill?.name) {
    logger.warn('SKILL_REGISTRATION_REJECTED', { reason: 'missing_id_or_name' });
    return false;
  }
  skills.set(skill.id, {
    intents: [],
    contextRequirements: [],
    memorySections: [],
    tools: [],
    plannerHints: {},
    ...skill,
  });
  logger.info('SKILL_REGISTERED', { skillId: skill.id });
  return true;
}

export function getSkill(skillId) {
  return skills.get(skillId) || null;
}

export function listSkills() {
  return Array.from(skills.values()).map(({ plannerHints, ...rest }) => ({ ...rest, plannerHints }));
}

export function skillForIntent(intent) {
  for (const skill of skills.values()) {
    if (skill.intents.includes(intent)) return skill;
  }
  return getSkill('fleet-assistant') || null;
}

export function getSkillsForIntents(intents = []) {
  const matched = [];
  for (const intent of intents) {
    const skill = skillForIntent(intent);
    if (skill && !matched.some(s => s.id === skill.id)) matched.push(skill);
  }
  return matched;
}

export function getSkillCount() {
  return skills.size;
}
