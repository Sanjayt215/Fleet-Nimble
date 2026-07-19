# Sales & Support Modes

## Overview

The Knowledge Engine supports two conversation modes that control:
- Which articles are visible
- How answers are presented
- Whether proactive sales suggestions are included
- The fallback response when no answer is found

## Mode Detection

Mode is determined automatically by intent classification:

```
Caller says: "How much does GPS tracking cost?"
  → classifyIntent() → pricing_question
  → conversationMode = 'sales'
  → Engine filters to sales-mode articles
  → Includes proactive sales tips

Caller says: "My OBD device won't connect"
  → classifyIntent() → support_request
  → conversationMode = 'support'
  → Engine filters to support-mode articles
  → Returns support-focused answer
```

## Mode Behavior Matrix

| Aspect | Sales Mode | Support Mode | Both Mode |
|--------|------------|--------------|-----------|
| Article visibility | `sales` + `both` | `support` + `both` | All articles |
| Proactive sales | Enabled | Disabled | Disabled |
| Unknown fallback | Suggest demo | Create ticket | General fallback |
| Answer tone | Value-focused, benefit-oriented | Empathetic, solution-oriented | Neutral, informative |
| Cross-sell | Natural mentions | Not mentioned | Not mentioned |

## Article Mode Assignment

Guidelines for assigning modes to knowledge articles:

### Sales Mode (`"mode": "sales"`)
- Pricing and plans
- Feature benefits and value propositions
- Competitive advantages
- ROI and cost savings
- Demo booking
- Enterprise capabilities

### Support Mode (`"mode": "support"`)
- Troubleshooting guides
- Setup and installation steps
- Error resolution
- Hardware connection issues
- Common technical problems

### Both Mode (`"mode": "both"`)
- Product overviews
- Feature descriptions (neutral)
- GPS tracking, diagnostics, maintenance
- Company information
- General FAQs

## Proactive Sales Flow

1. Caller asks about Feature A (e.g., GPS Tracking)
2. Engine finds the matching article
3. Engine checks `proactiveSalesTip` field
4. If present AND mode is 'sales', appends tip to answer
5. Example output:
   > "GPS Tracking shows all your vehicles on a live map... GPS Tracking becomes even more powerful when combined with Live Diagnostics — you can see not just where a vehicle is, but how it's performing in real time."

## Safety Rules

```
KNOWLEDGE RULES for LLM:
- Only answer from verified FleetNimble knowledge
- Never invent prices, features, specifications, or capabilities
- If caller asks about something not in knowledge base:
  - Sales mode: "I don't have specific information... Would you like to schedule a demo?"
  - Support mode: "I don't have troubleshooting information... Let me create a support ticket."
  - Both mode: "I don't have verified information... Let me connect you with a specialist."
- For technical issues not covered, always create a support ticket
- Keep answers concise — 2-3 sentences maximum for phone
```
