# Knowledge Content Organization

## Categories

The FleetNimble knowledge base is organized into 21 categories:

| Category | Articles | Mode Priority |
|----------|----------|---------------|
| Company | 1 | both |
| Fleet Management | 3 | both |
| GPS Tracking | 3 | both |
| Live Diagnostics | 2 | both |
| OBD Devices | 3 | support-heavy |
| Digital Twin | 2 | both |
| Maintenance | 1 | both |
| Fuel Analytics | 1 | both |
| Driver Management | 2 | both |
| Alerts | 1 | both |
| Reports | 1 | both |
| CRM | 1 | both |
| AI Assistant | 2 | both |
| AI Receptionist | 2 | both |
| Pricing | 1 | sales |
| Demo Booking | 1 | sales |
| Support | 1 | support |
| Integrations | 1 | both |
| Security | 3 | both |
| Deployment | 2 | both |
| FAQs | 3 | both |

## Article Fields

```json
{
  "id": "unique-article-id",
  "title": "Display Title",
  "category": "Category Name",
  "subcategory": "Subcategory Name",
  "keywords": ["search", "keywords", "for matching"],
  "synonyms": ["alternative", "terms"],
  "mode": "both|sales|support",
  "priority": 1-10,
  "answer": "Concise 2-3 sentence answer for voice output",
  "details": "Extended information for system prompt context",
  "relatedArticles": ["id1", "id2"],
  "proactiveSalesTip": "Optional cross-sell suggestion or null"
}
```

## Mode System

Each article has a `mode` field that controls when it's visible:

| Mode | Description |
|------|-------------|
| `both` | Visible in sales and support conversations |
| `sales` | Only visible in sales mode (pricing, demo, features) |
| `support` | Only visible in support mode (troubleshooting, setup) |

The conversation mode is determined by intent classification:
- `schedule_meeting`, `pricing_question`, `sales_interest` → sales mode
- `support_request` → support mode
- `product_question`, `general_question` → both mode (uses article's mode field)

## Proactive Sales

Articles with a `proactiveSalesTip` field enable the engine to suggest related features. Example flow:

1. Caller asks about GPS Tracking
2. Engine returns GPS Tracking answer + proactive tip about combining with Live Diagnostics
3. Orchestrator appends the tip to the response

## Priority Scoring

Priority (1-10) affects search ranking:
- 9-10: Core features, pricing, onboarding (highest visibility)
- 7-8: Major features, common questions
- 5-6: Secondary features, FAQs
- 1-4: Rarely needed topics

Priority multiplies the raw match score, so high-priority articles rank higher even with partial matches.

## Writing Guidelines

### Answer Guidelines
- 2-3 sentences maximum
- Start with the most important information
- Use natural, conversational language
- Avoid jargon unless the caller uses it first
- Include action guidance ("Go to Vehicles > Connect OBD")

### Details Guidelines
- 3-5 paragraphs for system prompt context
- Include technical details, steps, and edge cases
- Used for building the LLM's knowledge context
- Not directly spoken to caller
