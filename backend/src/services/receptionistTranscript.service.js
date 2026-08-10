import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

const TRANSCRIPT_CHUNK_SIZE = 5;
const pendingUpdates = new Map();
const flushChains = new Map();

function enqueueFlush(callId, fn) {
  const prev = flushChains.get(callId) || Promise.resolve();
  const next = prev.then(fn, fn);
  flushChains.set(callId, next);
  return next;
}

export async function saveTranscriptChunk(callId, entries) {
  return enqueueFlush(callId, async () => {
    try {
      const call = await prisma.aiReceptionistCall.findUnique({
        where: { id: callId },
        select: { transcript: true },
      });
      if (!call) return;

      let existing = [];
      try {
        existing = call.transcript ? JSON.parse(call.transcript) : [];
      } catch {
        existing = [];
      }

      const updated = [...existing, ...entries];
      await prisma.aiReceptionistCall.update({
        where: { id: callId },
        data: { transcript: JSON.stringify(updated) },
      });
    } catch (err) {
      logger.error('TRANSCRIPT_SAVE_ERROR', { callId, error: err.message });
    }
  });
}

export function bufferTranscriptEntry(callId, entry) {
  if (!pendingUpdates.has(callId)) {
    pendingUpdates.set(callId, []);
  }

  const buffer = pendingUpdates.get(callId);
  buffer.push(entry);

  if (buffer.length >= TRANSCRIPT_CHUNK_SIZE) {
    saveTranscriptChunk(callId, buffer.splice(0, TRANSCRIPT_CHUNK_SIZE));
  }
}

export async function flushPendingTranscripts() {
  for (const [callId, entries] of pendingUpdates.entries()) {
    if (entries.length > 0) {
      await saveTranscriptChunk(callId, entries.splice(0, entries.length));
    }
    if (entries.length === 0) {
      pendingUpdates.delete(callId);
    }
  }
}

export async function getTranscript(callId) {
  try {
    const call = await prisma.aiReceptionistCall.findUnique({
      where: { id: callId },
      select: { transcript: true },
    });
    if (!call || !call.transcript) return [];
    try {
      return JSON.parse(call.transcript);
    } catch {
      return [];
    }
  } catch (err) {
    logger.error('TRANSCRIPT_GET_ERROR', { callId, error: err.message });
    return [];
  }
}

export async function appendToTranscript(callId, role, content) {
  const entry = { role, content, timestamp: new Date().toISOString() };
  bufferTranscriptEntry(callId, entry);
  return entry;
}

export async function setTranscript(callId, entries) {
  try {
    await prisma.aiReceptionistCall.update({
      where: { id: callId },
      data: { transcript: JSON.stringify(entries) },
    });
  } catch (err) {
    logger.error('TRANSCRIPT_SET_ERROR', { callId, error: err.message });
  }
}

export function getTranscriptBufferSize(callId) {
  const buffer = pendingUpdates.get(callId);
  return buffer ? buffer.length : 0;
}