import logger from '../utils/logger.js';
import { config } from '../config/index.js';
import { createRegistry } from './registry.js';
import { MultiAgentOrchestrator } from './orchestrator.js';
import { getMemoryStore } from './shared/memoryStore.js';
import { getMetrics } from './metrics.js';
import { getHealthMonitor } from './health.js';
import { ReceptionistAgent } from './agents/receptionist.agent.js';
import { SalesAgent } from './agents/sales.agent.js';
import { FleetExpertAgent } from './agents/fleetExpert.agent.js';
import { SupportAgent } from './agents/support.agent.js';
import { CrmAgent } from './agents/crm.agent.js';
import { SchedulingAgent } from './agents/scheduling.agent.js';
import { KnowledgeAgent } from './agents/knowledge.agent.js';

let orchestrator = null;

export function isMultiAgentEnabled() {
  return Boolean(config.multiAgent.enabled);
}

export function isShadowMode() {
  return Boolean(config.multiAgent.shadowMode);
}

export function createMultiAgentRuntime() {
  const registry = createRegistry();

  registry.register(new ReceptionistAgent());
  registry.register(new SalesAgent());
  registry.register(new FleetExpertAgent());
  registry.register(new SupportAgent());
  registry.register(new CrmAgent());
  registry.register(new SchedulingAgent());
  registry.register(new KnowledgeAgent());

  const instance = new MultiAgentOrchestrator({
    registry,
    memoryStore: getMemoryStore(),
    metrics: getMetrics(),
    health: getHealthMonitor(),
  });

  logger.info('MULTI_AGENT_RUNTIME_READY', {
    agents: registry.size(),
    enabled: config.multiAgent.enabled,
    shadowMode: config.multiAgent.shadowMode,
    maxParallel: config.multiAgent.maxParallel,
  });

  return instance;
}

export function getOrchestrator() {
  if (!orchestrator) {
    orchestrator = createMultiAgentRuntime();
  }
  return orchestrator;
}

export function getRuntimeStatus() {
  return getOrchestrator().getStatus();
}
