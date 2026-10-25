-- Add password credentials and normalize the two supported application roles.
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;

UPDATE "users"
SET "role" = 'admin'
WHERE "role" = 'farm_manager' OR "email" = 'farmer@example.com';

UPDATE "users"
SET "role" = 'user'
WHERE "role" NOT IN ('admin', 'user');
