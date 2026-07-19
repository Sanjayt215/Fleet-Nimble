# Testing Guide

## Test Categories

### 1. Knowledge Only
Tests that the AI Receptionist uses the Knowledge Engine for product questions, not live data.

**Test cases**:
- "What is FleetNimble?" → Knowledge Engine → Company overview
- "Tell me about GPS tracking" → Knowledge Engine → GPS tracking article
- "How does Live Diagnostics work?" → Knowledge Engine → Live diagnostics article
- "What are your pricing plans?" → Knowledge Engine → Pricing article (sales mode)

**Expected**: Answers come from knowledge base, no tool calls to live data services.

### 2. Live Data Only
Tests that the AI uses live tools for real-time fleet data.

**Test cases**:
- "How many vehicles do I have?" → `get_fleet_summary` → live count
- "Is my fleet healthy?" → `get_fleet_summary` → health score
- "Where is vehicle ABC123?" → `get_vehicle_status` → GPS location
- "Any check engine lights?" → `get_live_diagnostics` → active DTCs
- "How many support tickets are open?" → `get_support_ticket_status` → ticket count

**Expected**: AI calls the appropriate tool, receives JSON, and responds with natural language.

### 3. Knowledge + Live Data Combined
Tests the transition from knowledge to live data in a single conversation.

**Test case flow**:
1. Caller: "What is Live Diagnostics?"
2. AI: [Knowledge Engine answer about Live Diagnostics]
3. Caller: "How many vehicles currently have diagnostics alerts?"
4. AI: [calls `get_alert_summary` or `get_live_diagnostics` with appropriate vehicle]

**Expected**: Smooth transition from static knowledge to live data query.

### 4. Appointment Flow
Tests end-to-end appointment scheduling.

**Flow**:
1. Caller: "I want to book a demo"
2. AI: "May I know your name?"
3. Caller: "John Smith"
4. AI: "Which company are you with?"
5. Caller: "Acme Logistics"
6. AI: [continues collecting details one at a time]
7. AI: [summarizes and asks for confirmation]
8. Caller: "Yes, please schedule it"
9. AI: [creates appointment → returns confirmation]

**Verification**: Appointment appears in CRM via `get_demo_schedule`.

### 5. CRM Flow
Tests customer lookup and management.

**Flow**:
1. Caller calls, AI uses `lookup_customer` by phone
2. AI: "Welcome back, John!"
3. Caller: "What's our lead status?"
4. AI: [calls `get_customer_information`]
5. AI: "Your lead score is 40, status is Qualified"

### 6. Support Flow
Tests support ticket creation and status checking.

**Flow**:
1. Caller: "I need help with my OBD device"
2. AI: "May I know your name?"
3. Caller: "John Smith"
4. AI: [collects issue details]
5. AI: [summarizes and confirms]
6. Caller: "Yes"
7. AI: [creates ticket]
8. Caller: "How many open tickets do I have?"
9. AI: [calls `get_support_ticket_status`]

### 7. Fleet Flow
Tests fleet-level data queries.

**Test cases**:
- "Give me a fleet overview" → `get_dashboard_statistics`
- "What's the health of my fleet?" → `get_fleet_summary`
- "Which vehicles need maintenance?" → `get_maintenance_schedule`
- "Any critical alerts?" → `get_alert_summary`
- "Show me recent fleet activity" → `get_recent_activity`

### 8. Dashboard Statistics
Tests the comprehensive dashboard endpoint.

**Test case**:
- "Give me the full picture of my fleet"
- Calls `get_dashboard_statistics` which internally calls 5+ live data functions
- Returns combined fleet + alerts + maintenance + demos + support data

## Testing the Live Data Service Directly

Unit tests can be written against `liveData.service.js`:

```js
import * as liveData from './liveData.service.js';

// Test fleet summary
const summary = await liveData.getFleetSummary('test-user-id');
console.assert(summary.totalVehicles >= 0);
console.assert(summary.healthScore >= 0 && summary.healthScore <= 100);

// Test vehicle status
const vehicle = await liveData.getVehicleStatus('test-user-id', 'ABC123');
console.assert(vehicle.plateNumber === 'ABC123');

// Test error handling
try {
  await liveData.getVehicleStatus('test-user-id', null);
} catch (err) {
  console.assert(err.name === 'ValidationError');
}
```

## Testing the Tools via Provider

The tools can be tested by calling the provider directly with a functionCall:

```json
{
  "toolCall": {
    "functionCalls": [{
      "name": "get_fleet_summary",
      "args": {},
      "id": "test-1"
    }]
  }
}
```

Expected response:
```json
{
  "success": true,
  "data": { "totalVehicles": 25, ... }
}
```

## Automated Test Scenarios

| Scenario | Tools Called | Expected Result |
|----------|-------------|-----------------|
| Fleet summary | get_fleet_summary | Fleet stats JSON |
| Vehicle lookup | get_vehicle_status | Vehicle detail JSON |
| Driver info | get_driver_information | Driver score data |
| Live diagnostics | get_live_diagnostics | OBD telemetry + DTCs |
| Maintenance | get_maintenance_schedule | Due tasks list |
| Alerts | get_alert_summary | Alert counts by severity |
| Customer lookup | get_customer_information | Customer profile |
| Demo schedule | get_demo_schedule | Upcoming appointments |
| Support tickets | get_support_ticket_status | Ticket counts |
| Dashboard | get_dashboard_statistics | Combined overview |
| Recent activity | get_recent_activity | Activity feed |
