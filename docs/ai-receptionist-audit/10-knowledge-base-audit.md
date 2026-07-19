# Knowledge Base Audit — AI Receptionist

## Current Implementation

**File:** `receptionistKnowledgeBase.service.js`

The knowledge base is a **hardcoded JavaScript array** of plain-text strings:

```javascript
const knowledgeBase = [
  "FleetNimble offers AI-powered fleet management solutions...",
  "Our services include vehicle tracking, route optimization...",
  "For support, please contact support@fleetnimble.com or call...",
  "We are located at 123 Fleet Street, San Francisco, CA 94105...",
  "Business hours are Monday to Friday, 9 AM to 6 PM EST...",
];
```

## How It Works

The knowledge base is injected into the system prompt as a delimited text block:

```
Relevant knowledge base information:
---
{{knowledgeBase.join('\n\n')}}
---
```

## Issues

| Issue | Severity | Details |
|-------|----------|---------|
| No RAG/embeddings | HIGH | No vector search, no semantic retrieval |
| Hardcoded content | HIGH | Every call sends ALL entries; cannot be updated without code deployment |
| No tenant-specific entries | MEDIUM | Same knowledge for all tenants |
| No dynamic content | MEDIUM | Cannot query live data (e.g., current wait times, today's schedule) |
| No media/docs | MEDIUM | Cannot reference PDFs, images, or other documentation |
| Max context growth | LOW | With only 5 entries, impact is minimal, but adding 50+ static entries wastes tokens |
| No keyword filtering | LOW | All entries sent every time regardless of query relevance |

## System Prompt Context

The full system prompt sent to the provider is constructed in `receptionistRealtime.service.js`:

```
You are {businessName}'s AI receptionist...
Greeting: {greetingMessage} ...

Knowledge base:
---
{knowledgeBase.join('\n\n')}
---

Available tools:
{tool definitions JSON}

Instructions:
- Be professional, friendly, concise
- Use tools for appointments, support tickets
- If unclear, ask clarifying questions
- Do NOT make up information
- End the call politely when done
```

The prompt is assembled dynamically per call, reading from `AiReceptionistConfig` if available, or using defaults.

## Recommendations

1. **Store knowledge base in database** with tenant scoping (`companyId`)
2. **Implement vector search** using pgvector on Neon for semantic retrieval
3. **Include only relevant entries** per call by querying the provider's question context
4. **Allow per-tenant knowledge base** editing from the settings UI
5. **Add knowledge base CRUD endpoint** for the frontend settings modal
