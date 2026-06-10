# FleetNimble UI → Feature Mapping

| Current UI | FleetNimble Feature | Data Source |
|------------|---------------------|-------------|
| `StatCard` | Fleet KPI metrics | `/api/dashboard/stats` |
| `LineChart` (Dashboard) | Live RPM/speed | Socket `live:update` |
| `VehicleStatusBadge` | Online/offline/MQTT | `telemetryHealth` on vehicle |
| `DataTable` | Vehicle/DTC/fuel tables | REST CRUD |
| `GaugeChart` | OBD live gauges | `/obd/latest` + socket |
| `OBDHistoryChart` | Telemetry history | `/obd/history` |
| `Layout` sidebar | 8 approved modules | React Router |
| `useSocket` | Realtime gateway | Socket.IO |

## Approved navigation (8 pages)

1. `/dashboard` — Dashboard  
2. `/vehicles` — Vehicles  
3. `/diagnostics` — Live Diagnostics  
4. `/dtc` — DTC Codes  
5. `/fuel` — Fuel Management  
6. `/maintenance` — Maintenance  
7. `/drivers` — Drivers  
8. `/reports` — Reports & Alerts  

Legacy routes retained (no nav link): `/trips`, `/work-orders`, `/vehicles/:id/live`, `/admin`, `/settings`
