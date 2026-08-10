# FleetNimble AI Receptionist — Conversation Intelligence Upgrade

## Goal

Move beyond keyword matching toward robust, multi-dimensional understanding of the caller: intent, customer status, buying signals, urgency, and emotion.

## Detection Dimensions

### 1. Intent Detection

| Intent | Examples | Confidence Signals |
|--------|----------|--------------------|
| Sales | "I'm looking to upgrade my fleet tracking" | Buying language + fleet context |
| Support | "My dashboard isn't loading" | Problem + product reference |
| Pricing | "How much does it cost?" | Price/cost/plan keywords |
| Features | "Does it do driver behavior?" | Capability questions |
| Technical | "How does the GPS integration API work?" | Implementation questions |
| Small Talk | "It's a beautiful day out there" | No business intent |
| Emergency | "We had a breakdown on the highway" | High-risk signals |
| Booking | "I'd like to schedule a demo" | Direct booking language |

```javascript
export const INTENT_WEIGHTS = {
  // Each intent scored across multiple dimensions:
  // keywords, context (state), history, business-entity references
  SALES: { keywords: ['upgrade', 'looking for', 'evaluate', 'switch', 'replace', 'procure'], weight: 1.5 },
  SUPPORT: { keywords: ['not working', 'broken', 'error', 'fails', 'down'], weight: 1.5 },
  PRICING: { keywords: ['price', 'cost', 'plan', 'per vehicle', 'monthly'], weight: 1.2 },
  FEATURES: { keywords: ['does it', 'can it', 'feature', 'capability', 'support'], weight: 1.0 },
  TECHNICAL: { keywords: ['api', 'integration', 'sdk', 'webhook', 'deploy'], weight: 1.0 },
  SMALL_TALK: { keywords: ['weather', 'nice day', 'how are you', 'happy friday'], weight: 0.5 },
  EMERGENCY: { keywords: ['breakdown', 'accident', 'stranded', 'urgent'], weight: 3.0 },
  BOOKING: { keywords: ['schedule', 'book', 'demo', 'meeting'], weight: 1.5 },
};

// Best intent wins by score; ties resolved by context state + history.
```

### 2. Customer Status

```
NEW CUSTOMER (no CRM record):
  → "I don't believe we've spoken before — I'm glad you found us!"
  → Light-touch discovery. Ask open questions. Never push.

RETURNING CUSTOMER (CRM record found):
  → "Welcome back, [Name]."
  → Reference last conversation: "Last time we discussed [topic]."
  → Reference open items: "I see we have an open ticket regarding [issue]."
  → Faster path to action: they know the product.
```

### 3. Buying Signals

```javascript
export const BUYING_SIGNALS = [
  // Budget
  'budget', 'cost per', 'annual spend', 'price per vehicle',
  // Authority
  'i decide', 'my team uses', 'i run', 'i manage', 'our operations',
  // Need
  'we need', 'we have to', 'our problem is', 'we are struggling',
  // Timeline
  'by next month', 'before q', 'this quarter', 'asap', 'soon',
  // Evaluation
  'compare', 'we are evaluating', 'we tested', 'piloting',
  // Size signals
  '50 trucks', 'our fleet of', 'vehicles',
];
```

```
Buying signal detected → transition naturally toward APPOINTMENT_COLLECTION.
Non-pushy bridge: "It sounds like FleetNimble could fit well with how you operate.
Would you like to see it in action?"
```

### 4. Urgency

```javascript
export const URGENCY_DETECTION = {
  HIGH: ['asap', 'immediately', 'today', 'urgent', 'down right now', 'cannot work', 'stopped'],
  MEDIUM: ['soon', 'this week', 'by friday', 'important'],
  LOW: ['whenever', 'no rush', 'eventually', 'exploring'],
};

// HIGH urgency → support escalation or fast-track booking.
// Add urgency field to ticket/appointment payload.
```

## Business Introduction (Dynamic, Never Memorized)

### "Tell me about FleetNimble"

```
Build the introduction from live capabilities, selecting 2-3 most relevant
to the caller's context. Never read a fixed paragraph. Never repeat identical
wording across calls.

Template (choose from pools, weighted by detected context):

"FleetNimble brings your entire operation into one view — live GPS tracking,
driver behavior, maintenance alerts, and vehicle health, all in real time.
[If fleet context: "With fleets of [their size], you'd see..."]
Plus, our AI layer handles the repetitive work — automated alerts, predictive
maintenance, and even an AI receptionist that answers your customer calls.
Would you like me to focus on any part of that?"
```

### "Why should I choose FleetNimble?"

```
Explain across capability pillars (dynamic assembly, order varies per call):

1. Fleet Tracking & GPS Monitoring — real-time location, geofences, routes
2. Driver Analytics — behavior scoring, coaching, safety
3. Maintenance — predictive alerts, service schedules, repair history
4. CRM — customer records, follow-ups, pipeline
5. AI Sales Copilot — coaching, next-best-action for your sales team
6. Marketing Automation — campaigns, lead capture
7. AI Receptionist — answers calls, books demos, creates tickets automatically

Pick 2-3 most relevant to this caller. Offer a demo as the natural next step.
```

## Small Talk Handling

```
NEVER dismiss small talk. Play along briefly, then bridge back naturally.

Caller: "It's a beautiful day out there."
Ava:   "It really is — I hope you're getting to enjoy it.
       In the meantime, how can I help you today?"
```

```
Caller: "How are you?"
Ava:   "I'm doing wonderfully, thank you for asking. What can I do for you today?"
```

## Multi-Intent Handling

```javascript
// When caller expresses multiple needs, capture both:
// "I need help with my GPS and I also want pricing."
// → Primary: SUPPORT, Secondary: PRICING
// Acknowledge both, handle primary, then: "And regarding the pricing question you mentioned — [resolve]."
```

## Context-Aware Response Assembly

```javascript
// Instead of single hardcoded strings, responses are assembled from:
// context state + detected intent + caller status + emotion + variant pool
// Example:
export function assembleAppointmentConfirmation({ callerName, company, date, time }) {
  const openers = pickRandom(APPOINTMENT_CREATED_REPLIES);
  return `${openers}`;
}
```

## Anti-Repetition Engine

```javascript
export const ANTI_REPETITION = {
  // Track per-call and per-customer-used phrases.
  // A variant pool of at least 3 options per response type.
  // Cross-call: seed variant selection with customer ID hash so the same
  // customer never hears the same phrasing on consecutive calls.
  pickVariant(pool, key, customerId) {
    const seed = hash(`${customerId}:${key}`);
    const used = recentlyUsed.get(key) || [];
    const available = pool.filter((v, i) => !used.includes(i));
    const idx = available.length ? (seed % available.length) : 0;
    const chosen = available[idx] ?? pool[idx];
    recentlyUsed.set(key, [...used, pool.indexOf(chosen)].slice(-3));
    return chosen;
  },
};
```