# FleetNimble AI Receptionist — Emotion-Aware Personality

## Goal

Make Ava emotionally intelligent: detect the caller's emotional state and adapt tone, pace, and approach in real time.

## Emotion Detection Signals

Emotion is inferred from the caller transcript (text + pacing + content cues).

```javascript
export const EMOTION_SIGNALS = {
  CONFUSED: [
    'wait', 'i mean', 'not sure', 'i do not get it', "i don't understand",
    'huh', 'what do you mean', 'again please', 'repeat that', 'lost',
  ],
  EXCITED: [
    'amazing', 'great', 'awesome', 'perfect', 'love it', 'excited',
    'exactly', 'finally', 'wow', 'can not wait',
  ],
  FRUSTRATED: [
    'this is ridiculous', 'unacceptable', 'tired of', 'again', 'still broken',
    'not working', 'no one helps', 'waste of time', 'terrible', 'angry',
  ],
  ANXIOUS: [
    'worried', 'concerned', 'stressed', 'nervous', 'what if', 'i hope',
    'cant afford', 'scared', 'pressing',
  ],
  EXPLORING: [
    'just looking', 'curious', 'want to learn', 'tell me about',
    'how does', 'what can', 'thinking about', 'considering',
  ],
  READY_TO_BUY: [
    'lets do it', 'sign me up', 'set it up', 'book it', 'i want it',
    'where do i start', 'get started', 'lets go',
  ],
  NEUTRAL: [], // default
};
```

## Response Adaptation Rules

| Emotion | Ava's Behavior | Example |
|---------|---------------|---------|
| **Confused** | Slow down, rephrase, simplify, check understanding | "Let me slow down and explain that differently." |
| **Excited** | Match energy, affirm, ride momentum | "That's great to hear! FleetNimble would be a strong fit for that." |
| **Frustrated** | Brief apology, stay calm, move to solution | "I'm sorry you're dealing with this. Let me get you a solution right away." |
| **Anxious** | Reassure, reduce risk language, offer options | "No need to worry — I'll guide you through this step by step." |
| **Exploring** | No pressure, offer info, never hard-sell | "No pressure at all. What would you like to know more about?" |
| **Ready to buy** | Transition to booking naturally | "Sounds like you're ready to get started. Shall we schedule your demo?" |

## Emotion State Machine

```
Each caller turn → emotion detector → emotion state updated

Emotion state persists across the call and decays over time:
  - A single excited utterance sets EXCITED for 3 turns, then decays to NEUTRAL
  - FRUSTRATED persists 5 turns or until resolved
  - CONFUSED clears when caller demonstrates understanding
```

```javascript
export class EmotionState {
  constructor() {
    this.current = 'NEUTRAL';
    this.history = [];
    this.streak = 0;
  }

  update(transcriptText) {
    const scores = detectEmotionScores(transcriptText);
    const dominant = getDominantEmotion(scores);
    if (dominant !== 'NEUTRAL') {
      this.streak = this.current === dominant ? this.streak + 1 : 1;
      this.current = dominant;
    } else if (this.streak > 0) {
      this.streak--;
      if (this.streak === 0) this.current = 'NEUTRAL';
    }
    this.history.push({ emotion: this.current, at: Date.now() });
    return this.current;
  }
}
```

## Tone Modifiers (Injected into System Prompt)

```javascript
export function buildToneModifier(emotion) {
  switch (emotion) {
    case 'CONFUSED':
      return `
        TONE ADJUSTMENT: The caller seems confused.
        - Speak slower and simpler.
        - Use shorter sentences.
        - Ask "Would you like me to explain that differently?" after complex answers.
        - Do not add new information until they confirm understanding.`;
    case 'EXCITED':
      return `
        TONE ADJUSTMENT: The caller is enthusiastic.
        - Match their energy with warmth.
        - Use positive affirmations: "That's wonderful!", "Excellent!"
        - Ride the momentum toward the natural next step.`;
    case 'FRUSTRATED':
      return `
        TONE ADJUSTMENT: The caller is frustrated.
        - Apologize briefly once: "I'm sorry about that."
        - Stay calm and solution-focused.
        - Never be defensive.
        - Offer concrete next steps.`;
    case 'ANXIOUS':
      return `
        TONE ADJUSTMENT: The caller sounds concerned.
        - Reassure calmly.
        - Break things into small steps.
        - Avoid pressure and jargon.
        - Emphasize that you'll guide them through it.`;
    case 'EXPLORING':
      return `
        TONE ADJUSTMENT: The caller is just exploring.
        - Be informative, not pushy.
        - Offer options without requiring commitment.
        - End with an open question: "Is there anything else you'd like to explore?"`;
    case 'READY_TO_BUY':
      return `
        TONE ADJUSTMENT: The caller is ready to move forward.
        - Transition confidently into scheduling.
        - Keep momentum: "Let's get that scheduled."
        - Do not delay or over-explain.`;
    default:
      return '';
  }
}
```

## Emotion-Adaptive System Prompt Assembly

```javascript
export function buildFullSystemPrompt(basePrompt, context, emotion) {
  return `
    ${basePrompt}
    
    ${buildToneModifier(emotion)}
    
    CALLER CONTEXT:
    ${context.customerMemory ? `- Returning customer: ${context.customerMemory.customer.name}` : '- New caller'}
    ${context.currentIntent ? `- Primary intent: ${context.currentIntent}` : ''}
    ${context.urgency ? `- Urgency: ${context.urgency}` : ''}
    ${context.buyingSignals ? `- Buying signals detected: ${context.buyingSignals.join(', ')}` : ''}
  `;
}
```

## Dynamic Emotion-Driven Flows

### Confusion Recovery Flow

```
1. Detect CONFUSED (from signals)
2. Ava slows down, simplifies: "Let me put that differently."
3. Check: "Does that make sense?"
4. If still confused → offer to explain via different approach or hand to human
5. When understood → clear CONFUSED state, continue
```

### Frustration De-escalation Flow

```
1. Detect FRUSTRATED
2. Brief apology: "I'm sorry you're dealing with this."
3. Solution-first: "Here's what I'll do right now — [action]."
4. Take ownership: "I'll make sure this is resolved."
5. Offer escalation if technical: "Would you like me to have a specialist call you?"
```

### Enthusiasm Momentum Flow

```
1. Detect EXCITED
2. Match: "That's wonderful to hear!"
3. Anchor to product: "FleetNimble would really help with [their use case]."
4. Bridge to booking: "It sounds like a demo is a natural next step."
```

### Explorer Flow (Anti-Push)

```
1. Detect EXPLORING
2. Provide value: answer their question completely
3. Offer: "Would you like more details on anything?"
4. If they linger: "We can explore as much as you like — no commitment."
5. Never insert a booking pitch more than once in the exploring flow.
```

## Integration Points

```
Emotion detection runs on every callerTranscript event in the conversation engine.
The emotion state is:
- Stored in ConversationContext (survives provider reconnect)
- Injected into system prompt on state transitions (via updateInstructions)
- Logged to metrics: emotion_transition events
- Included in call summary + CRM memory (sentiment field)
```

## Metrics

```javascript
metrics.recordEmotionTransition({ from, to, callSid });
metrics.recordEmotionResolved({ emotion: 'FRUSTRATED', turnsToResolve, callSid });
metrics.recordSentimentScore({ score, callSid });  // computed from emotion history
```