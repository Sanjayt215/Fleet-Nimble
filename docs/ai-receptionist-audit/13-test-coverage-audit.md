# Test Coverage Audit — AI Receptionist

## Test Files (All in `backend/tests/`)

| File | Tests | Status |
|------|-------|--------|
| `ai-receptionist-realtime.test.js` | 38 tests | ✅ Present |
| `ai-receptionist-greeting.test.js` | 9 tests | ✅ Present |
| `receptionist-twilio.test.js` | 20 tests | ✅ Present |
| `receptionist-business-tools.test.js` | 30 tests | ✅ Present |
| `receptionist-ownership-validation.test.js` | 20 tests | ✅ Present |
| `realtime-pipeline.test.js` | 26 tests | ✅ Present |
| **Total** | **143 tests** | |

## Test Framework

- **Framework:** Jest (confirmed — `test(` and `it(` calls detected)
- **Environment:** Node.js (not jsdom)
- **Mocking:** Manual mocks for Prisma, Twilio, WebSocket, OpenAI

## Coverage Summary

### `ai-receptionist-realtime.test.js` (38 tests)
Covers session manager, provider connection, tool execution, transcripts, cleanup, error handling, state machine

| Area | Coverage |
|------|----------|
| Session lifecycle | Create, update state, invalid transitions, remove |
| Provider connection | OpenAI connect success, connect failure |
| Tool execution | Appointment booking (success + validation error) |
| Transcript handling | Buffer transcript entry, flush to database |
| Call cleanup | Normal cleanup, stale session cleanup |
| Error handling | Provider error → proper cleanup |
| State machine | Valid transitions only, invalid transitions rejected |

### Coverage Gaps

| Area | Tests | Gap |
|------|-------|-----|
| Twilio webhook handling | ❌ | No tests for `handleIncomingCall`, `handleStatusCallback`, `handlePostStream` |
| TwiML generation | ❌ | No tests for `buildIncomingTwiML` or `buildStreamStatusUrl` |
| Audio codec | ❌ | No tests for `decodeG711ulaw`, `encodeG711ulaw`, or `audioResampler` |
| Audio bridge | ❌ | No tests for `audioBridge.js` functions |
| Media stream handler | ❌ | No tests for `handleMediaStream` WebSocket message parsing |
| Provider factory | ❌ | No tests for provider selection logic |
| Knowledge base | ❌ | No tests for knowledge base content or integration |
| Orchestrator (full) | ❌ | Tests cover basic tool execution but not: missing fields, DB errors, concurrent calls |
| CRM service | ❌ | No tests for `lookupCustomer` or `upsertCustomer` |
| Appointment service | ❌ | No tests for `createAppointment` DB logic |
| Support service | ❌ | No tests for `createSupportTicket` |
| Notification service | ❌ | No tests (stubs don't need tests, but the caller code does) |
| Provider health | ❌ | No tests for fatal vs transient classification |
| Google Calendar | ❌ | No tests for `createCalendarEvent` |
| Other test files (105 tests total) | ❌ | Not yet reviewed — 5 more test files exist (greeting, twilio, business-tools, ownership-validation, pipeline) |

## Test Infrastructure Issues

| Issue | Details |
|-------|---------|
| MongoDB mock instead of Prisma | `global.MongoClient` mock suggests tests were written for MongoDB, but production uses Prisma/PostgreSQL |
| No integration tests | All tests are unit tests with mocked dependencies |
| No end-to-end tests | No test that exercises the full pipeline (Twilio → WebSocket → Provider → DB) |
| No audio tests | No test verifies audio encoding/decoding correctness |
| No WebSocket tests | No test for the media stream WebSocket server |
