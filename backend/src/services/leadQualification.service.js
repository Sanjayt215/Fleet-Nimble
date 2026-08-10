import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { recordTimelineEvent, TIMELINE_EVENT_TYPES } from './conversationTimeline.service.js';
import { isPersistenceAvailable } from './receptionistTenantResolver.service.js';

export const LEAD_PROFILE_FIELDS = Object.freeze([
  'industry',
  'fleetSize',
  'companyType',
  'painPoints',
  'currentFleetSoftware',
  'budgetRange',
  'buyingTimeline',
  'decisionMaker',
  'urgency',
]);

const INDUSTRY_PATTERNS = [
  { industry: 'Logistics', patterns: [/logistic/i, /deliver/i, /freight/i, /courier/i, /parcel/i] },
  { industry: 'Transportation', patterns: [/transport/i, /shuttle/i, /transit/i] },
  { industry: 'Construction', patterns: [/construct/i, /contractor/i, /building/i, /excavat/i] },
  { industry: 'Agriculture', patterns: [/farm/i, /agricultur/i, /agri/i, /ranch/i] },
  { industry: 'Food & Beverage', patterns: [/restaurant/i, /food/i, /beverage/i, /cater/i, /grocery/i] },
  { industry: 'Delivery', patterns: [/last[- ]mile/i, /delivery (service|fleet)/i] },
  { industry: 'Field Services', patterns: [/field (service|tech)/i, /plumb/i, /electrical/i, /hvac/i] },
  { industry: 'Rental', patterns: [/rental/i, /rent[- ]a[- ]/i] },
  { industry: 'Oil & Gas', patterns: [/oil|gas|petroleum|energy/i] },
  { industry: 'Mining', patterns: [/mining/i, /quarr/i] },
  { industry: 'Retail', patterns: [/retail/i, /store|shop/i] },
  { industry: 'Healthcare', patterns: [/clinic/i, /medical/i, /hospital/i, /healthcare/i] },
  { industry: 'Government', patterns: [/government/i, /municipal/i, /public (works|sector)/i, /city/i] },
  { industry: 'Manufacturing', patterns: [/manufactur/i, /factory/i, /plant/i] },
  { industry: 'Waste Management', patterns: [/waste/i, /recycl/i, /dumpster/i] },
  { industry: 'Towing & Recovery', patterns: [/towing/i, /recovery/i, /tow truck/i] },
];

const PAIN_POINT_PATTERNS = [
  { pain: 'Vehicle tracking visibility', patterns: [/don'?t know where (my|our) (vehicle|truck|fleet)/i, /no visibility/i, /can'?t see (my|our) (vehicle|truck|fleet)/i, /lost (a |our )?vehicle/i] },
  { pain: 'High fuel costs', patterns: [/fuel (cost|consumption|usage)/i, /too much fuel/i, /wasting fuel/i, /fuel (is|are) expensive/i, /gas mileage/i] },
  { pain: 'Maintenance downtime', patterns: [/break.?down/i, /down time|downtime/i, /maintenance (issue|problem|scheduling)/i, /vehicle (keeps|always) (breaking|down)/i, /repair cost/i] },
  { pain: 'Driver behavior concerns', patterns: [/speeding/i, /hard (braking|acceleration)/i, /driver (behavior|safety|performance)/i, /idling/i, /reckless/i] },
  { pain: 'Compliance burden', patterns: [/compliance/i, /regulation/i, /inspection/i, /ifta/i, /dot/i, /electronic logging|elds/i] },
  { pain: 'Theft prevention', patterns: [/stolen/i, /theft/i, /security/i, /recovery after theft/i] },
  { pain: 'Lack of reporting', patterns: [/report/i, /no (data|insight|analytics)/i, /can'?t track (mileage|hours|usage)/i, /paperwork/i, /manual (process|logs|tracking)/i] },
  { pain: 'Poor route efficiency', patterns: [/route (planning|optimization|efficiency)/i, /wasting time (on|in) (route|traffic)/i, /reroute/i] },
  { pain: 'Insurance pressure', patterns: [/insurance (premium|cost|rate)/i, /insurer/i] },
  { pain: 'Fuel theft', patterns: [/fuel (theft|siphoning|siphon)/i, /card (misuse|fraud)/i] },
  { pain: 'Telematics cost concerns', patterns: [/too expensive/i, /cost concern/i, /expensive/i, /budget/i] },
  { pain: 'Fleet growth management', patterns: [/growing (too )?fast/i, /scale (our )?fleet/i, /managing (our )?growing/i, /adding (more )?vehicle/i] },
];

const SOFTWARE_PATTERNS = [
  { software: 'Google Maps', patterns: [/google maps/i] },
  { software: 'Samsara', patterns: [/samsara/i] },
  { software: 'Verizon Connect', patterns: [/verizon connect/i, /verizon/i] },
  { software: 'Geotab', patterns: [/geotab/i] },
  { software: 'Motiv', patterns: [/motiv/i] },
  { software: 'Azuga', patterns: [/azuga/i] },
  { software: 'GPS Insight', patterns: [/gps insight/i] },
  { software: 'Spireon', patterns: [/spireon/i] },
  { software: 'Track Your Truck', patterns: [/track your truck/i] },
  { software: 'Teletrac Navman', patterns: [/teletrac/i] },
  { software: 'Lytx', patterns: [/lytx/i] },
  { software: 'Fleet Complete', patterns: [/fleet complete/i] },
  { software: 'Motive', patterns: [/motive/i] },
  { software: 'Excel / spreadsheets', patterns: [/excel/i, /spreadsheet/i] },
  { software: 'Paper logs', patterns: [/paper (log|records?|system)/i] },
  { software: 'Own in-house system', patterns: [/in[- ]house/i, /our own (system|software|app)/i] },
];

const BUDGET_PATTERNS = [
  { budget: 'under $50/month per vehicle', patterns: [/under \$?50/i, /less than \$?50/i, /below \$?50/i] },
  { budget: '$50–$100/month per vehicle', patterns: [/\$?50[-–]?\s?to?\s?\$?100/i, /between \$?50 (and|to) \$?100/i, /around \$?75/i] },
  { budget: '$100–$200/month per vehicle', patterns: [/\$?100[-–]?\s?to?\s?\$?200/i, /between \$?100 (and|to) \$?200/i, /around \$?150/i] },
  { budget: 'over $200/month per vehicle', patterns: [/over \$?200/i, /more than \$?200/i, /above \$?200/i] },
  { budget: 'Flexible / to be discussed', patterns: [/flexible/i, /open (to discussion|to anything)/i, /not sure yet/i, /depends/i] },
];

const TIMELINE_PATTERNS = [
  { timeline: 'immediately', patterns: [/right away/i, /asap|as soon as possible/i, /immediately/i, /this week/i, /today/i, /now/i] },
  { timeline: 'within 30 days', patterns: [/within (a )?month/i, /next month/i, /within (the )?next 30/i, /end of (the )?month/i] },
  { timeline: 'within 90 days', patterns: [/quarter/i, /within (the )?next (two|2|few) months?/i, /by (the )?summer/i, /within 60/i, /within 90/i] },
  { timeline: 'next 6 months', patterns: [/six months/i, /next (year|quarter)/i, /6 months/i] },
  { timeline: 'evaluating options', patterns: [/just (looking|exploring|researching|evaluating)/i, /comparison/i, /shopping around/i, /still deciding/i] },
];

const DECISION_MAKER_PATTERNS = [
  { role: 'Owner / Founder', patterns: [/i (own|run) (the|a|my)?\s*(company|business|fleet)/i, /i'?m (the |an )?owner/i, /i (am|'?m) the (founder|boss)/i, /my (company|business)/i] },
  { role: 'Fleet Manager', patterns: [/fleet manager/i, /i manage (the|our) fleet/i, /i'?m (the )?fleet (manager|coordinator)/i, /i handle (the|our) fleet/i] },
  { role: 'Operations Manager', patterns: [/operations (manager|director)/i, /i run (the )?operations/i, /ops (manager|team)/i] },
  { role: 'Procurement / Purchasing', patterns: [/procurement/i, /purchasing/i, /i buy/i] },
  { role: 'CFO / Finance', patterns: [/cfo|finance (director|manager|team)/i, /i'?m (the )?cfo/i, /accounting/i] },
  { role: 'Dispatch Manager', patterns: [/dispatcher/i, /dispatch manager/i, /i dispatch/i] },
  { role: 'Owner-Operator (single vehicle)', patterns: [/i (drive|am) (a|an) (owner[- ]operator|trucker|driver)/i, /just me/i, /single vehicle/i, /one truck/i] },
];

const URGENCY_PATTERNS = [
  { urgency: 'CRITICAL', patterns: [/urgent/i, /emergency/i, /immediately/i, /right now/i, /asap/i, /can'?t wait/i] },
  { urgency: 'HIGH', patterns: [/as soon as possible/i, /soon/i, /quickly/i, /time sensitive/i, /losing (money|time)/i, /downtime is killing/i] },
  { urgency: 'MEDIUM', patterns: [/next (month|quarter)/i, /within (a )?month/i, /soon/] },
  { urgency: 'LOW', patterns: [/just (looking|exploring)/i, /not urgent/i, /sometime/i, /researching/i] },
];

function countMatches(text, entries) {
  let best = null;
  let bestCount = 0;
  for (const entry of entries) {
    const hits = entry.patterns.filter(p => p.test(text)).length;
    if (hits > bestCount) {
      best = entry;
      bestCount = hits;
    }
  }
  return best || null;
}

function extractFleetSize(text, existing) {
  if (existing != null) return parseInt(existing, 10) || null;
  const match = text.match(/(\d{1,4})\s*(?:vehicle|truck|van|car|bus|unit|asset)s?/i)
    || text.match(/(?:fleet|about|around|roughly|have|operate|manage)\s*(?:of|about|around)?\s*(\d{1,4})/i);
  return match ? parseInt(match[1], 10) : null;
}

function scoreForFleetSize(fleetSize) {
  if (fleetSize == null) return 0;
  if (fleetSize >= 100) return 25;
  if (fleetSize >= 50) return 20;
  if (fleetSize >= 20) return 16;
  if (fleetSize >= 10) return 12;
  if (fleetSize >= 5) return 8;
  return 5;
}

export function qualifyLeadFromText({ text = '', collectedData = {}, customer = null, salesArtifacts = null }) {
  const transcriptText = `${text} ${Object.values(collectedData || {}).filter(v => typeof v === 'string').join(' ')}`;

  const industryMatch = countMatches(transcriptText, INDUSTRY_PATTERNS);
  const painMatch = countMatches(transcriptText, PAIN_POINT_PATTERNS);
  const softwareMatch = countMatches(transcriptText, SOFTWARE_PATTERNS);
  const budgetMatch = countMatches(transcriptText, BUDGET_PATTERNS);
  const timelineMatch = countMatches(transcriptText, TIMELINE_PATTERNS);
  const decisionMatch = countMatches(transcriptText, DECISION_MAKER_PATTERNS);
  const urgencyMatch = countMatches(transcriptText, URGENCY_PATTERNS);

  const fleetSize = extractFleetSize(transcriptText, collectedData?.fleetSize ?? customer?.fleetSize);

  const painPoints = [];
  for (const entry of PAIN_POINT_PATTERNS) {
    if (entry.patterns.some(p => p.test(transcriptText))) painPoints.push(entry.pain);
  }

  const companyType = fleetSize == null ? null
    : fleetSize >= 50 ? 'Enterprise'
    : fleetSize >= 10 ? 'Mid-Market'
    : 'SMB';

  const profile = {
    industry: industryMatch?.industry || customer?.metadata?.leadProfile?.industry || null,
    fleetSize: fleetSize ?? customer?.fleetSize ?? null,
    companyType: companyType || customer?.metadata?.leadProfile?.companyType || null,
    painPoints: painPoints.length > 0 ? painPoints : (customer?.metadata?.leadProfile?.painPoints || []),
    currentFleetSoftware: softwareMatch?.software || customer?.metadata?.leadProfile?.currentFleetSoftware || null,
    budgetRange: budgetMatch?.budget || customer?.metadata?.leadProfile?.budgetRange || null,
    buyingTimeline: timelineMatch?.timeline || customer?.metadata?.leadProfile?.buyingTimeline || null,
    decisionMaker: decisionMatch?.role || customer?.metadata?.leadProfile?.decisionMaker || null,
    urgency: urgencyMatch?.urgency || customer?.metadata?.leadProfile?.urgency || 'MEDIUM',
  };

  if (salesArtifacts) {
    profile.leadScore = salesArtifacts.leadScore;
    profile.buyingSignals = salesArtifacts.buyingSignals || [];
    profile.qualified = salesArtifacts.qualified ?? null;
  }

  profile.leadScore = computeLeadScore(profile);

  return profile;
}

export function computeLeadScore(profile = {}) {
  let score = 0;
  if (profile.industry) score += 8;
  if (profile.companyType) score += 5;
  score += scoreForFleetSize(profile.fleetSize);
  if (Array.isArray(profile.painPoints) && profile.painPoints.length > 0) score += Math.min(profile.painPoints.length * 4, 12);
  if (profile.currentFleetSoftware && profile.currentFleetSoftware !== 'None') score += 6;
  if (profile.budgetRange) score += 8;
  if (profile.buyingTimeline) {
    if (['immediately', 'within 30 days'].includes(profile.buyingTimeline)) score += 12;
    else if (profile.buyingTimeline === 'within 90 days') score += 8;
    else if (profile.buyingTimeline === 'next 6 months') score += 4;
    else score += 2;
  }
  if (profile.decisionMaker) score += 10;
  if (profile.urgency === 'CRITICAL') score += 10;
  else if (profile.urgency === 'HIGH') score += 7;
  else if (profile.urgency === 'MEDIUM') score += 4;
  if (Array.isArray(profile.buyingSignals) && profile.buyingSignals.length > 0) score += Math.min(profile.buyingSignals.length * 3, 9);
  return Math.min(Math.max(Math.round(score), 0), 100);
}

export function salesStageFromScore(leadScore) {
  if (leadScore >= 80) return 'QUALIFIED';
  if (leadScore >= 60) return 'LEAD';
  return 'LEAD';
}

export async function persistLeadProfile({ userId, customerId, callId = null, callSid = null, profile }) {
  if (!customerId) return null;
  try {
    const existing = await prisma.receptionistCustomer.findUnique({
      where: { id: customerId },
      select: { id: true, metadata: true },
    });
    if (!existing) return null;

    const metadata = (existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {});
    metadata.leadProfile = {
      ...(metadata.leadProfile || {}),
      ...profile,
      updatedAt: new Date().toISOString(),
    };

    const customer = await prisma.receptionistCustomer.update({
      where: { id: customerId },
      data: {
        metadata,
        leadScore: profile.leadScore ?? existing.leadScore ?? 0,
        salesStage: salesStageFromScore(profile.leadScore ?? 0),
        fleetSize: profile.fleetSize ?? undefined,
        ...(profile.industry ? { tags: Array.from(new Set([...(existing.tags || []), profile.industry])) } : {}),
      },
    });

    logger.info('LEAD_QUALIFIED', { customerId, leadScore: profile.leadScore, callId });

    if (callId) {
      await recordTimelineEvent({
        userId,
        callId,
        callSid,
        eventType: TIMELINE_EVENT_TYPES.LEAD_QUALIFIED,
        data: { leadScore: profile.leadScore, industry: profile.industry, fleetSize: profile.fleetSize, urgency: profile.urgency },
      });
    }

    return customer;
  } catch (err) {
    logger.warn('LEAD_PROFILE_PERSIST_FAILED', { customerId, error: err.message });
    return null;
  }
}

export async function getLeadProfiles(userId, { status = null, minScore = 0, limit = 50 } = {}) {
  if (!isPersistenceAvailable()) return [];
  try {
    const where = { userId, leadScore: { gte: minScore } };
    if (status) where.status = status;
    const customers = await prisma.receptionistCustomer.findMany({
      where,
      orderBy: { leadScore: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        companyName: true,
        phone: true,
        email: true,
        fleetSize: true,
        status: true,
        salesStage: true,
        leadScore: true,
        metadata: true,
        lastIntent: true,
        lastContactAt: true,
        totalCalls: true,
        totalAppointments: true,
      },
    });
    return customers.map(c => ({
      ...c,
      leadProfile: c.metadata?.leadProfile || {},
    }));
  } catch (err) {
    logger.warn('LEAD_PROFILES_QUERY_FAILED', { userId, error: err.message });
    return [];
  }
}
