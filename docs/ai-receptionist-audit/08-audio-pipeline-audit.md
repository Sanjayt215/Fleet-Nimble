# Audio Pipeline Audit — AI Receptionist

## Component Architecture

```
Twilio → [μ-law 8kHz base64] → decodeG711ulaw → [PCM16 Int16Array 8kHz]
  → audioResampler (8kHz→16kHz) → [PCM16 16kHz] → base64 → OpenAI
  → OR → audioBridge (8kHz→16kHz) → [Float32 16kHz] → Gemini

Provider → [PCM16 24kHz base64] → audioResampler (24kHz→8kHz) → [PCM16 8kHz]
  → encodeG711ulaw → [μ-law 8kHz base64] → Twilio
  → OR → audioBridge subtract bias → [μ-law 8kHz] → Twilio
```

## Audio Files

### `audioResampler.js`
- **Function:** `resamplePcm16(audioData, fromRate, toRate)`
- **Input:** `Int16Array` or `Buffer`, sample rates (e.g., 8000→16000 or 24000→8000)
- **Method:** Linear interpolation between samples
- **Quality:** Basic linear interpolation — no anti-aliasing filter, may cause aliasing on downsampling
- **Edge cases:** Single sample returns same sample; first sample copied directly

### `twilioAudioCodec.js`
- **`decodeG711ulaw(base64String)`**: decodes μ-law base64 to PCM16 `Int16Array`
  - Uses the standard μ-law expansion table
  - Returns `Int16Array` of decoded samples
- **`encodeG711ulaw(pcmSamples)`**: encodes PCM16 to μ-law base64
  - Uses the standard μ-law compression table
  - Returns base64-encoded string
  - Correctly handles `Int16Array` input

### `geminiAudioCodec.js`
- **`encodeAudioForGemini(audioData)`**: Converts PCM16 to base64 for Gemini API
  - Simply buffers outgoing audio
- **`decodeAudioFromGemini(base64String)`**: Extracts base64 audio from Gemini response
  - Returns base64 string for further processing

### `audioBridge.js`
- Provides a combined pipeline for Gemini provider specifically
- **`pcm16ToUlaw(pcm16Audio)`**: Subtracts 128 bias (not true μ-law encoding) — ⚠️ THIS IS INCORRECT
- **`ulawToPcm16(ulawAudio)`**: Adds 128 bias — ⚠️ THIS IS INCORRECT
- Only used by `geminiLive.provider.js` (not used by OpenAI provider)

## Audio Pipeline Issues

### Issue 1: `audioBridge.js` uses bias method instead of proper μ-law
- The `pcm16ToUlaw` function in `audioBridge.js` simply adds/subtracts 128 bias
- This is **not** proper μ-law encoding/decoding
- The `twilioAudioCodec.js` has the correct μ-law tables
- **Impact:** When Gemini provider is used, audio to/from Twilio will be distorted or silent
- **Root cause:** `audioBridge.js` was written as a simpler alternative but doesn't perform actual μ-law encoding

### Issue 2: Linear interpolation resampling may cause aliasing
- `audioResampler.js` uses linear interpolation (no low-pass filter)
- Downsampling 24kHz→8kHz without anti-aliasing filter will introduce aliasing artifacts
- **Impact:** Slight audio quality degradation on provider→Twilio path
- **Mitigation:** Acceptable for voice calls; quality impact is minimal for speech

### Issue 3: Early audio buffer
- `pendingAudioQueue` in `mediaStreamHandler.js` buffers audio chunks before provider is ready
- On `ready` event, all buffered chunks are sent to provider via `provider.sendAudio()`
- **Potential issue:** If the buffer contains many chunks, sending them rapidly may overwhelm the provider's input buffer

### Issue 4: No audio level monitoring
- No VU meter, silence detection, or audio level logging
- Debugging audio issues requires external tools
