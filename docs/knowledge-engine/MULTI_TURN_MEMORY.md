# Multi-Turn Memory

## Overview

Multi-turn memory enables the AI Receptionist to maintain conversation context throughout a single call. The system remembers the caller's name, company, fleet size, interests, topics discussed, and appointment status.

## Memory Architecture

```
receptionistMemory.service.js
  |-- findOrCreateCustomer()
  |-- getCustomerMemory()
  |-- updateCustomerAfterCall()
  |-- buildMemoryPrompt()
  |-- calculateLeadScore()
```

### Session State (per call)

The session object carries conversation state:

```js
{
  callSid: 'CAxxx',
  userId: 'user_xxx',
  customerId: 'cust_xxx',
  customerMemory: { /* from getCustomerMemory() */ },
  currentStage: 'greeting' | 'collecting_name' | 'collecting_company' | 'collecting_contact' | 'collecting_fleet_size' | 'collecting_purpose' | 'collecting_date' | 'collecting_time' | 'confirming' | 'clarifying',
  collectedData: {
    callerName: 'John',
    company: 'Acme Logistics',
    fleetSize: 25,
    phone: '+1234567890',
    email: 'john@acme.com',
    meetingPurpose: 'Product demo',
    preferredDate: '2026-07-25',
    preferredTime: '14:00',
    urgency: null,
  },
  pendingAction: 'create_appointment' | 'create_support_ticket' | null,
  conversationMode: 'sales' | 'support' | 'both',
}
```

### CRM Persistence

Customer data persists across calls via `receptionistCustomer` table:

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `userId` | UUID | Tenant owner |
| `phone` | String | E.164 format |
| `email` | String | Lowercase |
| `name` | String | Caller name |
| `companyName` | String | Company |
| `fleetSize` | Int | Vehicle count |
| `status` | Enum | LEAD, CONTACTED, QUALIFIED, etc. |
| `leadScore` | Int | 0-100 computed score |
| `totalCalls` | Int | Call counter |
| `totalAppointments` | Int | Appointment counter |
| `totalTickets` | Int | Support ticket counter |
| `lastIntent` | String | Last call intent |
| `lastSummary` | String | Last call summary |
| `lastContactAt` | DateTime | Last call timestamp |
| `sentimentHistory` | JSON[] | Sentiment over time |

## Knowledge Engine Integration

The knowledge engine uses memory context to personalize answers:

1. **Memory Context in System Prompt**: `buildMemoryPrompt()` generates a context block that's injected into the LLM's system prompt:

```
Returning caller: John Smith
Last conversation summary: Interested in GPS tracking for 25 vehicles
Last intent: pricing
Company: Acme Logistics
Fleet size: 25 vehicles
Lead score: 35
```

2. **Personalized Knowledge Answers**: The engine can factor in caller context (fleet size, interests) when ranking and presenting answers.

3. **Conversation Mode Persistence**: The `conversationMode` set during a call persists for the duration of the session. If a caller shifts from support to pricing, the mode updates accordingly.

## Conversation Flow with Memory

```
Call 1:
  Caller: "Hi, I'm John from Acme Logistics"
  AI: "Hello John! How can I help you today?"
  Caller: "Tell me about GPS tracking"
  AI: [Engine returns GPS Tracking article + proactive sales tip]
  → CRM creates customer record: John, Acme Logistics
  → Lead score: 15 (company) + 25 (fleet ~25 vehicles) = 40

Call 2 (caller identified by phone number):
  AI: "Welcome back, John! Last time we discussed GPS tracking. Would you like to continue that conversation or is there something new I can help with?"
  → CRM fetches memory, injects into system prompt
  → AI naturally acknowledges returning caller
```

## Lead Scoring

Lead score is calculated from caller data and updated after each interaction:

| Factor | Points |
|--------|--------|
| Company name provided | +15 |
| Fleet size: 5-19 | +10 |
| Fleet size: 20-99 | +25 |
| Fleet size: 100+ | +40 |
| Intent: schedule_meeting | +10 |
| Intent: pricing | +15 |
| Intent: support_request | +5 |
| Max score | 100 |

## Memory in Knowledge Answers

The knowledge engine can use caller context from memory to tailor answers:

- If fleet size is known and small (< 10 vehicles), emphasize starter plan features
- If fleet size is large (50+), emphasize enterprise features
- If returning caller had previous interest, acknowledge and build on it
