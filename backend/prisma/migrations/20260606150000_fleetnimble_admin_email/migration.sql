-- Migrate legacy seeded admin email to FleetNimble domain
UPDATE "users"
SET "email" = 'admin@fleetnimble.com', "name" = 'FleetNimble Admin'
WHERE "email" = 'admin@fleet.io';
