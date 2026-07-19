# Tool Calling — Gemini Live Integration

## Tool Registration

Tools are registered with Gemini during the `setup` message using Gemini's `functionDeclarations` format:

```javascript
setup.tools = [{
  functionDeclarations: [{
    name: 'create_appointment',
    description: 'Schedule a meeting or demo...',
    parameters: {
      type: 'object',
      properties: { ... },
      required: ['callerName', 'meetingPurpose', 'scheduledDateTime'],
    },
  }],
}];
```

Tool definitions are built by `buildToolDefinitions()` from `receptionistVoice.service.js` — the single source of truth shared with the OpenAI provider.

## Supported Tools

| Tool | Description | Status |
|------|-------------|--------|
| `lookup_customer` | Look up customer by phone | ✅ |
| `create_appointment` | Schedule a meeting/demo | ✅ |
| `create_support_ticket` | Create support ticket | ✅ |
| `save_customer_note` | Save conversation note | ✅ |
| `request_human_handoff` | Transfer to human | ✅ |
| `end_call` | End the call gracefully | ✅ |

## Tool Call Flow

```
Gemini sends: { toolCall: { functionCalls: [{ name: "create_appointment", id: "abc123", args: {...} }] } }
  ↓
Provider: parses args (handles string or object)
  ↓
Provider: emits 'toolCall' event with { name, arguments, callId }
  ↓
MediaStreamHandler.handleToolCall() executes the tool
  ↓
Provider.sendToolResult(callId, result) is called
  ↓
Provider: sends { toolResponse: { functionResponses: [{ id, name, response: { name, response: result } }] } }
  ↓
Gemini: receives result, incorporates into conversation
```

## Idempotency

Duplicate tool calls are prevented by:
1. `COMPLETED_TOOL_CALLS` Set in `mediaStreamHandler.js` — tracks completed tool calls by key `{callSid}_{functionName}_{callId}`
2. `PENDING_ACTIONS` Map in `receptionistOrchestrator.service.js` — prevents duplicate execution per call session
3. `_functionCallsInFlight` Map in `geminiLive.provider.js` — tracks in-flight function calls

## Error Handling

| Error | Handling |
|-------|----------|
| Tool timeout (15s) | Retried up to 2 times with exponential backoff |
| Invalid arguments | Parsed as `{}` if JSON parse fails |
| Unknown tool name | Returns `{ error: 'unknown_tool' }` |
| Feature disabled | Returns `{ error: 'feature_disabled' }` |
| Provider disconnected | Tool result not sent — handled by provider reconnection |
