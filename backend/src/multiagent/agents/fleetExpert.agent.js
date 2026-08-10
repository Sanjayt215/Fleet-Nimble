import { BaseAgent } from './baseAgent.js';
import { buildResponse, successResponse, TASK_STATUS } from '../protocol.js';
import { config } from '../../config/index.js';

const FLEET_TOPICS = [
  { topic: 'tracking', patterns: [/\btracking\b/i, /\bgps\b/i, /\bmap\b/i, /\bposition\b/i], answer: 'FleetNimble GPS Tracking shows every vehicle on a live map with speed, heading, ignition status, and geofence alerts. Each vehicle card on the Dashboard also shows its last known location.' },
  { topic: 'maintenance', patterns: [/\bmaintenance\b/i, /\bservice\b/i, /\boil\s+change\b/i, /\brepair\b/i], answer: 'FleetNimble Maintenance schedules recurring tasks like oil changes and tire rotations, tracks due dates and mileage, and keeps a full service history per vehicle.' },
  { topic: 'fuel', patterns: [/\bfuel\b/i, /\bdiesel\b/i, /\bpetrol\b/i, /\befficiency\b/i], answer: 'Fuel Analytics shows fuel consumption trends, efficiency metrics, and cost analysis per vehicle, built from OBD telemetry and manual fuel logs.' },
  { topic: 'diagnostics', patterns: [/\bdiagnostic\b/i, /\bobd\b/i, /\bdtc\b/i, /\bfault\s+code\b/i, /\bengine\s+light\b/i], answer: 'Live Diagnostics streams real-time OBD-II data — RPM, speed, coolant temperature, battery voltage, fuel level, and DTC status — for any online vehicle.' },
  { topic: 'drivers', patterns: [/\bdriver\b/i, /\bbehavior\b/i, /\bharsh\s+braking\b/i, /\bspeeding\b/i], answer: 'The Drivers page manages driver profiles with safety scorecards, behavior events like harsh braking and speeding, and vehicle assignment.' },
  { topic: 'alerts', patterns: [/\balert\b/i, /\bnotification\b/i, /\bwarn\b/i, /\bgeofence\b/i], answer: 'Alerts centralizes speeding events, geofence breaches, engine faults, maintenance due, and driver behavior events with severity levels and read/unread states.' },
  { topic: 'reports', patterns: [/\breport\b/i, /\bexport\b/i, /\bpdf\b/i, /\bcsv\b/i], answer: 'Reports generates fleet analytics — fuel consumption, trip summaries, maintenance history, driver performance, DTC faults, and utilization — exportable as PDF or CSV.' },
];

const KNOWLEDGE_ANSWERS = [
  /\b(what\s+is\s+fleetnimble|about\s+fleetnimble|company)\b/i,
  /\b(how\s+does\s+it\s+work|how\s+does\s+fleetnimble)\b/i,
  /\b(platform|system)\b/i,
];

export class FleetExpertAgent extends BaseAgent {
  constructor({ memory = null, health = null, deps = null } = {}) {
    super({ id: 'fleetExpert', memory, health });
  }

  async run(task, context) {
    const { type, payload } = task.task;

    switch (type) {
      case 'answerFleetQuestion':
        return this._answer(task, payload);
      case 'listTopics':
        return successResponse(task, { topics: FLEET_TOPICS.map(t => t.topic) }, { confidence: 1 });
      default:
        return buildResponse({
          task,
          status: TASK_STATUS.FAILED,
          error: new Error(`fleetExpert agent does not support task type "${type}"`),
          confidence: 0,
        });
    }
  }

  _answer(task, payload) {
    const query = String(payload.query || '').trim();
    if (!query) {
      return buildResponse({
        task,
        status: TASK_STATUS.PARTIAL,
        result: { answer: null, reason: 'empty_query' },
        confidence: 0,
      });
    }

    let bestTopic = null;
    let bestMatches = 0;
    for (const entry of FLEET_TOPICS) {
      const matches = entry.patterns.filter(p => p.test(query)).length;
      if (matches > bestMatches) {
        bestMatches = matches;
        bestTopic = entry;
      }
    }

    let answer = null;
    let source = 'rules';
    let confidence = 0.5;

    if (bestTopic && bestMatches > 0) {
      answer = bestTopic.answer;
      confidence = 0.7 + Math.min(0.25, bestMatches * 0.1);
    }

    if (payload.knowledgeAnswer && payload.knowledgeAnswer.trim().length > 20) {
      const isProductQuestion = KNOWLEDGE_ANSWERS.some(p => p.test(query));
      if (!answer || isProductQuestion) {
        answer = payload.knowledgeAnswer;
        source = 'knowledge';
        confidence = Math.max(confidence, payload.knowledgeConfidence || 0.75);
      }
    }

    if (!answer && config.rag.enabled) {
      answer = "I can help with that — let me check our verified documentation and get back to you with specifics.";
      source = 'deferred';
      confidence = 0.3;
    }

    if (!answer) {
      return buildResponse({
        task,
        status: TASK_STATUS.PARTIAL,
        result: { answer: null, reason: 'no_verified_content' },
        confidence: 0.2,
      });
    }

    if (this.memory) {
      this.memory.set('fleetExpert', 'knowledge', 'lastTopic', bestTopic?.topic || null);
    }

    return successResponse(task, { answer, topic: bestTopic?.topic || null, source }, { confidence });
  }
}
