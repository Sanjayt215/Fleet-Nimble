-- Safe cleanup: delete records for vehicles not in allowed list; checks table existence first
-- Run with: psql -U fleet -d fleet_db -f cleanup_25_vehicles_safe.sql

-- Allowed IDs list (25 vehicles)
\set allowed '''00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-000000000107','00000000-0000-0000-0000-000000000108','00000000-0000-0000-0000-000000000109','00000000-0000-0000-0000-000000000110','00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000112','00000000-0000-0000-0000-000000000113','00000000-0000-0000-0000-000000000114','00000000-0000-0000-0000-000000000115','00000000-0000-0000-0000-000000000116','00000000-0000-0000-0000-000000000117','00000000-0000-0000-0000-000000000118','00000000-0000-0000-0000-000000000119','00000000-0000-0000-0000-000000000120','00000000-0000-0000-0000-000000000121','00000000-0000-0000-0000-000000000122','00000000-0000-0000-0000-000000000123','00000000-0000-0000-0000-000000000124','00000000-0000-0000-0000-000000000125'''

-- Helper: run delete if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vehicle_live_state') THEN
    EXECUTE format('DELETE FROM vehicle_live_state WHERE vehicle_id NOT IN (%s);', :'allowed');
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='driver_behavior_events') THEN
    EXECUTE format('DELETE FROM driver_behavior_events WHERE vehicle_id NOT IN (%s);', :'allowed');
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='trip_logs') THEN
    EXECUTE format('DELETE FROM trip_logs WHERE vehicle_id NOT IN (%s);', :'allowed');
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='gps_history' AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='gps_history' AND column_name='vehicle_id')) THEN
    EXECUTE format('DELETE FROM gps_history WHERE vehicle_id NOT IN (%s);', :'allowed');
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='fuel_logs') THEN
    EXECUTE format('DELETE FROM fuel_logs WHERE vehicle_id NOT IN (%s);', :'allowed');
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='maintenance_logs') THEN
    EXECUTE format('DELETE FROM maintenance_logs WHERE vehicle_id NOT IN (%s);', :'allowed');
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='fuel_history') THEN
    EXECUTE format('DELETE FROM fuel_history WHERE vehicle_id NOT IN (%s);', :'allowed');
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='alerts') THEN
    EXECUTE format('DELETE FROM alerts WHERE vehicle_id NOT IN (%s);', :'allowed');
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='driver_scores') THEN
    EXECUTE format('DELETE FROM driver_scores WHERE vehicle_id NOT IN (%s);', :'allowed');
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='geofence_events') THEN
    EXECUTE format('DELETE FROM geofence_events WHERE vehicle_id NOT IN (%s);', :'allowed');
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='telematics_devices' AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='telematics_devices' AND column_name='vehicle_id')) THEN
    EXECUTE format('DELETE FROM telematics_devices WHERE vehicle_id NOT IN (%s);', :'allowed');
  END IF;
END$$;

-- Finally delete vehicles not in allowed list (if vehicles table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vehicles') THEN
    EXECUTE format('DELETE FROM vehicles WHERE id NOT IN (%s);', :'allowed');
  END IF;
END$$;

-- Show counts after cleanup
\echo 'Counts after cleanup:'
SELECT 'vehicles' AS table, count(*) FROM vehicles;
SELECT 'vehicle_live_state' AS table, count(*) FROM vehicle_live_state;
SELECT 'driver_behavior_events' AS table, count(*) FROM driver_behavior_events;
SELECT 'trip_logs' AS table, count(*) FROM trip_logs;

-- End of script
