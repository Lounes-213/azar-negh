-- 0004_pro_marketplace_features.sql
-- Store customization, product reordering, store follows, store reviews, call/order click tracking, and Google auth support.

-- Seller profiles extension
ALTER TABLE seller_profiles ADD COLUMN store_name TEXT;
ALTER TABLE seller_profiles ADD COLUMN store_slug TEXT;
ALTER TABLE seller_profiles ADD COLUMN commune TEXT;
ALTER TABLE seller_profiles ADD COLUMN address TEXT;
ALTER TABLE seller_profiles ADD COLUMN latitude REAL;
ALTER TABLE seller_profiles ADD COLUMN longitude REAL;
ALTER TABLE seller_profiles ADD COLUMN opening_hours TEXT;
ALTER TABLE seller_profiles ADD COLUMN banner_url TEXT;
ALTER TABLE seller_profiles ADD COLUMN custom_sort_order TEXT;

-- Listings extension for tracking, reordering, and AliExpress-style pricing
ALTER TABLE listings ADD COLUMN call_clicks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE listings ADD COLUMN order_clicks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE listings ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE listings ADD COLUMN original_price_da INTEGER;

-- Users extension
ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'LOCAL';
ALTER TABLE users ADD COLUMN avatar_url TEXT;

-- Store followers (Abonnés)
CREATE TABLE IF NOT EXISTS store_follows (
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  seller_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, seller_id)
);
CREATE INDEX IF NOT EXISTS idx_store_follows_seller ON store_follows (seller_id);
CREATE INDEX IF NOT EXISTS idx_store_follows_user ON store_follows (user_id);

-- Store Reviews (Rating with natural number: 1, 2, 3, 4, 5 stars)
CREATE TABLE IF NOT EXISTS store_reviews (
  id               TEXT PRIMARY KEY,
  store_seller_id  TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reviewer_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rating           INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment          TEXT CHECK (comment IS NULL OR length(comment) <= 500),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (store_seller_id, reviewer_id)
);
CREATE INDEX IF NOT EXISTS idx_store_reviews_seller ON store_reviews (store_seller_id);

-- Clicks tracking: each click on Call or Buy counted only if user is authenticated (Google or local), never guest
CREATE TABLE IF NOT EXISTS listing_clicks (
  id          TEXT PRIMARY KEY,
  listing_id  TEXT NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  click_type  TEXT NOT NULL CHECK (click_type IN ('CALL', 'BUY_ORDER', 'WHATSAPP')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_listing_clicks_listing ON listing_clicks (listing_id, click_type);
CREATE INDEX IF NOT EXISTS idx_listing_clicks_user ON listing_clicks (user_id);
