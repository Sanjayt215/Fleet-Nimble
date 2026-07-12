import { decodeUlaw, encodeUlaw, validateTwilioPayload } from './twilioAudioCodec.js';
import { base64ToPcm16, pcm16ToBase64, validateGeminiAudio } from './geminiAudioCodec.js';
import { convertSampleRate } from './audioResampler.js';

export function twilioToProviderAudio(payload, providerSampleRate = 16000) {
  const validation = validateTwilioPayload(payload);
  if (!validation.valid) return null;

  const pcm8k = decodeUlaw(payload);
  const pcmProvider = convertSampleRate(pcm8k, 8000, providerSampleRate);
  return pcm16ToBase64(pcmProvider);
}

export function providerToTwilioAudio(payload, providerSampleRate = 16000) {
  const validation = validateGeminiAudio(payload);
  if (!validation.valid) return null;

  const pcmProvider = base64ToPcm16(payload);
  const pcm8k = convertSampleRate(pcmProvider, providerSampleRate, 8000);
  return encodeUlaw(pcm8k);
}

export function twilioToProviderRawPcm(payload, providerSampleRate = 16000) {
  const validation = validateTwilioPayload(payload);
  if (!validation.valid) return null;

  const pcm8k = decodeUlaw(payload);
  return convertSampleRate(pcm8k, 8000, providerSampleRate);
}

export function providerToTwilioRawPcm(pcmProvider, providerSampleRate = 16000) {
  if (!pcmProvider || pcmProvider.length === 0) return null;
  const pcm8k = convertSampleRate(pcmProvider, providerSampleRate, 8000);
  return encodeUlaw(pcm8k);
}
