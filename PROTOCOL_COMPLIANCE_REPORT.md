
# Gemini Live Protocol Compliance Report — 2026-07-25

---

## 1. ROOT CAUSE

The model `gemini-2.0-flash-exp` is **SHUT DOWN** (deprecated 2025-12-09) and does **NOT support the Gemini Live API**.

| Evidence | Source |
|---|---|
| `gemini-2.0-flash-exp` shutdown date Dec 9 2025 | ai.google.dev/gemini-api/docs/deprecations |
| `gemini-2.0-flash` → Live API Not Supported | ai.google.dev/gemini-api/docs/models/gemini-2.0-flash |
| Official Get Started uses `gemini-3.1-flash-live-preview` | ai.google.dev/gemini-api/docs/live-api/get-started-websocket |

**Secondary issues**:
- API version `v1alpha` (should be `v1beta` as documented)
- `startOfSpeechSensitivity` / `endOfSpeechSensitivity` used plain strings (`'low'`) instead of full protobuf enum names (`'START_SENSITIVITY_LOW'`)
- `mediaChunks` is **DEPRECATED** — should use `audio` field instead

---

## 2. EVERY OUTBOUND MESSAGE AUDITED

### 2a. `setup` (first message)

| JSON Field | Source | Official Equivalent | Valid | Reason |
|---|---|---|---|---|
| `setup.model` | geminiLive.provider.js:171 | `BidiGenerateContentSetup.model` | ✓ | Format `models/{model}` |
| `setup.systemInstruction.parts[].text` | geminiLive.provider.js:172-174 | `Content.parts[].text` | ✓ | Content type with text parts |
| `setup.generationConfig.temperature` | geminiLive.provider.js:176 | `GenerationConfig.temperature` | ✓ | |
| `setup.generationConfig.topP` | geminiLive.provider.js:177 | `GenerationConfig.topP` | ✓ | |
| `setup.generationConfig.topK` | geminiLive.provider.js:178 | `GenerationConfig.topK` | ✓ | |
| `setup.generationConfig.responseModalities` | geminiLive.provider.js:179 | `GenerationConfig.responseModalities` | ✓ | Value `'AUDIO'` is valid Modality enum |
| `setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName` | geminiLive.provider.js:187-192 | `SpeechConfig.voiceConfig.prebuiltVoiceConfig.voiceName` | ✓ | Matches docs |
| `setup.tools[].functionDeclarations` | geminiLive.provider.js:194-201 | `Tool.functionDeclarations` | ✓ | |
| `setup.realtimeInputConfig.automaticActivityDetection` | geminiLive.provider.js:204-213 | `RealtimeInputConfig.automaticActivityDetection` | ✓ | |
| `...startOfSpeechSensitivity` | geminiLive.provider.js:208 | `StartSensitivity` enum | ✗ **FIXED** | Was `'low'`, now `'START_SENSITIVITY_LOW'` |
| `...endOfSpeechSensitivity` | geminiLive.provider.js:209 | `EndSensitivity` enum | ✗ **FIXED** | Was `'low'`, now `'END_SENSITIVITY_LOW'` |

### 2b. `realtimeInput` (audio)

| JSON Field | Source | Official Equivalent | Valid | Reason |
|---|---|---|---|---|
| `realtimeInput.mediaChunks[].data` | geminiLive.provider.js:300-307 | DEPRECATED — use `audio.data` | ⚠️ | `mediaChunks` marked DEPRECATED, use `audio` |
| `realtimeInput.mediaChunks[].mimeType` | geminiLive.provider.js:300-307 | DEPRECATED — use `audio.mimeType` | ⚠️ | Same |

### 2c. `realtimeInput` (text)

| JSON Field | Source | Official Equivalent | Valid | Reason |
|---|---|---|---|---|
| `realtimeInput.text` | geminiLive.provider.js:317 | `BidiGenerateContentRealtimeInput.text` | ✓ | |

### 2d. `toolResponse`

| JSON Field | Source | Official Equivalent | Valid | Reason |
|---|---|---|---|---|
| `toolResponse.functionResponses[].id` | geminiLive.provider.js:337-348 | `BidiGenerateContentToolResponse.functionResponses[].id` | ✓ | |
| `toolResponse.functionResponses[].name` | geminiLive.provider.js:337-348 | `BidiGenerateContentToolResponse.functionResponses[].name` | ✓ | |
| `toolResponse.functionResponses[].response` | geminiLive.provider.js:337-348 | `BidiGenerateContentToolResponse.functionResponses[].response` | ✓ | |

### 2e. `cancelResponse` (no-op)

| Action | Source | Valid | Reason |
|---|---|---|---|
| Clears local state, no ws.send() | geminiLive.provider.js:374-378 | ✓ | No message sent over wire |

---

## 3. INBOUND MESSAGE HANDLERS AUDITED

| Server Message | Handler | Status | Issues |
|---|---|---|---|
| `setupComplete` | geminiLive.provider.js:433-448 | ✓ | Emits 'ready' |
| `serverContent.interrupted` | geminiLive.provider.js:455-459 | ✓ | Emits 'speechStarted' |
| `serverContent.modelTurn.parts[].text` | geminiLive.provider.js:467-481 | ✓ | Emits 'assistantTranscript' |
| `serverContent.modelTurn.parts[].inlineData` | geminiLive.provider.js:484-512 | ✓ | Decodes PCM24 → PCM16 → resample → μ-law |
| `serverContent.turnComplete` | geminiLive.provider.js:521-536 | ✓ | Emits 'responseCompleted' |
| `toolCall.functionCalls[]` | geminiLive.provider.js:542-573 | ✓ | Emits 'toolCall' |
| `error` | geminiLive.provider.js:576-601 | ✓ | Emits 'error' with retry logic |

---

## 4. AUDIO PIPELINE VERIFICATION

| Stage | Format | Sample Rate | Action | Verified |
|---|---|---|---|---|
| Twilio → decodeUlaw | μ-law → PCM16 | 8kHz | `ulawToPcmSample` loop | ✓ |
| PCM16 → convertSampleRate | PCM16 → PCM16 | 8kHz → 16kHz | Linear interpolation | ✓ |
| PCM16 → base64 | PCM16 → base64 | 16kHz | `_pcm16ToBase64` (little-endian) | ✓ |
| base64 → ws.send | JSON | 16kHz | `realtimeInput.mediaChunks` (DEPRECATED) | ⚠️ |
| ws.recv → base64 | JSON → base64 | 24kHz | `part.inlineData.data` | ✓ |
| base64 → PCM16 | base64 → PCM16 | 24kHz | `_base64ToPcm16` (little-endian) | ✓ |
| PCM16 → convertSampleRate | PCM16 → PCM16 | 24kHz → 8kHz | Linear interpolation | ✓ |
| PCM16 → encodeUlaw | PCM16 → μ-law | 8kHz | `pcmToUlawSample` loop | ✓ |
| μ-law → Twilio | μ-law | 8kHz | `audio` event with `g711_ulaw` | ✓ |

**Issue**: `mediaChunks` is DEPRECATED per docs. Should use `audio` object with `data` and `mimeType`.

---

## 5. CONFIGURATION ISSUES

| Setting | Current Value | Correct Value | Impact |
|---|---|---|---|
| Model | `gemini-2.0-flash-exp` (SHUT DOWN) | `gemini-3.1-flash-live-preview` or `gemini-live-2.5-flash-native-audio` | **CRITICAL** — model does not support Live API |
| API version | `v1alpha` | `v1beta` | Medium — should match official docs |

---

## 6. SUMMARY OF CHANGES REQUIRED

### Critical (blocking production):
1. Change default model: `gemini-2.0-flash-exp` → `gemini-3.1-flash-live-preview`
2. Change API version: `v1alpha` → `v1beta`

### High (fix to prevent future issues):
3. Replace `mediaChunks` with `audio` in `_sendAudioChunk`
4. Enum values already corrected in `_sendSetup`

### Medium (quality improvement):
5. Update `.env` defaults and config comments
6. Add `responseModalities` enum validation (already done)

---

## 7. VERDICT

**FAIL** — production deployment blocked until model is changed to a Live API-compatible model.
