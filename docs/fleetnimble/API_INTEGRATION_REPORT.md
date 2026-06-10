# API Integration Report

All frontend data uses `frontend/src/services/api.js` (axios + JWT refresh).

| Module | Primary endpoints |
|--------|-------------------|
| Auth | `POST /api/auth/login`, refresh, logout |
| Dashboard | `GET /api/dashboard/stats` |
| Vehicles | `/api/vehicles`, `/api/vehicles/:id` |
| OBD | `/api/obd/latest/:id`, `/api/obd/history/:id` |
| DTC | `/api/dtc/:id`, `/api/dtc/history/:id`, `POST /api/dtc/clear` |
| Fuel | `/api/fuel/:vehicleId`, `POST /api/fuel` |
| Maintenance | `/api/maintenance/:vehicleId` |
| Drivers | `/api/drivers/scores` |
| Reports | `/api/reports/*` |
| Alerts | `/api/alerts/:vehicleId`, `PUT /api/alerts/:id/read` |

No mock interceptors in production build.
