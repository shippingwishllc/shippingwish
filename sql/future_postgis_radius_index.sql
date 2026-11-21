-- ============================================================================
-- Shipping Wish LLC / LoadsNexus — Future Scale PostGIS Radius Search Migration
-- ============================================================================
-- WHEN TO RUN:
--   Run this once in Neon PostgreSQL ONLY when live active loads approach
--   50,000–100,000+ concurrent rows (under 50,000 loads, existing lat/lng +
--   state indexes + geo.js Haversine already run in <50ms with zero overhead).
--
-- IMPORTANT:
--   Designed for Shipping Wish / LoadsNexus pure `pg` PostgreSQL schema
--   (INTEGER SERIAL ids, 21-state `load_status` ENUM) — NO Prisma required!
--
-- OTHER DEFERRED SCALE ITEMS SAVED FOR LATER:
--   1. PostGIS GIST spatial index (this file) — at 50k–100k+ active loads
--   2. Vercel Pro upgrade — switch vercel.json crons to 5-min / 15-min polling
--   3. iOS & Android Developer Accounts — run `eas build --platform all` for
--      shippingwish-app & loadsnexus-app
--   4. Square / PayPal keys in Vercel Env Vars for BuyWishOnline & NYCLimoWish
--      (NEVER fall back to Shipping Wish LLC Stripe account!)
-- ============================================================================

-- 1. Enable PostGIS extension on Neon PostgreSQL
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Add geography(Point, 4326) spatial columns to existing `loads` table
ALTER TABLE loads
  ADD COLUMN IF NOT EXISTS origin_point geography(Point, 4326),
  ADD COLUMN IF NOT EXISTS destination_point geography(Point, 4326);

-- 3. Backfill existing loads that already have origin_lat/lng & destination_lat/lng
UPDATE loads
SET origin_point = ST_SetSRID(ST_MakePoint(origin_lng::double precision, origin_lat::double precision), 4326)::geography
WHERE origin_point IS NULL AND origin_lat IS NOT NULL AND origin_lng IS NOT NULL;

UPDATE loads
SET destination_point = ST_SetSRID(ST_MakePoint(destination_lng::double precision, destination_lat::double precision), 4326)::geography
WHERE destination_point IS NULL AND destination_lat IS NOT NULL AND destination_lng IS NOT NULL;

-- 4. Auto-keep spatial points synced on every INSERT / UPDATE of lat/lng
CREATE OR REPLACE FUNCTION sync_load_geopoints() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.origin_lat IS NOT NULL AND NEW.origin_lng IS NOT NULL THEN
    NEW.origin_point := ST_SetSRID(ST_MakePoint(NEW.origin_lng::double precision, NEW.origin_lat::double precision), 4326)::geography;
  END IF;
  IF NEW.destination_lat IS NOT NULL AND NEW.destination_lng IS NOT NULL THEN
    NEW.destination_point := ST_SetSRID(ST_MakePoint(NEW.destination_lng::double precision, NEW.destination_lat::double precision), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_load_geopoints ON loads;
CREATE TRIGGER trg_sync_load_geopoints
  BEFORE INSERT OR UPDATE OF origin_lat, origin_lng, destination_lat, destination_lng
  ON loads
  FOR EACH ROW
  EXECUTE FUNCTION sync_load_geopoints();

-- 5. High-speed GIST spatial indexes (sub-10ms radius queries at 500,000+ loads)
CREATE INDEX IF NOT EXISTS idx_loads_origin_point_gist ON loads USING GIST (origin_point);
CREATE INDEX IF NOT EXISTS idx_loads_destination_point_gist ON loads USING GIST (destination_point);

-- ============================================================================
-- REFERENCE ST_DWithin QUERY (Drop into routes/broker-api.js or loadboard.js):
--   $1 = originLng, $2 = originLat, $3 = radiusMiles * 1609.34
-- ============================================================================
-- SELECT
--   l.id, l.load_number, l.pickup_location, l.delivery_location,
--   l.equipment_type, l.rate, l.rpm, l.miles, l.pickup_date,
--   l.broker_name, l.broker_mc, l.broker_verified, l.source_channel,
--   ROUND((ST_Distance(l.origin_point, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1609.34)::numeric, 1) AS deadhead_miles
-- FROM loads l
-- WHERE l.deleted_at IS NULL
--   AND l.status::text IN ('open', 'new')
--   AND (l.expires_at IS NULL OR l.expires_at > NOW())
--   AND l.origin_point IS NOT NULL
--   AND ST_DWithin(l.origin_point, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
-- ORDER BY deadhead_miles ASC, l.created_at DESC
-- LIMIT 100;
