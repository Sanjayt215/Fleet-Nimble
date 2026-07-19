# Business Workflows

## Overview

The AI Receptionist supports business workflows by combining existing business tools (appointment scheduling, support tickets, CRM) with new live data tools (fleet status, diagnostics, maintenance).

## Supported Workflows

### 1. Book a Demo

```
Caller: "I want to see a demo"
  → classifyIntent → schedule_meeting
  → Sales mode activated
  → AI collects: name → company → fleet size → phone/email → purpose → date → time
  → AI summarizes and confirms
  → Caller confirms
  → create_appointment tool executes
  → Appointment created in CRM
  → Confirmation sent via SMS/email
  → Caller can verify via get_demo_schedule
```

**Tools used**: `create_appointment`, `get_demo_schedule`

### 2. Check Appointment Status

```
Caller: "Do I have any demos scheduled?"
  → classifyIntent → general_question
  → get_demo_schedule tool executes
  → AI: "You have 3 upcoming demos. The next one is tomorrow at 2pm with Jane from Acme Logistics."
```

**Tools used**: `get_demo_schedule`

### 3. Cancel / Reschedule Appointment

```
Caller: "I need to cancel my demo"
  → classifyIntent → general_question
  → AI confirms identity
  → get_customer_information to find customer
  → get_demo_schedule to find their appointments
  → Looks up appointment via CRM
  → Updates status (requires new updateAppointment tool or human handoff for complex changes)
```

**Tools used**: `get_customer_information`, `get_demo_schedule`

### 4. Create Support Ticket

```
Caller: "I have a problem with my OBD device"
  → classifyIntent → support_request
  → Support mode activated
  → get_alert_summary or get_live_diagnostics (optional — check if vehicle issue)
  → AI collects: name → issue → contact → urgency
  → AI summarizes and confirms
  → Caller confirms
  → create_support_ticket executes
  → Ticket created
  → Caller can verify via get_support_ticket_status
```

**Tools used**: `create_support_ticket`, `get_support_ticket_status`, `get_live_diagnostics`

### 5. Update Support Ticket

```
Caller: "What's the status of my support ticket?"
  → classifyIntent → general_question
  → get_support_ticket_status(ticketId)
  → AI: "Your ticket is currently In Progress. It was priority High."
```

**Tools used**: `get_support_ticket_status`

### 6. Add CRM Note

```
Caller: "Can you note that I called about GPS tracking?"
  → AI saves note via save_customer_note tool
  → Note is visible in CRM
```

**Tools used**: `save_customer_note`, `get_customer_information`

### 7. Lookup Customer

```
Caller: "Do we have a customer named John from Acme?"
  → get_customer_information(name: "John", company: "Acme")
  → AI: "Yes, John Smith from Acme Logistics. Lead score 40, last contact 2 days ago."
```

**Tools used**: `get_customer_information`

### 8. Fleet Health Check

```
Caller: "How's my fleet doing today?"
  → get_fleet_summary()
  → AI: "Your fleet has 25 vehicles, 18 online, 5 offline. Health score is 72 — Moderate.
         There's 1 critical alert and 4 maintenance items due."
  → Proactive: "Would you like me to show you the critical alerts or maintenance items?"
```

**Tools used**: `get_fleet_summary`, `get_alert_summary`, `get_maintenance_schedule`

### 9. Vehicle Troubleshooting

```
Caller: "My Ford Transit is acting up"
  → get_vehicle_status("Ford Transit")
  → AI: "I found the vehicle. It's currently online. Live diagnostics show RPM 2200,
         coolant temp 95°C which is slightly high. There's one active DTC code: P0420.
         Would you like me to schedule maintenance or create a support ticket?"
  → Transition to support flow
```

**Tools used**: `get_vehicle_status`, `get_live_diagnostics`, `create_support_ticket`

### 10. Driver Performance Review

```
Caller: "How are my drivers performing?"
  → get_fleet_summary()
  → AI needs a specific vehicle: "Which vehicle's driver would you like to check?"
  → Caller: "ABC123"
  → get_driver_information("ABC123")
  → AI: "The driver of ABC123 has an average score of 85. There were 3 harsh braking events last week."
```

**Tools used**: `get_driver_information`, `get_fleet_summary`

## Context Awareness

The AI maintains conversation context to handle follow-up questions:

**Example:**
```
Caller: "How many vehicles?"
  → get_fleet_summary → "25 vehicles"
Caller: "How many are online?"
  → Context: still referring to the fleet
  → AI uses the cached result or calls get_fleet_summary again
  → "18 are online right now"
Caller: "What about maintenance?"
  → Context: same fleet
  → get_maintenance_schedule → "4 items are due"
```

## Intent → Workflow Mapping

| User Intent | Example Phrases | Tools Used |
|-------------|----------------|------------|
| Fleet overview | "How's my fleet?", "Fleet status" | get_fleet_summary |
| Vehicle check | "Where's my van?", "Check ABC123" | get_vehicle_status |
| Diagnostics | "Any engine codes?" | get_live_diagnostics |
| Maintenance | "What's due for service?" | get_maintenance_schedule |
| Alerts | "Any problems?" | get_alert_summary |
| Customer lookup | "Find John Smith" | get_customer_information |
| Company info | "Tell me about my account" | get_company_information |
| Demos | "Show my appointments" | get_demo_schedule |
| Support tickets | "How many open tickets?" | get_support_ticket_status |
| Full picture | "Dashboard overview" | get_dashboard_statistics |
| Recent activity | "What's new?" | get_recent_activity |
| Driver behavior | "How's my driver?" | get_driver_information |
