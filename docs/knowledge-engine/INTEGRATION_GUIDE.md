# Integration Guide

## Overview

The Knowledge Engine integrates with the AI Receptionist at two points:

1. **System Prompt Injection** (`receptionistVoice.service.js`): The engine injects knowledge articles into the LLM's system prompt so it can answer product questions naturally without needing tool calls.

2. **Intent Classification & Answering** (`receptionistOrchestrator.service.js`): The orchestrator uses the engine to classify intents and fetch verified answers for product questions.

## System Prompt Integration

```js
// receptionistVoice.service.js
import { getKnowledgeEngine } from '../knowledge/index.js';

export async function buildSystemPrompt(config, memoryContext = '', conversationMode = 'both') {
  // ... base prompt ...

  const knowledgeSection = await buildKnowledgeContext(conversationMode);

  return `${prompt}\n\n${knowledgeSection}`;
}

async function buildKnowledgeContext(conversationMode) {
  const engine = await getKnowledgeEngine();
  // Fetches articles per category, injects into prompt
  // Adds mode-specific instructions
  // Adds knowledge rules
}
```

The `knowledgeSection` includes:
- All articles organized by category (5 per category max)
- Article answers and truncated details
- Mode-specific behavior instructions
- Knowledge safety rules

## Orchestrator Integration

```js
// receptionistOrchestrator.service.js
import { getKnowledgeEngine } from '../knowledge/index.js';

export async function processReceptionistTurn({ session, userText }) {
  const intent = await classifyIntent(userText, session);

  if (intent === INTENTS.PRODUCT_QUESTION || INTENTS.PRICING_QUESTION || INTENTS.SALES_INTEREST) {
    const engine = await getKnowledgeEngine();
    const results = await engine.search(userText, { mode: conversationMode, limit: 3 });
    const answer = engine.getAnswer(results, conversationMode);

    // Proactive sales
    const salesTip = engine.getProactiveSalesSuggestion(results);
    if (salesTip && conversationMode === 'sales') {
      answer = `${answer} ${salesTip}`;
    }

    return { reply: answer, intent, isKnowledgeBase: true };
  }
}
```

## Intent-Engine Mapping

| User Intent | Engine Mode | Behavior |
|-------------|-------------|----------|
| `product_question` | Article's mode | Standard answer |
| `pricing_question` | sales | Includes proactive sales |
| `sales_interest` | sales | Includes proactive sales |
| `support_request` | support | Support-focused answers |
| `schedule_meeting` | sales | Not engine-related |

## Testing Integration

1. Start the backend: `npm run dev`
2. Call the AI Receptionist phone number
3. Ask: "Tell me about GPS tracking"
4. Expected: Verified answer about GPS Tracking from knowledge base
5. Ask: "How much does it cost?"
6. Expected: Verified pricing answer (sales mode, potentially with proactive sales)

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| LLM invents answers | Knowledge engine not initialized | Check `getKnowledgeEngine()` initialization |
| Wrong mode answers | Conversation mode not set | Check `classifyIntent()` mode assignment |
| Missing proactive sales | `proactiveSalesTip` is null | Add tip to article content |
| Slow system prompt build | Too many articles per category | Reduce `slice()` limit in `buildKnowledgeContext()` |
