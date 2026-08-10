# FleetNimble AI Receptionist — Appointment Booking Upgrade

## Goal

Transform appointment collection from mechanical field-by-field interrogation into a natural, human receptionist conversation.

## The Conversation Flow

```
May I have your full name?
        ↓
"Thank you, [Name]."
May I know your company name?
        ↓
"Thank you."
What email address should we use for the confirmation?
        ↓
"Great."
Could I also have the best phone number to reach you?
        ↓
"Got it."
Approximately how many vehicles are in your fleet?
        ↓
"Understood."
When would you prefer to schedule your demo?
        ↓
Morning or afternoon?  (if date given)
        ↓
"Let me read back everything to make sure I have it right.
[Name], [Company], [Email], [Phone], [Fleet Size] vehicles, [Date] at [Time].
Have I captured everything correctly?"
        ↓
CONFIRMATION: "Yes"
        ↓
execute createAppointment()
        ↓
"Wonderful.
Your FleetNimble demo has been booked successfully.
Our team will contact you shortly.
You'll receive a confirmation by email and SMS."
```

## Guardrails (Non-Negotiable)

| Rule | Enforcement |
|------|-------------|
| One field per turn | State handler collects exactly one field, then ends turn |
| Acknowledge before next question | Each field response gets an acknowledgement |
| No `createAppointment()` before confirmation | Tool call is only permitted from APPOINTMENT_CONFIRMATION state after explicit "yes" |
| Read back ALL details | Full summary before asking "Have I captured everything correctly?" |
| Never stack questions | Never "What's your name and company and email?" |
| Confirmations via natural language | "Yes", "That's right", "Looks good", "Correct" all accepted |

## Field Collection Order & Prompts

| # | Field | Prompt | Ack After |
|---|-------|--------|-----------|
| 1 | callerName | "May I have your full name?" | "Thank you, {name}." |
| 2 | company | "May I know your company name?" | "Thank you." |
| 3 | email | "What email address should we use for the confirmation?" | "Great." |
| 4 | phone | "Could I also have the best phone number to reach you?" | "Got it." |
| 5 | fleetSize | "Approximately how many vehicles are in your fleet?" | "Understood." |
| 6 | preferredDate | "When would you prefer to schedule your demo?" | Date-specific ack |
| 7 | preferredTime | "Morning or afternoon?" (or open time question) | Time-specific ack |
| 8 | — | Read back + "Have I captured everything correctly?" | Wait for confirmation |

## Smart Follow-ups

```javascript
export const APPOINTMENT_FOLLOW_UPS = {
  dateGiven: [
    "Morning or afternoon?",
    "Would the morning or afternoon work better for you?",
  ],
  vagueDate: [
    "Do you have a specific day in mind, or would next week work?",
    "What day suits you best — this week or next?",
  ],
  dateConflict: [
    "That slot appears to be taken. Would another day work for you?",
    "We're booked at that time. How about the following day?",
  ],
  timeVague: [
    "Would a morning or afternoon slot suit you better?",
    "What time of day tends to work best for you?",
  ],
  repeatField: [
    // After readback, if a field is wrong:
    "No problem at all. Which part would you like to correct?",
    "Let's fix that — what should the correct [field] be?",
  ],
};
```

## Confirmation Readback Template

```javascript
export function buildReadback(details) {
  const parts = [];
  parts.push(`${details.callerName}`);
  if (details.company) parts.push(`from ${details.company}`);
  if (details.email) parts.push(`email ${details.email}`);
  if (details.phone) parts.push(`phone ${details.phone}`);
  parts.push(`${details.fleetSize || 'your'} vehicles`);
  if (details.preferredDate) parts.push(`on ${details.preferredDate}`);
  if (details.preferredTime) parts.push(`at ${details.preferredTime}`);

  return `Let me read back everything to make sure I have it right. ${parts.join(', ')}. Have I captured everything correctly?`;
}
```

## Post-Creation Confirmation Template

```javascript
export const APPOINTMENT_CREATED_REPLIES = [
  `Wonderful. Your FleetNimble demo has been booked successfully. Our team will contact you shortly. You'll receive a confirmation by email and SMS.`,
  `Perfect — your demo is confirmed. Our team will reach out soon, and you'll get a confirmation by email and SMS.`,
];

// Variants rotate per call to avoid identical wording across calls.
// Core information (booked successfully, team contacts, email+SMS) is always present.
```

## Confirmation Intent Detection

```javascript
export const CONFIRMATION_PHRASES = [
  'yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'correct', 'right',
  'that is right', "that's right", 'that is correct', "that's correct",
  'looks good', 'sounds good', 'go ahead', 'please do', 'confirm',
  'book it', 'schedule it', 'do it', 'perfect',
];

export const DENIAL_PHRASES = [
  'no', 'nope', 'nah', 'not right', 'wrong', 'incorrect',
  'actually', 'wait', 'hold on', 'that is not right', 'i meant',
  'change', 'different',
];
```

## Denial / Correction Handling

```
Caller: "No, the email is sarah@acme.com"
Ava:  "I appreciate the correction. I've updated it to sarah@acme.com.
       Let me confirm the rest: [remaining details].
       Have I captured everything correctly?"
```

```
Caller: "Actually, the date doesn't work. Can we do Thursday?"
Ava:  "Of course. Let's move it to Thursday. And would morning or afternoon work better?"
```

## State Mapping (Finite-State Engine Integration)

```
APPOINTMENT_COLLECTION (field by field, self-loop per field)
  └── all fields captured → APPOINTMENT_CONFIRMATION
        ├── confirmed → TOOL_EXECUTION (createAppointment)
        │     └── success → SUMMARY → GOODBYE
        └── denied/corrected → APPOINTMENT_COLLECTION (correction loop)
```

## Duplicate Prevention

- `createAppointment()` may only be invoked from `TOOL_EXECUTION` state with `requiresConfirmation: true` payload.
- Idempotency key: `callSid + collectedData hash` — a confirmed action never runs twice.
- If caller says "yes" after the appointment already exists → "You're all set! Your demo is already booked for [date/time]. Is there anything else I can help with?"