# Frontend State & Components — AI Receptionist

## Route Structure

All AI Receptionist pages are under `/app/ai-receptionist/` in the React app.

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` (default) | `AIReceptionist.jsx` | Main dashboard with all panels |
| `/simulate-call` | `SimulateCallModal.jsx` | Test simulation without calling the phone |

## Main State (`AIReceptionist.jsx`)

The main component manages these state variables:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  AIReceptionist.jsx State                                                    │
│                                                                              │
│  • activeTab: 'live' | 'analytics' | 'history' | 'settings'                │
│  • calls: array of aiReceptionistCall records (fetched from API)            │
│  • appointments: array of aiReceptionistAppointment records                 │
│  • tickets: array of aiReceptionistSupportTicket records                    │
│  • loading: boolean                                                         │
│  • error: string | null                                                     │
│  • showSettings: boolean (settings modal)                                   │
│  • showSimulate: boolean (simulate call modal)                              │
│  • selectedCall: object | null (for call detail modal)                      │
│  • selectedAppointment: object | null (for appointment modal)               │
│  • selectedTicket: object | null (for ticket modal)                         │
│  • agentActive: boolean (browser voice agent status)                        │
│  • wsStatus: string (Socket.IO connection status)                           │
│  • callFilters: object (status, date range, searchQuery)                    │
│  • pagination: { page, limit, total }                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Lifecycle

```
Component Mount
  ↓
Initialize Socket.IO connection (ws.js or direct)
  ↓
Fetch initial data:
  ├── GET /api/ai-receptionist/live-calls
  ├── GET /api/ai-receptionist/appointments
  └── GET /api/ai-receptionist/support-tickets
  ↓
Socket.IO event handlers:
  ├── 'call:new' → prepend to calls array, show notification
  ├── 'call:update' → update call in array
  ├── 'call:ended' → update status in array
  ├── 'appointment:new' → prepend to appointments
  └── 'ticket:new' → prepend to tickets
  ↓
Component Unmount
  ↓
Disconnect Socket.IO
```

## Sub-Components

| Component | Props | Behavior |
|-----------|-------|----------|
| `LiveCallsPanel.jsx` | `calls`, `onSelectCall`, `wsStatus` | Shows active calls table with timer; Socket.IO connection status indicator |
| `CallDetailModal.jsx` | `call`, `onClose` | Shows full call detail, transcript, timeline, recordings, related appointments/tickets; loads full transcript on open (lazy) |
| `AppointmentModal.jsx` | `appointment`, `onClose`, `onUpdate` | Shows/edit appointment details; status update actions |
| `SupportTicketModal.jsx` | `ticket`, `onClose`, `onUpdate` | Shows/edit ticket details; status update actions |
| `SimulateCallModal.jsx` | `onClose` | Standalone call simulation for testing; generates conversations without PSTN |
| `ReceptionistSettingsModal.jsx` | `onClose`, `onSave` | Business hours, greeting, voice style, feature flags |
| `AnalyticsCards.jsx` | `data` | Summary cards (total calls, answered, missed, appointments booked, tickets created) |
| `VoiceReceptionistAgent.jsx` | `active`, `onStatusChange` | Browser-based voice agent using Web Speech API (separate from PSTN flow) |
| `AIPhoneConsole.jsx` | `-` | Alternative phone console UI with dialer |

## Data Flow

```
User Action → API Call (fetch/axios) → Backend → DB → Response → Update State → Re-render

Socket.IO Event → Handler → Update State → Re-render
```

## Auth & API Calls

- All API calls include JWT token from `AuthContext`
- API base URL from `VITE_API_URL` environment variable
- Socket.IO connects to the same host
- Calls are scoped by user/company (backend tenant resolver filters results)
