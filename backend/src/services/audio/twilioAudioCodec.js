const BIAS = 0x84;
const CLIP = 32635;
const SEG_TABLE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

function ulawToPcmSample(ulawByte) {
  const u = ~ulawByte;
  const sign = (u & 0x80) ? -1 : 1;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0F;
  const sample = ((mantissa << 3) + BIAS) << (exponent - (exponent > 0 ? 1 : 0));
  return sign * (sample - BIAS);
}

function pcmToUlawSample(pcmSample) {
  let sign = 0;
  let sample = pcmSample;
  if (sample < 0) {
    sign = 0x80;
    sample = -sample;
  }
  if (sample > CLIP) sample = CLIP;
  let exponent = 7;
  for (let i = 0; i < 8; i++) {
    if (sample <= SEG_TABLE[i] * 256 + BIAS) {
      exponent = i;
      break;
    }
  }
  const mantissa = ((sample >> (exponent + 3)) & 0x0F);
  return ~(sign | (exponent << 4) | mantissa) & 0xFF;
}

export function decodeUlaw(base64Payload) {
  const raw = atob(base64Payload);
  const len = raw.length;
  const pcm16 = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    pcm16[i] = ulawToPcmSample(raw.charCodeAt(i));
  }
  return pcm16;
}

export function encodeUlaw(pcm16) {
  const len = pcm16.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = pcmToUlawSample(pcm16[i]);
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function validateTwilioPayload(payload) {
  if (typeof payload !== 'string' || payload.length === 0) {
    return { valid: false, reason: 'empty_or_nonstring' };
  }
  try {
    const decoded = atob(payload);
    return { valid: true, byteLength: decoded.length };
  } catch {
    return { valid: false, reason: 'invalid_base64' };
  }
}
