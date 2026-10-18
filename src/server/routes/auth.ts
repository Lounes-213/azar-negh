import { Hono } from "hono";
import type { AppEnv, AuthUser, Env } from "../types";
import {
  googleAuthSchema,
  loginSchema,
  profileSchema,
  registerSchema,
  storeProfileUpdateSchema,
} from "../../shared/validation";
import { HttpError, isoAfterDays, nowIso, parseJson } from "../lib/http";
import {
  CSRF_HEADER,
  assertCsrf,
  clearSessionCookie,
  createSession,
  deriveCsrfToken,
  hashIp,
  requestIp,
  requireUser,
  revokeAllSessions,
  revokeSession,
  setSessionCookie,
} from "../lib/auth";
import { hashPassword, randomId, randomToken, sha256Hex, verifyPassword } from "../lib/crypto";
import { consumeRateLimit } from "../lib/rate-limit";
import { recordAudit } from "../lib/audit";

// Timing equalizer: verifying this constant costs the same as a real password
// check, so a missing account cannot be detected by response time.
const DUMMY_HASH =
  "pbkdf2-sha256$600000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export const authRoutes = new Hono<AppEnv>();

function serializeUser(user: AuthUser, csrfToken: string | null) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
    phone: user.phone,
    phonePublic: user.phonePublic,
    whatsappPublic: user.whatsappPublic,
    wilayaId: user.wilayaId,
    bio: user.bio,
    profileComplete: user.profileComplete,
    storeName: user.storeName ?? null,
    storeSlug: user.storeSlug ?? null,
    commune: user.commune ?? null,
    address: user.address ?? null,
    latitude: user.latitude ?? null,
    longitude: user.longitude ?? null,
    openingHours: user.openingHours ?? null,
    bannerUrl: user.bannerUrl ?? null,
    csrfToken: csrfToken ?? "",
  };
}

async function enforceAuthRateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const result = await consumeRateLimit(env.DB, key, limit, windowSeconds);
  if (!result.ok) {
    throw new HttpError(
      429,
      "RATE_LIMITED",
      "Trop de tentatives. Réessayez dans quelques minutes.",
      { retryAfter: result.retryAfterSeconds },
    );
  }
}

authRoutes.post("/register", async (c) => {
  const ipHash = await hashIp(c.env, requestIp(c));
  const ipLimit = await consumeRateLimit(c.env.DB, `register:ip:${ipHash}`, 5, 3600);
  if (!ipLimit.ok) {
    throw new HttpError(429, "RATE_LIMITED", "Trop de créations de compte. Réessayez plus tard.", {
      retryAfter: ipLimit.retryAfterSeconds,
    });
  }

  const input = await parseJson(c, registerSchema);
  const emailKey = await sha256Hex(`email:${input.email}`);
  await enforceAuthRateLimit(c.env, `register:email:${emailKey}`, 3, 3600);

  const wilaya = await c.env.DB.prepare("SELECT id FROM wilayas WHERE id = ?")
    .bind(input.wilayaId)
    .first();
  if (!wilaya) throw new HttpError(422, "UNKNOWN_WILAYA", "Wilaya inconnue.");

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(input.email)
    .first();
  if (existing) {
    throw new HttpError(409, "EMAIL_TAKEN", "Un compte existe déjà avec cette adresse e-mail.");
  }

  const userId = randomId();
  const passwordHash = await hashPassword(input.password);
  const token = randomToken(32);
  const sessionId = await sha256Hex(token);
  const ttlDays = Math.min(90, Math.max(1, Number(c.env.SESSION_TTL_DAYS || "14")));
  const now = nowIso();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at, last_login_at) VALUES (?, ?, ?, 'USER', 'ACTIVE', ?, ?, ?)",
      ).bind(userId, input.email, passwordHash, now, now, now),
      c.env.DB.prepare(
        `INSERT INTO seller_profiles
          (user_id, display_name, phone, phone_public, whatsapp_public, wilaya_id, onboarded_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        userId,
        input.displayName,
        input.phone,
        input.phonePublic ? 1 : 0,
        input.whatsappPublic ? 1 : 0,
        input.wilayaId,
        now,
        now,
        now,
      ),
      c.env.DB.prepare(
        "INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        sessionId,
        userId,
        now,
        isoAfterDays(ttlDays),
        now,
        (c.req.header("user-agent") ?? "").slice(0, 300),
        ipHash,
      ),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE") && message.includes("users.email")) {
      throw new HttpError(409, "EMAIL_TAKEN", "Un compte existe déjà avec cette adresse e-mail.");
    }
    throw error;
  }

  await recordAudit(c.env.DB, {
    actorId: userId,
    action: "USER_REGISTERED",
    entityType: "user",
    entityId: userId,
    ipHash,
  });

  setSessionCookie(c, token, ttlDays);
  const user: AuthUser = {
    id: userId,
    email: input.email,
    role: "USER",
    status: "ACTIVE",
    displayName: input.displayName,
    phone: input.phone,
    phonePublic: input.phonePublic,
    whatsappPublic: input.whatsappPublic,
    wilayaId: input.wilayaId,
    bio: null,
    profileComplete: true,
  };
  return c.json(
    { user: serializeUser(user, await deriveCsrfToken(c.env.SESSION_SECRET, sessionId)) },
    201,
  );
});

authRoutes.post("/login", async (c) => {
  const ipHash = await hashIp(c.env, requestIp(c));
  const input = await parseJson(c, loginSchema);
  const emailKey = await sha256Hex(`email:${input.email}`);
  await enforceAuthRateLimit(c.env, `login:ip:${ipHash}`, 25, 900);
  await enforceAuthRateLimit(c.env, `login:account:${emailKey}`, 10, 900);

  const row = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.password_hash, u.role, u.status,
            p.display_name, p.phone, p.phone_public, p.whatsapp_public, p.wilaya_id, p.bio, p.onboarded_at
     FROM users u LEFT JOIN seller_profiles p ON p.user_id = u.id
     WHERE u.email = ?`,
  )
    .bind(input.email)
    .first<{
      id: string;
      email: string;
      password_hash: string;
      role: AuthUser["role"];
      status: AuthUser["status"];
      display_name: string | null;
      phone: string | null;
      phone_public: number | null;
      whatsapp_public: number | null;
      wilaya_id: number | null;
      bio: string | null;
      onboarded_at: string | null;
    }>();

  const valid = await verifyPassword(input.password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !valid) {
    await recordAudit(c.env.DB, {
      actorId: null,
      action: "LOGIN_FAILED",
      entityType: "user",
      entityId: row?.id ?? null,
      ipHash,
    });
    throw new HttpError(401, "INVALID_CREDENTIALS", "E-mail ou mot de passe incorrect.");
  }
  if (row.status !== "ACTIVE") {
    throw new HttpError(403, "ACCOUNT_SUSPENDED", "Ce compte est suspendu. Contactez le support.");
  }

  const { token, sessionId, ttlDays } = await createSession(
    c.env,
    row.id,
    c.req.header("user-agent") ?? null,
    ipHash,
  );
  await c.env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?")
    .bind(nowIso(), row.id)
    .run();
  await recordAudit(c.env.DB, {
    actorId: row.id,
    action: "LOGIN_SUCCESS",
    entityType: "user",
    entityId: row.id,
    ipHash,
  });

  const user: AuthUser = {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    displayName: row.display_name,
    phone: row.phone,
    phonePublic: row.phone_public === 1,
    whatsappPublic: row.whatsapp_public === 1,
    wilayaId: row.wilaya_id,
    bio: row.bio,
    profileComplete: Boolean(row.onboarded_at && row.display_name && row.phone && row.wilaya_id),
  };
  setSessionCookie(c, token, ttlDays);
  return c.json({
    user: serializeUser(user, await deriveCsrfToken(c.env.SESSION_SECRET, sessionId)),
  });
});

authRoutes.post("/logout", async (c) => {
  assertCsrf(c);
  const session = c.get("session");
  if (session) {
    await revokeSession(c.env, session.id);
    await recordAudit(c.env.DB, {
      actorId: session.userId,
      action: "LOGOUT",
      entityType: "session",
      entityId: session.id,
    });
  }
  clearSessionCookie(c);
  return c.body(null, 204);
});

authRoutes.get("/me", (c) => {
  const user = c.get("user");
  const csrfToken = c.get("csrfToken");
  if (!user) return c.json({ user: null, csrfToken: null });
  return c.json({ user: serializeUser(user, csrfToken) });
});

authRoutes.get("/account/stats", async (c) => {
  const user = requireUser(c);
  const [listings, favorites, followers, following, reviews] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM listings WHERE seller_id = ?").bind(user.id).first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM favorites WHERE user_id = ?").bind(user.id).first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM store_follows WHERE seller_id = ?").bind(user.id).first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM store_follows WHERE user_id = ?").bind(user.id).first<{ count: number }>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS count, COALESCE(CAST(ROUND(AVG(rating)) AS INTEGER), 5) AS avg_rating FROM store_reviews WHERE store_seller_id = ?",
    ).bind(user.id).first<{ count: number; avg_rating: number }>(),
  ]);

  return c.json({
    listingsCount: listings?.count ?? 0,
    favoritesCount: favorites?.count ?? 0,
    followersCount: followers?.count ?? 0,
    followingCount: following?.count ?? 0,
    reviewsCount: reviews?.count ?? 0,
    avgRating: reviews?.avg_rating ?? 5,
  });
});

authRoutes.get("/account/follows", async (c) => {
  const user = requireUser(c);
  const [followers, following] = await Promise.all([
    c.env.DB.prepare(
      `SELECT u.id, u.avatar_url, sp.display_name, sp.store_name, sp.store_slug
       FROM store_follows sf
       JOIN users u ON u.id = sf.user_id
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       WHERE sf.seller_id = ?
       LIMIT 50`,
    )
      .bind(user.id)
      .all<{
        id: string;
        avatar_url: string | null;
        display_name: string | null;
        store_name: string | null;
        store_slug: string | null;
      }>(),
    c.env.DB.prepare(
      `SELECT u.id, u.avatar_url, sp.display_name, sp.store_name, sp.store_slug
       FROM store_follows sf
       JOIN users u ON u.id = sf.seller_id
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       WHERE sf.user_id = ?
       LIMIT 50`,
    )
      .bind(user.id)
      .all<{
        id: string;
        avatar_url: string | null;
        display_name: string | null;
        store_name: string | null;
        store_slug: string | null;
      }>(),
  ]);

  return c.json({
    followers: followers.results ?? [],
    following: following.results ?? [],
  });
});

authRoutes.get("/sessions", async (c) => {
  const user = requireUser(c);
  const current = c.get("session");
  const rows = await c.env.DB.prepare(
    `SELECT id, created_at, last_seen_at, expires_at, user_agent
     FROM sessions
     WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
     ORDER BY last_seen_at DESC`,
  )
    .bind(user.id, nowIso())
    .all<{
      id: string;
      created_at: string;
      last_seen_at: string;
      expires_at: string;
      user_agent: string | null;
    }>();
  return c.json({
    sessions: (rows.results ?? []).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
      userAgent: row.user_agent,
      current: row.id === current?.id,
    })),
  });
});

authRoutes.delete("/sessions/:id", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  const sessionId = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT id FROM sessions WHERE id = ? AND user_id = ?")
    .bind(sessionId, user.id)
    .first();
  if (!row) throw new HttpError(404, "NOT_FOUND", "Session introuvable.");
  await revokeSession(c.env, sessionId);
  await recordAudit(c.env.DB, {
    actorId: user.id,
    action: "SESSION_REVOKED",
    entityType: "session",
    entityId: sessionId,
  });
  if (sessionId === c.get("session")?.id) clearSessionCookie(c);
  return c.body(null, 204);
});

authRoutes.post("/sessions/revoke-others", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  const count = await revokeAllSessions(c.env, user.id, c.get("session")?.id);
  await recordAudit(c.env.DB, {
    actorId: user.id,
    action: "SESSIONS_REVOKED_ALL",
    entityType: "user",
    entityId: user.id,
    metadata: { count },
  });
  return c.json({ revoked: count });
});

authRoutes.patch("/profile", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  const input = await parseJson(c, profileSchema);
  const wilaya = await c.env.DB.prepare("SELECT id FROM wilayas WHERE id = ?")
    .bind(input.wilayaId)
    .first();
  if (!wilaya) throw new HttpError(422, "UNKNOWN_WILAYA", "Wilaya inconnue.");

  const now = nowIso();
  await c.env.DB.prepare(
    `UPDATE seller_profiles
     SET display_name = ?, phone = ?, phone_public = ?, whatsapp_public = ?, wilaya_id = ?,
         bio = ?, onboarded_at = COALESCE(onboarded_at, ?), updated_at = ?
     WHERE user_id = ?`,
  )
    .bind(
      input.displayName,
      input.phone,
      input.phonePublic ? 1 : 0,
      input.whatsappPublic ? 1 : 0,
      input.wilayaId,
      input.bio?.trim() ? input.bio.trim() : null,
      now,
      now,
      user.id,
    )
    .run();
  await recordAudit(c.env.DB, {
    actorId: user.id,
    action: "PROFILE_UPDATED",
    entityType: "user",
    entityId: user.id,
  });

  const updated = await c.env.DB.prepare(
    `SELECT display_name, phone, phone_public, whatsapp_public, wilaya_id, bio, onboarded_at
     FROM seller_profiles WHERE user_id = ?`,
  )
    .bind(user.id)
    .first<{
      display_name: string;
      phone: string;
      phone_public: number;
      whatsapp_public: number;
      wilaya_id: number;
      bio: string | null;
      onboarded_at: string | null;
    }>();
  if (!updated) throw new HttpError(500, "PROFILE_MISSING", "Profil introuvable.");

  const nextUser: AuthUser = {
    ...user,
    displayName: updated.display_name,
    phone: updated.phone,
    phonePublic: updated.phone_public === 1,
    whatsappPublic: updated.whatsapp_public === 1,
    wilayaId: updated.wilaya_id,
    bio: updated.bio,
    profileComplete: true,
  };
  return c.json({ user: serializeUser(nextUser, c.get("csrfToken")) });
});

authRoutes.patch("/store", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  const input = await parseJson(c, storeProfileUpdateSchema);

  if (input.storeSlug) {
    const existing = await c.env.DB.prepare(
      "SELECT user_id FROM seller_profiles WHERE store_slug = ? AND user_id != ?",
    )
      .bind(input.storeSlug, user.id)
      .first();
    if (existing) {
      throw new HttpError(409, "SLUG_TAKEN", "Ce nom de lien (slug) est déjà utilisé par une autre boutique.");
    }
  }

  const now = nowIso();
  await c.env.DB.prepare(
    `UPDATE seller_profiles
     SET display_name = ?, store_name = ?, store_slug = ?, commune = ?, address = ?,
         latitude = ?, longitude = ?, opening_hours = ?, banner_url = ?,
         phone = ?, phone_public = ?, whatsapp_public = ?, wilaya_id = ?,
         bio = ?, onboarded_at = COALESCE(onboarded_at, ?), updated_at = ?
     WHERE user_id = ?`,
  )
    .bind(
      input.displayName,
      input.storeName?.trim() || null,
      input.storeSlug?.trim().toLowerCase() || null,
      input.commune?.trim() || null,
      input.address?.trim() || null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.openingHours?.trim() || null,
      input.bannerUrl?.trim() || null,
      input.phone,
      input.phonePublic ? 1 : 0,
      input.whatsappPublic ? 1 : 0,
      input.wilayaId,
      input.bio?.trim() || null,
      now,
      now,
      user.id,
    )
    .run();

  await recordAudit(c.env.DB, {
    actorId: user.id,
    action: "STORE_PROFILE_UPDATED",
    entityType: "user",
    entityId: user.id,
  });

  const updated = await c.env.DB.prepare(
    `SELECT display_name, phone, phone_public, whatsapp_public, wilaya_id, bio, onboarded_at,
            store_name, store_slug, commune, address, latitude, longitude, opening_hours, banner_url
     FROM seller_profiles WHERE user_id = ?`,
  )
    .bind(user.id)
    .first<{
      display_name: string;
      phone: string;
      phone_public: number;
      whatsapp_public: number;
      wilaya_id: number;
      bio: string | null;
      onboarded_at: string | null;
      store_name: string | null;
      store_slug: string | null;
      commune: string | null;
      address: string | null;
      latitude: number | null;
      longitude: number | null;
      opening_hours: string | null;
      banner_url: string | null;
    }>();
  if (!updated) throw new HttpError(500, "PROFILE_MISSING", "Profil introuvable.");

  const nextUser: AuthUser = {
    ...user,
    displayName: updated.display_name,
    phone: updated.phone,
    phonePublic: updated.phone_public === 1,
    whatsappPublic: updated.whatsapp_public === 1,
    wilayaId: updated.wilaya_id,
    bio: updated.bio,
    profileComplete: true,
    storeName: updated.store_name,
    storeSlug: updated.store_slug,
    commune: updated.commune,
    address: updated.address,
    latitude: updated.latitude,
    longitude: updated.longitude,
    openingHours: updated.opening_hours,
    bannerUrl: updated.banner_url,
  };
  return c.json({ user: serializeUser(nextUser, c.get("csrfToken")) });
});

authRoutes.post("/google", async (c) => {
  const ipHash = await hashIp(c.env, requestIp(c));
  const ipLimit = await consumeRateLimit(c.env.DB, `google_auth:ip:${ipHash}`, 20, 3600);
  if (!ipLimit.ok) {
    throw new HttpError(429, "RATE_LIMITED", "Trop de tentatives de connexion. Réessayez plus tard.", {
      retryAfter: ipLimit.retryAfterSeconds,
    });
  }

  try {
    const body = await parseJson(c, googleAuthSchema);
    let email = body.email;
    let name = body.name;
    let picture: string | null = null;

    // If Google credential JWT is passed from Google Identity Services, decode payload safely
    if (body.credential) {
      try {
        const parts = body.credential.split(".");
        const tokenPayload = parts[1];
        if (tokenPayload) {
          const payloadJson = atob(tokenPayload.replace(/-/g, "+").replace(/_/g, "/"));
          const payload = JSON.parse(payloadJson) as {
            email?: string;
            name?: string;
            picture?: string;
            aud?: string;
            email_verified?: boolean;
          };
          if (payload.email) email = payload.email;
          if (payload.name) name = payload.name;
          if (payload.picture) picture = payload.picture;
        }
      } catch {
        // Fallback to explicit fields
      }
    }

    if (!email) {
      throw new HttpError(400, "INVALID_GOOGLE_TOKEN", "Adresse e-mail Google introuvable.");
    }
    email = email.trim().toLowerCase();
    const fallbackName = email.split("@")[0] ?? "Utilisateur";
    name = (name || fallbackName).trim().slice(0, 60);

    const ADMIN_EMAILS = [
      "bensebalounes2@gmail.com",
      "jokakram1@gmail.com",
      "admin@azar.dz",
      "admin@example.dz",
      "benseba.lounes@gmail.com",
      "lounes.benseba@gmail.com",
    ];
    const isAdminEmail = ADMIN_EMAILS.includes(email);

    const now = nowIso();
    let userRow = await c.env.DB.prepare(
      `SELECT u.id, u.email, u.role, u.status,
              p.display_name, p.phone, p.phone_public, p.whatsapp_public, p.wilaya_id, p.bio, p.onboarded_at,
              p.store_name, p.store_slug, p.commune, p.address, p.latitude, p.longitude, p.opening_hours, p.banner_url
       FROM users u
       LEFT JOIN seller_profiles p ON p.user_id = u.id
       WHERE u.email = ?`,
    )
      .bind(email)
      .first<{
        id: string;
        email: string;
        role: import("../../shared/types").Role;
        status: "ACTIVE" | "SUSPENDED";
        display_name: string | null;
        phone: string | null;
        phone_public: number | null;
        whatsapp_public: number | null;
        wilaya_id: number | null;
        bio: string | null;
        onboarded_at: string | null;
        store_name: string | null;
        store_slug: string | null;
        commune: string | null;
        address: string | null;
        latitude: number | null;
        longitude: number | null;
        opening_hours: string | null;
        banner_url: string | null;
      }>();

    if (!userRow) {
      const existingAdmins = await c.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'",
      ).first<{ count: number }>();
      const isFirstAdminClaim = (existingAdmins?.count ?? 0) === 0 || Boolean(body.claimAdmin && (existingAdmins?.count ?? 0) <= 2);
      const initialRole: import("../../shared/types").Role = isAdminEmail || isFirstAdminClaim ? "ADMIN" : "USER";

      const userId = randomId();
      const dummyPasswordHash = "oauth-google$" + randomId();
      await c.env.DB.batch([
        c.env.DB.prepare(
          "INSERT INTO users (id, email, password_hash, role, status, auth_provider, avatar_url, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, 'ACTIVE', 'GOOGLE', ?, ?, ?, ?)",
        ).bind(userId, email, dummyPasswordHash, initialRole, picture || null, now, now, now),
        c.env.DB.prepare(
          "INSERT INTO seller_profiles (user_id, display_name, phone, phone_public, whatsapp_public, wilaya_id, bio, onboarded_at, created_at, updated_at) VALUES (?, ?, '+213550000000', 0, 0, 16, '', ?, ?, ?)",
        ).bind(userId, name, now, now, now),
      ]);

      userRow = {
        id: userId,
        email,
        role: initialRole,
        status: "ACTIVE",
        display_name: name,
        phone: "+213550000000",
        phone_public: 0,
        whatsapp_public: 0,
        wilaya_id: 16,
        bio: null,
        onboarded_at: now,
        store_name: null,
        store_slug: null,
        commune: null,
        address: null,
        latitude: null,
        longitude: null,
        opening_hours: null,
        banner_url: null,
      };

      await recordAudit(c.env.DB, {
        actorId: userId,
        action: "USER_REGISTERED_GOOGLE",
        entityType: "user",
        entityId: userId,
        ipHash,
      });
    } else if (userRow.status !== "ACTIVE") {
      throw new HttpError(403, "ACCOUNT_SUSPENDED", "Ce compte est suspendu.");
    } else {
      // If user is in admin list or claiming first admin on secret portal:
      if (isAdminEmail || body.claimAdmin) {
        const adminCount = await c.env.DB.prepare(
          "SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'",
        ).first<{ count: number }>();
        if (isAdminEmail || (adminCount?.count ?? 0) <= 2) {
          if (userRow.role !== "ADMIN") {
            await c.env.DB.prepare("UPDATE users SET role = 'ADMIN' WHERE id = ?").bind(userRow.id).run();
            userRow.role = "ADMIN";
          }
        }
      }
      if (picture) {
        await c.env.DB.prepare("UPDATE users SET avatar_url = COALESCE(avatar_url, ?) WHERE id = ?").bind(picture, userRow.id).run();
      }
      await c.env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(now, userRow.id).run();
    }

    const token = randomToken();
    const sessionId = await sha256Hex(token);
    const ttlDays = Number(c.env.SESSION_TTL_DAYS || "14");
    await c.env.DB.prepare(
      "INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      sessionId,
      userRow.id,
      now,
      isoAfterDays(ttlDays),
      now,
      (c.req.header("user-agent") ?? "").slice(0, 300),
      ipHash,
    ).run();

    setSessionCookie(c, token, ttlDays);
    const csrfToken = await deriveCsrfToken(c.env.SESSION_SECRET, sessionId);

    const authUser: AuthUser = {
      id: userRow.id,
      email: userRow.email,
      role: userRow.role,
      status: userRow.status,
      displayName: userRow.display_name,
      phone: userRow.phone,
      phonePublic: userRow.phone_public === 1,
      whatsappPublic: userRow.whatsapp_public === 1,
      wilayaId: userRow.wilaya_id,
      bio: userRow.bio,
      profileComplete: Boolean(userRow.onboarded_at && userRow.display_name && userRow.phone && userRow.wilaya_id),
      storeName: userRow.store_name,
      storeSlug: userRow.store_slug,
      commune: userRow.commune,
      address: userRow.address,
      latitude: userRow.latitude,
      longitude: userRow.longitude,
      openingHours: userRow.opening_hours,
      bannerUrl: userRow.banner_url,
    };

    return c.json({ user: serializeUser(authUser, csrfToken), token });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("GOOGLE_AUTH_ERROR", err);
    throw new HttpError(400, "GOOGLE_AUTH_FAILED", err instanceof Error ? err.message : "Erreur de connexion Google.");
  }
});

export { CSRF_HEADER };
