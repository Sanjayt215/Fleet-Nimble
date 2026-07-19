# Audio Pipeline — Gemini Live Integration

## Pipeline Overview

```
Twilio (PSTN)
  μ-law 8kHz, 20ms packets, base64
  ↓
MediaStreamHandler
  → validateTwilioPayload (checks base64)
  → provider.sendAudio(payload)
  ↓
GeminiLiveProvider._sendAudioChunk(payload)
  → decodeUlaw(payload) → Int16Array 8kHz
  → convertSampleRate(pcm8k, 8000, 16000) → Int16Array 16kHz
  → pcm16ToBase64(pcm16k) → base64 string
  → WS send: { realtimeInput: { mediaChunks: [{ data, mimeType: 'audio/pcm;rate=16000' }] } }
  ↓
Gemini API (processes audio)
  ↓
GeminiLiveProvider._handleMessage (serverContent.modelTurn.parts)
  → extract inlineData.data (base64 LINEAR16 24kHz)
  → base64ToPcm16(base64) → Int16Array 24kHz
  → convertSampleRate(pcm24k, 24000, 8000) → Int16Array 8kHz
  → encodeUlaw(pcm8k) → μ-law base64
  → emit('audio', { format: 'g711_ulaw', audio: payload })
  ↓
MediaStreamHandler
  → WS send to Twilio: { event: 'media', streamSid, media: { payload } }
  ↓
Twilio → Caller hears audio
```

## Sample Rates

| Stage | Format | Rate | Bit Depth |
|-------|--------|------|-----------|
| Twilio input | μ-law (G.711) | 8000 Hz | 8-bit |
| After decodeUlaw | LINEAR16 PCM | 8000 Hz | 16-bit |
| After resample (input) | LINEAR16 PCM | 16000 Hz | 16-bit |
| Sent to Gemini | LINEAR16 PCM | 16000 Hz | 16-bit |
| Gemini output | LINEAR16 PCM | 24000 Hz | 16-bit |
| After resample (output) | LINEAR16 PCM | 8000 Hz | 16-bit |
| After encodeUlaw | μ-law (G.711) | 8000 Hz | 8-bit |
| Sent to Twilio | μ-law (G.711) | 8000 Hz | 8-bit |

## Codec Functions Used

| Function | Source | Purpose |
|----------|--------|---------|
| `decodeUlaw(base64)` | `twilioAudioCodec.js` | μ-law → PCM16 Int16Array |
| `encodeUlaw(pcm16)` | `twilioAudioCodec.js` | PCM16 Int16Array → μ-law base64 |
| `convertSampleRate(input, from, to)` | `audioResampler.js` | Linear interpolation resampling with Int16 clamping |
| `_pcm16ToBase64(pcm16)` | `geminiLive.provider.js` (internal) | Int16Array → base64 LINEAR16 |
| `_base64ToPcm16(base64)` | `geminiLive.provider.js` (internal) | base64 LINEAR16 → Int16Array |

## Voice Configuration

Gemini Live supports prebuilt voices configured via:

```
setup.speechConfig = {
  voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } }
}
```

Voice name mapping (from `mapToProviderVoice()` in `receptionistVoice.service.js`):

| OpenAI Voice | Gemini Voice |
|-------------|-------------|
| alloy | Puck |
| echo | Charon |
| fable | Kore |
| onyx | Fenrir |
| nova | Aoede |
| shimmer | Puck |

## Turn Detection (Server VAD)

Configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_ENABLE_SERVER_VAD` | `true` | Enable server-side VAD |
| `GEMINI_VAD_PRE_SILENCE_MS` | `300` | Padding before speech |
| `GEMINI_VAD_POST_SILENCE_MS` | `800` | Silence to end turn |
| `GEMINI_VAD_THRESHOLD` | `0.6` | Speech detection sensitivity |

VAD configuration is sent in the `setup` message:
```javascript
setup.speechConfig.speechModelV2 = {
  vadType: 'SERVER_VAD',
  preSilenceMs: 300,
  postSilenceMs: 800,
  threshold: 0.6,
};
```
