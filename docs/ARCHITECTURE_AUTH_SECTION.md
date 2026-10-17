# Authentication and Users (Azar Neɣ)

> Section to paste into `docs/ARCHITECTURE.md`. It replaces the earlier password-based auth design.
> Exact library versions and the current Google endpoints must be re-verified during Phase 1 (compatibility audit).

## 1. Decision

Authentication uses **Google Sign-In (OpenID Connect, Authorization Code flow + PKCE)**.

- No passwords are stored. No password hashing, no recovery codes, no password-reset flow.
- Google proves identity only. The application issues and manages **its own sessions**.
- The stable user key is Google's `sub` claim, never the email address.
- Implementation uses `fetch` and WebCrypto inside the Worker. A small library (e.g. Arctic) is optional, but only if its Workers compatibility is verified.

Known trade-offs (documented honestly in `SECURITY.md`):

- Google OAuth is free but is **not a Cloudflare service**. It is an identity provider only; hosting, database, storage and real-time stay on Cloudflare.
- Users without a Google account cannot sign in. Email/magic-link is a possible later addition, only if a verified delivery mechanism exists.
- If a user's Google account is compromised, the attacker gets access to the marketplace account. Mitigation: short sessions, revocation, active-session list.
- The phone number is **not verified** (no SMS). The UI and docs must say so.

## 2. Routes

| Route                   | Method     | Purpose                                                                                                        |
| ----------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| `/auth/google`          | GET        | Generate `state`, `nonce`, PKCE `code_verifier`; store them in a short-lived signed cookie; redirect to Google |
| `/auth/google/callback` | GET        | Validate state, exchange code, validate ID token, upsert user, create session                                  |
| `/auth/logout`          | POST       | Revoke current session in D1, clear cookie (CSRF-protected)                                                    |
| `/auth/sessions`        | GET / POST | List active sessions; revoke one or all others (POST, CSRF-protected)                                          |
| `/compte/profil`        | GET / POST | Onboarding and profile editing                                                                                 |

## 3. Login flow

```
Browser            Worker                         Google
  | GET /auth/google  |                              |
  |------------------>| state, nonce, verifier       |
  |                   | Set-Cookie oauth_tx (signed, HttpOnly, 10 min)
  |<-- 302 -----------|----------------------------->|
  |                   |      user consents           |
  |<-- 302 /callback?code&state ---------------------|
  | GET /callback     |                              |
  |------------------>| 1. verify cookie signature   |
  |                   | 2. state == cookie.state     |
  |                   | 3. POST token endpoint       |
  |                   |    (code, verifier, secret)->|
  |                   |<---- id_token ---------------|
  |                   | 4. validate id_token         |
  |                   | 5. upsert user by google_sub |
  |                   | 6. create session            |
  |<-- 302 + Set-Cookie session                      |
```

### Authorization request

- `response_type=code`, `scope=openid email profile`
- `code_challenge` = base64url(SHA-256(`code_verifier`)), `code_challenge_method=S256`
- `state` and `nonce`: 32 random bytes each (base64url)
- Optional `prompt=select_account` so users can choose the right Google account

### ID token validation (all mandatory)

1. Signature (RS256) against Google's JWKS, cached with respect to `Cache-Control`.
2. `iss` is `https://accounts.google.com` or `accounts.google.com`.
3. `aud` equals `GOOGLE_CLIENT_ID`.
4. `exp` in the future, `iat` sane (small clock-skew tolerance).
5. `nonce` equals the value stored in the transaction cookie.
6. `email_verified === true`. Otherwise reject the login.

### Transaction cookie (`oauth_tx`)

- Contains `state`, `nonce`, `code_verifier`, `created_at`, and an HMAC signature using `OAUTH_STATE_SECRET`.
- `HttpOnly`, `Secure` (production), `SameSite=Lax`, `Path=/auth`, `Max-Age=600`.
- Deleted immediately after the callback, whether it succeeds or fails.

### Open-redirect protection

A `returnTo` value may be stored in the transaction cookie. It must be a **relative path starting with a single `/`**, never an absolute or protocol-relative URL, and is re-validated at callback time.

## 4. Sessions

- Session token: 32 random bytes from `crypto.getRandomValues`, base64url.
- Only the **SHA-256 hash** of the token is stored in D1 (`sessions.id`). A database leak does not reveal usable tokens.
- Cookie: `__Host-session` in production (`Secure`, `Path=/`, no `Domain`), `HttpOnly`, `SameSite=Lax`.
  - Local development uses a non-`__Host-` name because `Secure` is not available on plain `http://localhost`.
- Lifetime: 14 days absolute, 24 hours idle (`last_seen_at` refreshed at most once per hour to limit D1 writes).
- Revocation: logout, "revoke other sessions", admin suspension (revokes all sessions of that user).
- Every request validates the session server-side: exists, not revoked, not expired, user `status = 'ACTIVE'`.
- The WebSocket upgrade uses the same session validation (see real-time section).

## 5. CSRF and request integrity

- `SameSite=Lax` cookies plus a **CSRF token** on every state-changing request (POST/PUT/PATCH/DELETE).
- Server also checks the `Origin` header against the application origin.
- Logout and all mutations are POST only. No state change over GET (the OAuth callback is the only GET with side effects, and it is protected by `state`).

## 6. Rate limiting

Using the Workers Rate Limiting binding (verify current availability and limits in Phase 1):

| Key     | Target                                     |
| ------- | ------------------------------------------ |
| IP      | `/auth/google` and `/auth/google/callback` |
| IP      | session-less requests to write endpoints   |
| User ID | report, upload, listing submission         |

Rate-limit responses return `429` with a safe generic message.

## 7. First-login onboarding

New users have `profile_completed_at = NULL`. They can browse and favorite, but **cannot submit listings** until they complete the profile:

- Seller display name (2 to 60 chars)
- Phone number, normalized and validated to Algerian formats: `05`, `06`, `07` followed by 8 digits (also accept `+213` / `00213`, stored as `+213XXXXXXXXX`)
- Wilaya (1 to 58)
- Optional: show phone publicly, show WhatsApp link

Name and avatar from Google are only defaults. The seller can change the display name. Avatar is shown as an external URL from Google; if that proves unreliable it can be dropped for initials.

## 8. Roles and admin bootstrap

Roles: `VISITOR` (no session), `USER`, `MODERATOR`, `ADMIN`.

- New accounts are always `USER`. The role is never read from a request body or from Google.
- Only an `ADMIN` can promote or demote users. Every change is written to `audit_logs`.
- The last remaining `ADMIN` cannot be demoted, suspended, or deleted.

### Secure first-admin bootstrap (no password involved)

- Secret `BOOTSTRAP_ADMIN_EMAIL` set with `wrangler secret put`.
- On login, if all of the following hold, the user becomes `ADMIN`:
  - `email_verified = true` and the email equals the secret (case-insensitive),
  - **no ADMIN exists** in the database.
- The promotion is a single atomic statement:

```sql
UPDATE users
SET role = 'ADMIN', updated_at = :now
WHERE id = :user_id
  AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'ADMIN');
```

- It is recorded in `audit_logs` (`action = 'ADMIN_BOOTSTRAP'`).
- After the first admin exists the mechanism is inert. Recommended: delete the secret afterwards.
- Because matching is on a verified Google email, a bootstrap secret that is mistyped simply promotes nobody.

## 9. Schema: users, seller_profiles, sessions

```sql
-- migrations/0001_users_sessions.sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id                   TEXT PRIMARY KEY,                       -- random ID (UUID/ULID) generated server-side
  google_sub           TEXT NOT NULL UNIQUE,                   -- stable Google identifier: the real key
  email                TEXT NOT NULL,                          -- display / admin only, may change
  email_verified       INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  name                 TEXT NOT NULL,
  avatar_url           TEXT,
  role                 TEXT NOT NULL DEFAULT 'USER'
                         CHECK (role IN ('USER', 'MODERATOR', 'ADMIN')),
  status               TEXT NOT NULL DEFAULT 'ACTIVE'
                         CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  profile_completed_at TEXT,                                   -- NULL until onboarding is done (UTC ISO 8601)
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  last_login_at        TEXT
);
CREATE INDEX idx_users_email ON users (email);                 -- not UNIQUE: google_sub is the identity
CREATE INDEX idx_users_role  ON users (role);

CREATE TABLE seller_profiles (
  user_id        TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  display_name   TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 60),
  phone          TEXT NOT NULL,                                -- normalized +213XXXXXXXXX, NOT verified
  phone_public   INTEGER NOT NULL DEFAULT 0 CHECK (phone_public IN (0, 1)),
  whatsapp_public INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_public IN (0, 1)),
  wilaya_id      INTEGER NOT NULL REFERENCES wilayas (id),     -- wilayas table created in a later migration
  bio            TEXT CHECK (bio IS NULL OR length(bio) <= 500),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,                               -- SHA-256 hex of the cookie token
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at   TEXT,
  user_agent   TEXT,                                           -- truncated, for the active-sessions list
  ip_hash      TEXT                                            -- salted hash, never the raw IP
);
CREATE INDEX idx_sessions_user    ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);
```

Notes:

- `seller_profiles` references `wilayas`, so the migration order is **wilayas first, then seller_profiles** (or define the FK in the same migration after the wilayas table).
- Timestamps are UTC ISO 8601 strings. Display conversion (Africa/Algiers, UTC+1) happens in the UI.
- Deleting a user cascades to sessions and seller profile. Cascade or restrict behaviour for listings, reports and audit logs is defined in `docs/DATABASE.md` (audit logs must **not** be cascade-deleted).
- Expired and revoked sessions are purged by a scheduled Worker (Cron Trigger), batched to stay within D1 limits.

## 10. Secrets and configuration

| Name                    | Where                                             | Notes                                          |
| ----------------------- | ------------------------------------------------- | ---------------------------------------------- |
| `GOOGLE_CLIENT_ID`      | `wrangler.jsonc` vars or secret                   | Not sensitive, but kept per environment        |
| `GOOGLE_CLIENT_SECRET`  | `.dev.vars` (local), `wrangler secret put` (prod) | Never committed                                |
| `OAUTH_STATE_SECRET`    | same as above                                     | Random 32+ bytes, signs the transaction cookie |
| `BOOTSTRAP_ADMIN_EMAIL` | `wrangler secret put`                             | Remove after the first admin exists            |
| `APP_ORIGIN`            | vars                                              | Used for redirect URI and `Origin` checks      |

Redirect URIs registered in Google Cloud Console (exact match required):

- `http://localhost:5173/auth/google/callback`
- `https://<worker-name>.<subdomain>.workers.dev/auth/google/callback`

The OAuth consent screen stays in **Testing** mode (limited to listed test users) until it is published.

## 11. Security properties and remaining risks

Covered: no password storage, PKCE, state and nonce checks, ID-token validation, hashed session tokens, HttpOnly cookies, CSRF tokens, rate limiting, atomic admin bootstrap, audit trail for role changes.

Not covered / documented risks:

- Compromised Google accounts.
- Unverified phone numbers (scam risk), partly mitigated by the report and moderation flows.
- Dependence on Google availability for new logins (existing sessions keep working).
- Rate-limit binding behaviour is approximate and per location, not a global guarantee.

## 12. Testing strategy

- **Unit:** PKCE challenge generation, state/nonce comparison, signed-cookie verification, `returnTo` validation, phone normalization, session hashing.
- **Integration (Vitest + Workers pool):** callback with a **mocked token endpoint and mocked JWKS**, covering valid token, wrong `aud`, wrong `iss`, expired token, wrong `nonce`, `email_verified = false`, replayed or missing state.
- **Authorization:** role guards, suspended user rejected, expired and revoked session rejected, last-admin protection, bootstrap runs once only.
- **Manual (one-off, real Google account in dev):** full login, logout, session revocation. This cannot be fully automated and must be reported as a manual test, not a CI test.
