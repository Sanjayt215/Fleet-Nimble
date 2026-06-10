-- Cleanup script: keep only the 25 demo vehicles seeded by backend/prisma/seed.js
-- Run as: psql -U fleet -d fleet_db -f cleanup_25_vehicles.sql

BEGIN;

-- Allowed vehicle IDs (25 seeded vehicles)
\set allowed_ids '''00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-000000000107','00000000-0000-0000-0000-000000000108','00000000-0000-0000-0000-000000000109','00000000-0000-0000-0000-000000000110','00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000112','00000000-0000-0000-0000-000000000113','00000000-0000-0000-0000-000000000114','00000000-0000-0000-0000-000000000115','00000000-0000-0000-0000-000000000116','00000000-0000-0000-0000-000000000117','00000000-0000-0000-0000-000000000118','00000000-0000-0000-0000-000000000119','00000000-0000-0000-0000-000000000120','00000000-0000-0000-0000-000000000121','00000000-0000-0000-0000-000000000122','00000000-0000-0000-0000-000000000123','00000000-0000-0000-0000-000000000124','00000000-0000-0000-0000-000000000125'''

-- Safety: show counts before
SELECT 'Counts before cleanup' AS note;
SELECT 'vehicles' AS table, count(*) FROM vehicles;
SELECT 'vehicle_live_state' AS table, count(*) FROM vehicle_live_state;
SELECT 'driver_behavior_events' AS table, count(*) FROM driver_behavior_events;
SELECT 'trip_logs' AS table, count(*) FROM trip_logs;

-- Remove dependent records referencing removed vehicles
DELETE FROM vehicle_live_state WHERE vehicle_id NOT IN (SELECT UNNEST(ARRAY[:allowed_ids]::text[]));
DELETE FROM driver_behavior_events WHERE vehicle_id NOT IN (SELECT UNNEST(ARRAY[:allowed_ids]::text[]));
DELETE FROM trip_logs WHERE vehicle_id NOT IN (SELECT UNNEST(ARRAY[:allowed_ids]::text[]));
DELETE FROM gps_history WHERE vehicle_id NOT IN (SELECT UNNEST(ARRAY[:allowed_ids]::text[]));
DELETE FROM fuel_logs WHERE vehicle_id NOT IN (SELECT UNNEST(ARRAY[:allowed_ids]::text[]));
DELETE FROM maintenance_logs WHERE vehicle_id NOT IN (SELECT UNNEST(ARRAY[:allowed_ids]::text[]));
DELETE FROM fuel_history WHERE vehicle_id NOT IN (SELECT UNNEST(ARRAY[:allowed_ids]::text[]));
DELETE FROM alerts WHERE vehicle_id NOT IN (SELECT UNNEST(ARRAY[:allowed_ids]::text[]));
DELETE FROM driver_scores WHERE vehicle_id NOT IN (SELECT UNNEST(ARRAY[:allowed_ids]::text[]));
DELETE FROM geofence_events WHERE vehicle_id NOT IN (SELECT UNNEST(ARRAY[:allowed_ids]::text[]));
DELETE FROM telematics_devices WHERE vehicle_id NOT IN (SELECT UNNEST(ARRAY[:allowed_ids]::text[]));

-- Finally delete vehicles not in allowed list (will cascade where FK has ON DELETE CASCADE)
DELETE FROM vehicles WHERE id NOT IN (SELECT UNNEST(ARRAY[:allowed_ids]::text[]));

-- Show counts after
SELECT 'Counts after cleanup' AS note;
SELECT 'vehicles' AS table, count(*) FROM vehicles;
SELECT 'vehicle_live_state' AS table, count(*) FROM vehicle_live_state;
SELECT 'driver_behavior_events' AS table, count(*) FROM driver_behavior_events;
SELECT 'trip_logs' AS table, count(*) FROM trip_logs;

COMMIT;

-- NOTE: Review results before running in production. Backup DB prior to running.
