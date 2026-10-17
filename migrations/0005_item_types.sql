-- 0005_item_types.sql
-- Add support for item types: physical product, service, and digital product

ALTER TABLE listings ADD COLUMN item_type TEXT NOT NULL DEFAULT 'PRODUCT';
CREATE INDEX IF NOT EXISTS idx_listings_item_type ON listings (item_type);
