-- Azar Neɣ — initial schema.
-- All timestamps are UTC ISO-8601 strings. Money is stored as integer DA.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Geography (official 58 wilayas, seeded in 0002)
-- ---------------------------------------------------------------------------
CREATE TABLE wilayas (
  id         INTEGER PRIMARY KEY, -- official wilaya number 1..58
  slug       TEXT NOT NULL UNIQUE,
  name_fr    TEXT NOT NULL,
  name_ar    TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Categories (database-managed hierarchy, seeded in 0003)
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name_fr     TEXT NOT NULL,
  name_ar     TEXT NOT NULL,
  parent_id   INTEGER REFERENCES categories (id) ON DELETE RESTRICT,
  icon        TEXT NOT NULL DEFAULT 'tag',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_categories_parent ON categories (parent_id);

-- ---------------------------------------------------------------------------
-- Users and sessions
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE, -- stored lowercase
  password_hash TEXT NOT NULL,        -- pbkdf2-sha256$iterations$salt$hash
  password_algo TEXT NOT NULL DEFAULT 'pbkdf2-sha256',
  role          TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'MODERATOR', 'ADMIN')),
  status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at TEXT
);
CREATE INDEX idx_users_role ON users (role);

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY, -- SHA-256 hex of the session token (never the token)
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at   TEXT,
  user_agent   TEXT,
  ip_hash      TEXT
);
CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

CREATE TABLE seller_profiles (
  user_id         TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  display_name    TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 60),
  phone           TEXT NOT NULL CHECK (length(phone) = 13 AND phone GLOB '+213[0-9]*'),
  phone_public    INTEGER NOT NULL DEFAULT 0 CHECK (phone_public IN (0, 1)),
  whatsapp_public INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_public IN (0, 1)),
  wilaya_id       INTEGER NOT NULL REFERENCES wilayas (id) ON DELETE RESTRICT,
  bio             TEXT CHECK (bio IS NULL OR length(bio) <= 500),
  onboarded_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_seller_profiles_wilaya ON seller_profiles (wilaya_id);

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
CREATE TABLE listings (
  id                  TEXT PRIMARY KEY,
  seller_id           TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category_id         INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  wilaya_id           INTEGER NOT NULL REFERENCES wilayas (id) ON DELETE RESTRICT,
  title               TEXT NOT NULL CHECK (length(title) BETWEEN 8 AND 100),
  description         TEXT NOT NULL CHECK (length(description) BETWEEN 20 AND 4000),
  price_da            INTEGER NOT NULL CHECK (price_da >= 0 AND price_da <= 1000000000),
  negotiable          INTEGER NOT NULL DEFAULT 0 CHECK (negotiable IN (0, 1)),
  condition           TEXT NOT NULL CHECK (condition IN ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'FOR_PARTS')),
  status              TEXT NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SOLD', 'ARCHIVED')),
  contact_phone       TEXT CHECK (contact_phone IS NULL OR (length(contact_phone) = 13 AND contact_phone GLOB '+213[0-9]*')),
  contact_phone_public INTEGER NOT NULL DEFAULT 1 CHECK (contact_phone_public IN (0, 1)),
  contact_whatsapp    INTEGER NOT NULL DEFAULT 0 CHECK (contact_whatsapp IN (0, 1)),
  last_decision_reason TEXT CHECK (last_decision_reason IS NULL OR length(last_decision_reason) <= 1000),
  view_count          INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  submitted_at        TEXT,
  published_at        TEXT,
  sold_at             TEXT,
  archived_at         TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_listings_public ON listings (status, published_at DESC, id DESC);
CREATE INDEX idx_listings_category ON listings (category_id, status, published_at DESC);
CREATE INDEX idx_listings_wilaya ON listings (wilaya_id, status, published_at DESC);
CREATE INDEX idx_listings_seller ON listings (seller_id, updated_at DESC);
CREATE INDEX idx_listings_price ON listings (status, price_da);
CREATE INDEX idx_listings_pending ON listings (status, submitted_at);

CREATE TABLE listing_images (
  id           TEXT PRIMARY KEY,
  listing_id   TEXT REFERENCES listings (id) ON DELETE CASCADE, -- NULL while TEMP
  uploader_id  TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  r2_key       TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes   INTEGER NOT NULL CHECK (size_bytes > 0),
  position     INTEGER NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 20),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_listing_images_listing ON listing_images (listing_id, position);
CREATE INDEX idx_listing_images_uploader ON listing_images (uploader_id, created_at);
CREATE UNIQUE INDEX idx_listing_images_position ON listing_images (listing_id, position)
  WHERE listing_id IS NOT NULL;

-- Cleaning an abandoned upload: insert a row, then compare age.
CREATE TABLE upload_gc_queue (
  r2_key     TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Favorites, reports, moderation
-- ---------------------------------------------------------------------------
CREATE TABLE favorites (
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, listing_id)
);
CREATE INDEX idx_favorites_user ON favorites (user_id, created_at DESC);

CREATE TABLE reports (
  id          TEXT PRIMARY KEY,
  listing_id  TEXT NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason      TEXT NOT NULL CHECK (reason IN ('FRAUD', 'PROHIBITED', 'WRONG_CATEGORY', 'SPAM', 'OTHER')),
  details     TEXT CHECK (details IS NULL OR length(details) <= 1000),
  status      TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVIEWED', 'DISMISSED')),
  resolved_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  resolved_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (listing_id, reporter_id) -- one report per user per listing
);
CREATE INDEX idx_reports_status ON reports (status, created_at);

CREATE TABLE moderation_reviews (
  id           TEXT PRIMARY KEY,
  listing_id   TEXT NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  moderator_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  action       TEXT NOT NULL CHECK (action IN ('APPROVE', 'REJECT', 'REOPEN', 'REMOVE')),
  reason       TEXT CHECK (reason IS NULL OR length(reason) <= 1000),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_moderation_reviews_listing ON moderation_reviews (listing_id, created_at DESC);
CREATE INDEX idx_moderation_reviews_moderator ON moderation_reviews (moderator_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Notifications, audit, rate limiting
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications (user_id, read_at);

CREATE TABLE audit_logs (
  id            TEXT PRIMARY KEY,
  actor_id      TEXT REFERENCES users (id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  entity_type   TEXT,
  entity_id     TEXT,
  metadata_json TEXT,
  ip_hash       TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_audit_created ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_actor ON audit_logs (actor_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs (entity_type, entity_id);

CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY, -- e.g. "login:ip:<hash>" / "upload:user:<id>"
  window_start INTEGER NOT NULL, -- unix seconds, fixed window
  count        INTEGER NOT NULL
);
CREATE INDEX idx_rate_limits_window ON rate_limits (window_start);
