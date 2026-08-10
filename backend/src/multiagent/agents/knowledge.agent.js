import { BaseAgent } from './baseAgent.js';
import { queryKnowledgeBase, getKnowledgeTopics } from '../../services/receptionistKnowledgeBase.service.js';
import { retrieve } from '../../knowledge/rag/retrievalEngine.service.js';
import { buildResponse, successResponse, TASK_STATUS } from '../protocol.js';
import { config } from '../../config/index.js';
import logger from '../../utils/logger.js';

export class KnowledgeAgent extends BaseAgent {
  constructor({ memory = null, health = null, deps = null } = {}) {
    super({ id: 'knowledge', memory, health });
    this.services = deps || { queryKnowledgeBase, getKnowledgeTopics, retrieve };
  }

  async run(task, context) {
    const { type, payload } = task.task;
    const userId = task.context.userId || payload.userId;

    switch (type) {
      case 'retrieve':
        return this._retrieve(task, userId, payload);
      case 'topics':
        return this._topics(task, userId);
      default:
        return buildResponse({
          task,
          status: TASK_STATUS.FAILED,
          error: new Error(`knowledge agent does not support task type "${type}"`),
          confidence: 0,
        });
    }
  }

  async _retrieve(task, userId, payload) {
    const query = String(payload.query || '').trim();
    if (!query) {
      return buildResponse({
        task,
        status: TASK_STATUS.PARTIAL,
        result: { answer: null, reason: 'empty_query' },
        confidence: 0,
      });
    }

    const cacheHits = { value: 0 };
    let answer = null;
    let source = null;
    let confidence = 0;

    if (this.memory) {
      const answeredTopics = this.memory.get('knowledge', 'answeredTopics') || [];
      const hit = answeredTopics.find(topic => topic.query === query);
      if (hit) {
        cacheHits.value++;
        answer = hit.answer;
        source = hit.source;
        confidence = hit.confidence || 0.9;
      }
    }

    if (!answer) {
      try {
        const kbAnswer = await this.services.queryKnowledgeBase(query, userId);
        if (kbAnswer) {
          answer = kbAnswer;
          source = 'knowledge_base';
          confidence = 0.85;
        }
      } catch (err) {
        logger.warn('KNOWLEDGE_AGENT_KB_FAILED', { error: err.message });
      }
    }

    let articles = [];
    if (!answer && config.rag.enabled) {
      try {
        const retrieval = await this.services.retrieve(query, {
          maxResults: payload.maxResults || config.rag.retrieval.maxResults,
          category: payload.category || null,
        });
        if (retrieval.hasAnswer) {
          answer = retrieval.passages.map(p => p.chunkText).join(' ');
          source = 'rag';
          confidence = Math.min(0.95, retrieval.confidence);
          articles = retrieval.passages.map(p => ({ articleId: p.articleId, score: p.score }));
        }
      } catch (err) {
        logger.warn('KNOWLEDGE_AGENT_RAG_FAILED', { error: err.message });
      }
    }

    const topicRecord = { query, answer, source, confidence };
    if (this.memory) {
      this.memory.append('knowledge', 'knowledge', 'answeredTopics', topicRecord, { limit: 20 });
      const confidenceByTopic = this.memory.get('knowledge', 'confidenceByTopic') || {};
      confidenceByTopic[query] = confidence;
      this.memory.set('knowledge', 'knowledge', 'confidenceByTopic', confidenceByTopic);
    }

    return successResponse(task, { query, answer, source, confidence, articles }, {
      confidence: Math.max(0, confidence),
      artifacts: { sources: articles.map(a => a.articleId) },
      cost: { dbQueries: 0, cacheHits: cacheHits.value },
    });
  }

  async _topics(task, userId) {
    let topics = [];
    try {
      topics = await this.services.getKnowledgeTopics(userId);
    } catch (err) {
      logger.warn('KNOWLEDGE_AGENT_TOPICS_FAILED', { error: err.message });
    }
    return successResponse(task, { topics }, { confidence: 1, cost: { dbQueries: 1 } });
  }
}
