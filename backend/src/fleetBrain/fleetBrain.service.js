import logger from '../utils/logger.js';
import { config } from '../config/index.js';
import { getHealthSnapshot } from '../multiagent/health.js';

/**
 * Fleet Brain — the intelligence center of FleetNimble.
 * A single facade exposing every brain module behind one stable API:
 * context engine, memory engine, planner, decision engine, workflow engine,
 * fleet intelligence, business intelligence, AI skills and self-optimization.
 */

let instance = null;

class FleetBrainService {
  constructor() {
    this.modules = {};
    this.startedAt = new Date().toISOString();
    this.stats = {
      contextsBuilt: 0,
      memoriesSaved: 0,
      plansBuilt: 0,
      workflowsRun: 0,
      learningsSaved: 0,
      insightsGenerated: 0,
    };
  }

  isEnabled() {
    return Boolean(config.fleetBrain && config.fleetBrain.enabled);
  }

  registerModule(name, module) {
    this.modules[name] = module;
    logger.info('FLEET_BRAIN_MODULE_REGISTERED', { module: name });
  }

  loadModules() {
    if (Object.keys(this.modules).length > 0) return this;
    const load = async () => {
      this.registerModule('skills', await import('./aiSkills.service.js'));
      this.registerModule('planner', await import('./planner.service.js'));
      this.registerModule('contextEngine', await import('./contextEngine.service.js'));
      this.registerModule('memoryEngine', await import('./memoryEngine.service.js'));
      this.registerModule('fleetIntelligence', await import('./fleetIntelligence.service.js'));
      this.registerModule('decisionEngine', await import('./decisionEngine.service.js'));
      this.registerModule('workflowEngine', await import('./workflowEngine.service.js'));
      this.registerModule('businessIntelligence', await import('./businessIntelligence.service.js'));
      this.registerModule('selfOptimization', await import('./selfOptimization.service.js'));
    };
    this.loadPromise = this.loadPromise || load();
    return this.loadPromise.then(() => this);
  }

  async getContext(userId, { message = '', session = null, force = false } = {}) {
    if (!this.isEnabled()) return null;
    await this.loadModules();
    const cached = this.modules.contextEngine.getCachedContext(userId);
    if (cached && !force) {
      this.stats.contextsBuilt += 1;
      return cached;
    }
    const callId = session?.callId || session?.callSid || null;
    const unified = await this.modules.contextEngine.buildUnifiedContext({
      userId,
      companyId: session?.companyId || null,
      parts: {
        conversation: { intent: session?.intent || null },
        transcriptEntries: session?.transcriptEntries || null,
        timelineEvents: session?.timelineEvents || null,
        callId,
        customer: session?.customer || null,
        crmData: session?.crmData || null,
        fleet: session?.fleet || null,
        vehicle: session?.vehicle || null,
        alerts: session?.alerts || null,
        maintenance: session?.maintenance || null,
        fleetKpis: session?.fleetKpis || null,
        coveredTopics: session?.coveredTopics || null,
        lastAnswer: session?.lastAnswer || null,
        appointment: session?.appointment || null,
        appointmentScheduled: session?.appointmentScheduled || null,
        ticket: session?.ticket || null,
        ticketCreated: session?.ticketCreated || null,
        severity: session?.severity || null,
        leadScore: session?.leadScore || null,
        qualified: session?.qualified || null,
        salesStage: session?.salesStage || null,
        buyingSignals: session?.buyingSignals || null,
      },
    });
    this.stats.contextsBuilt += 1;
    return unified;
  }

  async remember(userId, memory) {
    if (!this.isEnabled()) return null;
    await this.loadModules();
    this.stats.memoriesSaved += 1;
    return this.modules.memoryEngine.remember({ userId, ...memory });
  }

  async recall(userId, key, options = {}) {
    if (!this.isEnabled()) return null;
    await this.loadModules();
    return this.modules.memoryEngine.recall({ userId, key, ...options });
  }

  async buildPlan({ userId, message = '', context = null, skillName = null, customer = null }) {
    if (!this.isEnabled()) return null;
    await this.loadModules();
    this.stats.plansBuilt += 1;
    const skill = skillName ? this.modules.skills.getSkill(skillName) : null;
    const skillResolved = skill || (context?.conversation?.intent
      ? this.modules.skills.skillForIntent(context.conversation.intent)
      : null);
    return this.modules.planner.buildPlan({
      intent: context?.conversation?.intent,
      message,
      context,
      skill: skillResolved,
      customer: customer || context?.crm || null,
    });
  }

  async runWorkflow(options) {
    if (!this.isEnabled()) return null;
    await this.loadModules();
    this.stats.workflowsRun += 1;
    return this.modules.workflowEngine.runWorkflow(options);
  }

  async answerFleetQuery(userId, query) {
    if (!this.isEnabled()) return null;
    await this.loadModules();
    return this.modules.fleetIntelligence.answerFleetQuery({ userId, query });
  }

  async getFleetKpis(userId, options) {
    if (!this.isEnabled()) return null;
    await this.loadModules();
    return this.modules.fleetIntelligence.getFleetKpis(userId, options);
  }

  async generateInsights(userId, options) {
    if (!this.isEnabled()) return null;
    await this.loadModules();
    this.stats.insightsGenerated += 1;
    return this.modules.businessIntelligence.generateBusinessInsights(userId, options);
  }

  async learnFromCall(options) {
    if (!this.isEnabled()) return null;
    await this.loadModules();
    this.stats.learningsSaved += 1;
    return this.modules.selfOptimization.learnFromCall(options);
  }

  async getDashboard(userId, { limit = 20 } = {}) {
    if (!this.isEnabled()) return null;
    await this.loadModules();
    const [skills, decisions, workflows, insights, learnings, memStats, toolCapabilities] = await Promise.all([
      Promise.resolve(this.modules.skills.listSkills()),
      Promise.resolve(this.modules.decisionEngine.getRecentDecisions(userId, { limit })),
      this.modules.workflowEngine.getWorkflowRuns(userId, { limit }),
      this.modules.businessIntelligence.getBusinessIntelligenceSnapshot(userId, { days: 30 }),
      this.modules.selfOptimization.getLearnings(userId, { limit }),
      Promise.resolve(this.modules.memoryEngine.getMemoryStats()),
      Promise.resolve(this.modules.decisionEngine.getToolCapabilities()),
    ]);
    return {
      enabled: this.isEnabled(),
      skills,
      decisions,
      workflows,
      insights: insights?.insights || [],
      totals: insights?.totals || {},
      learnings,
      memory: {
        inMemory: memStats?.shortTermEntries || 0,
        persisted: 0,
        expiredEntries: memStats?.expiredEntries || 0,
      },
      toolCapabilities,
      stats: this.stats,
      startedAt: this.startedAt,
      health: getHealthSnapshot(),
      generatedAt: new Date().toISOString(),
    };
  }
}

export function getFleetBrain() {
  if (!instance) {
    instance = new FleetBrainService();
  }
  return instance;
}

export default getFleetBrain;
