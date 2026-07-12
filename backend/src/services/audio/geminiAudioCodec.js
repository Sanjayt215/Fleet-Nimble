export const GEMINI_AUDIO_CONFIG = {
  inputSampleRate: 16000,
  outputSampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  encoding: 'linear16',
};

export function pcm16ToBase64(pcm16) {
  const bytes = new Uint8Array(pcm16.length * 2);
  for (let i = 0; i < pcm16.length; i++) {
    bytes[i * 2] = pcm16[i] & 0xFF;
    bytes[i * 2 + 1] = (pcm16[i] >> 8) & 0xFF;
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToPcm16(base64Payload) {
  const raw = atob(base64Payload);
  const sampleCount = Math.floor(raw.length / 2);
  const pcm16 = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const low = raw.charCodeAt(i * 2);
    const high = raw.charCodeAt(i * 2 + 1);
    pcm16[i] = (high << 8) | (low & 0xFF);
  }
  return pcm16;
}

export function validateGeminiAudio(base64Payload) {
  if (typeof base64Payload !== 'string' || base64Payload.length === 0) {
    return { valid: false, reason: 'empty_or_nonstring' };
  }
  try {
    const raw = atob(base64Payload);
    if (raw.length < 2) return { valid: false, reason: 'too_small' };
    if (raw.length % 2 !== 0) return { valid: false, reason: 'odd_byte_length' };
    return { valid: true, sampleCount: Math.floor(raw.length / 2), byteLength: raw.length };
  } catch {
    return { valid: false, reason: 'invalid_base64' };
  }
}
