import logger from '../utils/logger.js';

const metrics = {
  calls: { total: 0, completed: 0, failed: 0, errorCodes: {} },
  tools: { total: 0, succeeded: 0, failed: 0, executionTimes: [] },
  provider: { connections: 0, errors: 0, fatalErrors: 0, transientErrors: 0, latencies: [] },
  appointments: { created: 0, conflicts: 0, failed: 0 },
  tickets: { created: 0, failed: 0 },
  audio: { framesReceived: 0, framesSent: 0, bytesReceived: 0, bytesSent: 0, framesDropped: 0 },
};

export function recordCallEvent(event) {
  metrics.calls.total++;
  if (event.status === 'completed') metrics.calls.completed++;
  if (event.status === 'failed' || event.error) {
    metrics.calls.failed++;
    if (event.errorCode) {
      metrics.calls.errorCodes[event.errorCode] = (metrics.calls.errorCodes[event.errorCode] || 0) + 1;
    }
  }
}

export function recordToolExecution(name, durationMs, success) {
  metrics.tools.total++;
  if (success) metrics.tools.succeeded++;
  else metrics.tools.failed++;
  metrics.tools.executionTimes.push({ name, durationMs, success, timestamp: Date.now() });
  if (metrics.tools.executionTimes.length > 1000) {
    metrics.tools.executionTimes = metrics.tools.executionTimes.slice(-500);
  }
}

export function recordProviderEvent(event) {
  metrics.provider.connections++;
  if (event.type === 'error') metrics.provider.errors++;
  if (event.type === 'fatal') metrics.provider.fatalErrors++;
  if (event.type === 'transient') metrics.provider.transientErrors++;
  if (event.latencyMs != null) {
    metrics.provider.latencies.push(event.latencyMs);
    if (metrics.provider.latencies.length > 1000) {
      metrics.provider.latencies = metrics.provider.latencies.slice(-500);
    }
  }
}

export function recordAppointmentCreated() {
  metrics.appointments.created++;
}

export function recordAppointmentConflict() {
  metrics.appointments.conflicts++;
}

export function recordAppointmentFailed() {
  metrics.appointments.failed++;
}

export function recordTicketCreated() {
  metrics.tickets.created++;
}

export function recordTicketFailed() {
  metrics.tickets.failed++;
}

export function recordAudioFrame(direction, byteLength) {
  if (direction === 'in') {
    metrics.audio.framesReceived++;
    metrics.audio.bytesReceived += byteLength;
  } else {
    metrics.audio.framesSent++;
    metrics.audio.bytesSent += byteLength;
  }
}

export function recordAudioDrop() {
  metrics.audio.framesDropped++;
}

export function getMetrics() {
  const avgToolTime = metrics.tools.executionTimes.length > 0
    ? metrics.tools.executionTimes.reduce((a, t) => a + t.durationMs, 0) / metrics.tools.executionTimes.length
    : 0;
  const avgLatency = metrics.provider.latencies.length > 0
    ? metrics.provider.latencies.reduce((a, l) => a + l, 0) / metrics.provider.latencies.length
    : 0;

  return {
    calls: { ...metrics.calls },
    tools: {
      total: metrics.tools.total,
      succeeded: metrics.tools.succeeded,
      failed: metrics.tools.failed,
      averageExecutionTimeMs: Math.round(avgToolTime),
    },
    provider: {
      connections: metrics.provider.connections,
      errors: metrics.provider.errors,
      fatalErrors: metrics.provider.fatalErrors,
      transientErrors: metrics.provider.transientErrors,
      averageLatencyMs: Math.round(avgLatency),
    },
    appointments: { ...metrics.appointments },
    tickets: { ...metrics.tickets },
    audio: { ...metrics.audio },
  };
}

export function resetMetrics() {
  metrics.calls = { total: 0, completed: 0, failed: 0, errorCodes: {} };
  metrics.tools = { total: 0, succeeded: 0, failed: 0, executionTimes: [] };
  metrics.provider = { connections: 0, errors: 0, fatalErrors: 0, transientErrors: 0, latencies: [] };
  metrics.appointments = { created: 0, conflicts: 0, failed: 0 };
  metrics.tickets = { created: 0, failed: 0 };
  metrics.audio = { framesReceived: 0, framesSent: 0, bytesReceived: 0, bytesSent: 0, framesDropped: 0 };
  logger.info('METRICS_RESET');
}
