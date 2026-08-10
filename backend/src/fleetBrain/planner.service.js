import { skillForIntent, getSkillsForIntents } from './aiSkills.service.js';

/**
 * Fleet Brain Planner.
 * Before any AI response, the planner produces an execution plan:
 * current goal, customer goal, business goal, required tools, required
 * knowledge, missing information, risk, and next action.
 */

const INTENT_GOALS = {
  GREETING: { currentGoal: 'Greet the caller and open the conversation', businessGoal: 'Capture the call intent early', risk: 'LOW' },
  LEAD_QUALIFICATION: { currentGoal: 'Qualify the lead: fleet size, pains, timeline, budget, decision maker', businessGoal: 'Score and route the lead into the pipeline', risk: 'LOW' },
  PRICING_QUESTION: { currentGoal: 'Answer pricing questions with current knowledge', businessGoal: 'Protect price anchoring and drive to a demo', risk: 'MEDIUM' },
  SALES_INTEREST: { currentGoal: 'Understand interest and move toward a demo booking', businessGoal: 'Convert interest into a scheduled meeting', risk: 'MEDIUM' },
  SCHEDULE_MEETING: { currentGoal: 'Find a slot and book the meeting', businessGoal: 'Create a confirmed appointment with follow-up', risk: 'MEDIUM' },
  SUPPORT_REQUEST: { currentGoal: 'Understand the support issue', businessGoal: 'Resolve or ticket the issue with correct routing', risk: 'HIGH' },
  TECHNICAL_ISSUE: { currentGoal: 'Diagnose the technical issue', businessGoal: 'Resolve or ticket with severity + escalation', risk: 'HIGH' },
  COMPLAINT: { currentGoal: 'De-escalate and capture the complaint', businessGoal: 'Log the complaint and route to a human', risk: 'HIGH' },
  FLEET_QUERY: { currentGoal: 'Answer the fleet question from live data', businessGoal: 'Demonstrate fleet value and readiness', risk: 'LOW' },
  MAINTENANCE_QUERY: { currentGoal: 'Report maintenance status per vehicle', businessGoal: 'Drive proactive maintenance awareness', risk: 'LOW' },
  DRIVER_QUERY: { currentGoal: 'Report driver behavior from alerts and trips', businessGoal: 'Surface safety issues', risk: 'LOW' },
  FUEL_QUERY: { currentGoal: 'Report fuel usage and cost', businessGoal: 'Surface fuel optimization opportunities', risk: 'LOW' },
  ALERT_QUERY: { currentGoal: 'Report active alerts', businessGoal: 'Enable quick response', risk: 'MEDIUM' },
  TRIP_QUERY: { currentGoal: 'Report trip activity', businessGoal: 'Show operational activity', risk: 'LOW' },
  TELEMETRY_QUERY: { currentGoal: 'Report live telemetry', businessGoal: 'Confirm live monitoring works', risk: 'LOW' },
  EXECUTIVE_QUERY: { currentGoal: 'Deliver the requested business insight', businessGoal: 'Inform leadership decisions', risk: 'LOW' },
  FORECAST_QUERY: { currentGoal: 'Deliver the requested forecast', businessGoal: 'Set expectations for pipeline and revenue', risk: 'LOW' },
  KPI_QUERY: { currentGoal: 'Report requested KPIs', businessGoal: 'Track performance against targets', risk: 'LOW' },
  CRM_UPDATE: { currentGoal: 'Update customer data', businessGoal: 'Keep CRM accurate', risk: 'MEDIUM' },
  DISPATCH_ACTION: { currentGoal: 'Recommend dispatch action from live state', businessGoal: 'Optimize field operations', risk: 'MEDIUM' },
  UNKNOWN: { currentGoal: 'Clarify the caller intent', businessGoal: 'Route to the right skill', risk: 'LOW' },
};

const TOOL_BY_INTENT = {
  GREETING: ['search_knowledge'],
  LEAD_QUALIFICATION: ['lookup_crm', 'update_crm', 'search_knowledge'],
  PRICING_QUESTION: ['search_knowledge', 'lookup_crm', 'update_crm'],
  SALES_INTEREST: ['search_knowledge', 'lookup_crm', 'update_crm', 'schedule_follow_up'],
  SCHEDULE_MEETING: ['lookup_crm', 'create_appointment', 'update_crm', 'schedule_follow_up'],
  SUPPORT_REQUEST: ['search_knowledge', 'lookup_crm', 'create_ticket'],
  TECHNICAL_ISSUE: ['search_knowledge', 'lookup_crm', 'create_ticket', 'transfer_to_human'],
  COMPLAINT: ['lookup_crm', 'create_ticket', 'transfer_to_human'],
  FLEET_QUERY: ['query_fleet', 'search_knowledge'],
  MAINTENANCE_QUERY: ['query_fleet', 'run_analytics'],
  DRIVER_QUERY: ['query_fleet', 'run_analytics'],
  FUEL_QUERY: ['query_fleet', 'run_analytics'],
  ALERT_QUERY: ['query_fleet'],
  TRIP_QUERY: ['query_fleet'],
  TELEMETRY_QUERY: ['query_fleet'],
  EXECUTIVE_QUERY: ['run_analytics', 'generate_insights'],
  FORECAST_QUERY: ['run_analytics', 'generate_insights'],
  KPI_QUERY: ['run_analytics'],
  CRM_UPDATE: ['lookup_crm', 'update_crm'],
  DISPATCH_ACTION: ['query_fleet', 'run_analytics'],
  UNKNOWN: ['search_knowledge'],
};

const KNOWLEDGE_NEEDS = {
  PRICING_QUESTION: ['pricing', 'plans', 'comparison'],
  SALES_INTEREST: ['product', 'features', 'use_cases'],
  SCHEDULE_MEETING: ['availability', 'demo_process'],
  SUPPORT_REQUEST: ['support', 'troubleshooting'],
  TECHNICAL_ISSUE: ['troubleshooting', 'device', 'integration'],
  FLEET_QUERY: ['fleet', 'capabilities'],
  MAINTENANCE_QUERY: ['maintenance'],
  DEFAULT: ['product'],
};

const MAX_RECENT_PLANS = 200;
const recentPlans = [];

export function buildPlan({ intent = 'UNKNOWN', message = '', context = null, skill = null, customer = null }) {
  const ctx = context || {};
  const effectiveSkill = skill || skillForIntent(intent);
  const goals = INTENT_GOALS[intent] || INTENT_GOALS.UNKNOWN;
  const tools = TOOL_BY_INTENT[intent] || TOOL_BY_INTENT.UNKNOWN;
  const skillTools = (effectiveSkill?.tools || []).filter(t =>
    tools.includes(t) || t === 'search_knowledge'
  );

  const requiredTools = Array.from(new Set([...tools, ...skillTools]));

  const knowledgeNeeds = KNOWLEDGE_NEEDS[intent] || KNOWLEDGE_NEEDS.DEFAULT;
  const requiredKnowledge = knowledgeNeeds.filter(topic =>
    !ctx.knowledgeContext || !ctx.knowledgeContext.coveredTopics || !ctx.knowledgeContext.coveredTopics.includes(topic)
  );

  const missingInformation = [];
  const customerContext = ctx.customerContext || customer || {};
  if (['LEAD_QUALIFICATION', 'SALES_INTEREST', 'PRICING_QUESTION'].includes(intent)) {
    if (!customerContext.fleetSize) missingInformation.push('fleet size');
    if (!customerContext.industry) missingInformation.push('industry');
    if (!customerContext.decisionMaker) missingInformation.push('decision maker');
  }
  if (intent === 'SCHEDULE_MEETING') {
    if (!customerContext.name) missingInformation.push('caller name');
    if (!customerContext.email && !customerContext.phone) missingInformation.push('contact details');
  }
  if (['SUPPORT_REQUEST', 'TECHNICAL_ISSUE'].includes(intent)) {
    if (!ctx.fleet?.vehicleCount) missingInformation.push('vehicle context');
  }

  const nextAction = resolveNextAction({ intent, missingInformation, customerContext, ctx });

  const plan = {
    intent,
    skill: effectiveSkill?.id || null,
    currentGoal: goals.currentGoal,
    customerGoal: customerContext.goal || inferCustomerGoal(intent),
    businessGoal: goals.businessGoal,
    requiredTools,
    requiredKnowledge,
    missingInformation,
    risk: goals.risk || (effectiveSkill?.plannerHints?.risk || 'LOW'),
    nextAction,
    createdPlanAt: new Date().toISOString(),
  };

  recentPlans.unshift(plan);
  if (recentPlans.length > MAX_RECENT_PLANS) recentPlans.length = MAX_RECENT_PLANS;

  return plan;
}

export function getRecentPlans({ userId = null, intent = null, limit = 20 } = {}) {
  let filtered = recentPlans;
  if (intent) filtered = filtered.filter(p => p.intent === intent);
  return filtered.slice(0, limit);
}

function resolveNextAction({ intent, missingInformation, customerContext, ctx }) {
  if (missingInformation.length > 0 && !['GREETING', 'UNKNOWN'].includes(intent)) {
    return `Ask the caller for: ${missingInformation.join(', ')}`;
  }
  if (intent === 'SCHEDULE_MEETING' && !ctx.appointmentContext?.scheduled) {
    return 'Propose a meeting slot and create the appointment';
  }
  if (intent === 'UNKNOWN' || intent === 'GREETING') {
    return 'Greet and ask how the caller can be helped';
  }
  if (['SUPPORT_REQUEST', 'TECHNICAL_ISSUE'].includes(intent)) {
    return 'Answer from knowledge; if unresolved, create a ticket';
  }
  if (customerContext.leadScore != null && customerContext.leadScore >= 60) {
    return 'Book a demo and schedule a follow-up';
  }
  return 'Answer from knowledge and capture the interaction in CRM';
}

function inferCustomerGoal(intent) {
  const map = {
    LEAD_QUALIFICATION: 'Get a solution assessment for their fleet',
    PRICING_QUESTION: 'Understand cost before committing',
    SALES_INTEREST: 'Explore the platform for their fleet',
    SCHEDULE_MEETING: 'Book a demo',
    SUPPORT_REQUEST: 'Get help with an issue',
    TECHNICAL_ISSUE: 'Fix a technical problem',
    FLEET_QUERY: 'Get answers about their fleet',
    EXECUTIVE_QUERY: 'Get business insights',
    DEFAULT: 'Get an accurate, helpful answer',
  };
  return map[intent] || map.DEFAULT;
}
