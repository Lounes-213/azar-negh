import type { MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AuthUser, Env } from "../types";
import type { Role } from "../../shared/types";
import { HttpError, isoAfterDays, nowIso } from "./http";
import { hmacHex, randomToken, sha256Hex, timingSafeEqual } from "./crypto";

export const SESSION_COOKIE = "azar_session";
export const CSRF_HEADER = "x-csrf-token";
const IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

interface SessionRow {
  session_id: string;
  expires_at: string;
  last_seen_at: string;
  user_id: string;
  email: string;
  role: Role;
  status: "ACTIVE" | "SUSPENDED";
  avatar_url: string | null;
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
}

function rowToUser(row: SessionRow): AuthUser {
  return {
    id: row.user_id,
    email: row.email,
    role: row.role,
    status: row.status,
    avatarUrl: row.avatar_url,
    displayName: row.display_name,
    phone: row.phone,
    phonePublic: row.phone_public === 1,
    whatsappPublic: row.whatsapp_public === 1,
    wilayaId: row.wilaya_id,
    bio: row.bio,
    profileComplete: Boolean(row.onboarded_at && row.display_name && row.phone && row.wilaya_id),
    storeName: row.store_name,
    storeSlug: row.store_slug,
    commune: row.commune,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    openingHours: row.opening_hours,
    bannerUrl: row.banner_url,
  };
}

export function isSecureRequest(url: string): boolean {
  return new URL(url).protocol === "https:";
}

export async function deriveCsrfToken(secret: string, sessionId: string): Promise<string> {
  return hmacHex(secret, `csrf:${sessionId}`);
}

export async function authenticateRequest(
  env: Env,
  token: string | undefined,
): Promise<{ user: AuthUser; sessionId: string; expiresAt: string } | null> {
  if (!token) return null;
  const sessionId = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT
        s.id AS session_id, s.expires_at, s.last_seen_at,
        u.id AS user_id, u.email, u.role, u.status, u.avatar_url,
        p.display_name, p.phone, p.phone_public, p.whatsapp_public, p.wilaya_id, p.bio, p.onboarded_at,
        p.store_name, p.store_slug, p.commune, p.address, p.latitude, p.longitude, p.opening_hours, p.banner_url
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN seller_profiles p ON p.user_id = u.id
     WHERE s.id = ? AND s.revoked_at IS NULL`,
  )
    .bind(sessionId)
    .first<SessionRow>();

  if (!row) return null;
  const now = Date.now();
  if (Date.parse(row.expires_at) <= now) return null;
  if (Date.parse(row.last_seen_at) < now - IDLE_TIMEOUT_MS) return null;
  if (row.status !== "ACTIVE") return null;

  // Throttle D1 writes: one session touch per hour at most.
  const lastSeen = Date.parse(row.last_seen_at);
  if (now - lastSeen > 60 * 60 * 1000) {
    const ttlDays = Number(env.SESSION_TTL_DAYS || "14");
    await env.DB.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?")
      .bind(new Date(now).toISOString(), isoAfterDays(ttlDays), sessionId)
      .run();
  }

  return { user: rowToUser(row), sessionId, expiresAt: row.expires_at };
}

/** Loads the session (if any) into the context. Never throws for anonymous users. */
export const attachAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: import("../types").AppVariables;
}> = async (c, next) => {
  const authHeader = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const token = authHeader || getCookie(c, SESSION_COOKIE);
  const auth = await authenticateRequest(c.env, token);
  if (auth) {
    c.set("user", auth.user);
    c.set("session", { id: auth.sessionId, userId: auth.user.id, expiresAt: auth.expiresAt });
    c.set("csrfToken", await deriveCsrfToken(c.env.SESSION_SECRET, auth.sessionId));
  } else {
    c.set("user", null);
    c.set("session", null);
    c.set("csrfToken", null);
    if (token && !authHeader) {
      // Expired / revoked / suspended: clear the stale cookie.
      deleteCookie(c, SESSION_COOKIE, { path: "/" });
    }
  }
  await next();
};

export function requireUser(c: import("hono").Context<import("../types").AppEnv>): AuthUser {
  const user = c.get("user");
  if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Connexion requise.");
  return user;
}

export function requireRole(
  c: import("hono").Context<import("../types").AppEnv>,
  roles: Role[],
): AuthUser {
  const user = requireUser(c);
  if (!roles.includes(user.role)) {
    throw new HttpError(403, "FORBIDDEN", "Vous n'avez pas les droits nécessaires.");
  }
  return user;
}

export function assertAdminOrSecret(
  c: import("hono").Context<import("../types").AppEnv>,
): { id: string; role: Role; email: string } {
  const adminKey = c.req.header("x-admin-key");
  if (
    adminKey &&
    c.env.SESSION_SECRET &&
    (adminKey === c.env.SESSION_SECRET || adminKey === (c.env as any).ADMIN_SECRET_KEY)
  ) {
    return {
      id: "master_admin",
      role: "ADMIN",
      email: "master.admin@azar-negh.dz",
    };
  }

  const user = c.get("user");
  if (user && user.role === "ADMIN") {
    return user;
  }

  throw new HttpError(403, "FORBIDDEN", "Accès administrateur requis (Clé maître ou session Admin requise).");
}

export function getAllowedOrigins(c: import("hono").Context<import("../types").AppEnv>): string[] {
  const requestOrigin = new URL(c.req.url).origin;
  const allowed = new Set<string>([requestOrigin]);
  if (c.env.PUBLIC_ORIGIN) allowed.add(c.env.PUBLIC_ORIGIN.replace(/\/$/, ""));
  const reqOrigin = c.req.header("Origin");
  if (reqOrigin && (reqOrigin.endsWith(".vercel.app") || reqOrigin === "https://vercel.app")) {
    allowed.add(reqOrigin);
  }
  // Local dev & admin panel origins
  allowed.add("http://localhost:5173");
  allowed.add("http://127.0.0.1:5173");
  allowed.add("http://localhost:5174");
  allowed.add("http://127.0.0.1:5174");
  allowed.add("http://localhost:8787");
  allowed.add("http://127.0.0.1:8787");
  return [...allowed];
}

export function assertSameOrigin(c: import("hono").Context<import("../types").AppEnv>): void {
  const origin = c.req.header("Origin");
  if (!origin) return; // Non-browser client; session + CSRF checks still apply.
  if (!getAllowedOrigins(c).includes(origin)) {
    throw new HttpError(403, "BAD_ORIGIN", "Origine de la requête non autorisée.");
  }
}

export function assertCsrf(c: import("hono").Context<import("../types").AppEnv>): void {
  const authHeader = c.req.header("Authorization");
  const adminKey = c.req.header("x-admin-key");
  if (
    authHeader ||
    (adminKey &&
      c.env.SESSION_SECRET &&
      (adminKey === c.env.SESSION_SECRET || adminKey === (c.env as any).ADMIN_SECRET_KEY))
  ) {
    return;
  }
  assertSameOrigin(c);
  const expected = c.get("csrfToken");
  const provided = c.req.header(CSRF_HEADER);
  if (!expected || !provided || !timingSafeEqual(expected, provided)) {
    throw new HttpError(403, "CSRF_FAILED", "Jeton CSRF manquant ou invalide. Rechargez la page.");
  }
}

export function setSessionCookie(
  c: import("hono").Context<import("../types").AppEnv>,
  token: string,
  ttlDays: number,
): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureRequest(c.req.url),
    sameSite: "Lax",
    path: "/",
    maxAge: Math.round(ttlDays * 24 * 60 * 60),
  });
}

export function clearSessionCookie(c: import("hono").Context<import("../types").AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, {
    path: "/",
    secure: isSecureRequest(c.req.url),
    sameSite: "Lax",
  });
}

export async function createSession(
  env: Env,
  userId: string,
  userAgent: string | null,
  ipHash: string | null,
): Promise<{ token: string; sessionId: string; ttlDays: number }> {
  const token = randomToken(32);
  const sessionId = await sha256Hex(token);
  const ttlDays = Math.min(90, Math.max(1, Number(env.SESSION_TTL_DAYS || "14")));
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      sessionId,
      userId,
      now,
      isoAfterDays(ttlDays),
      now,
      userAgent?.slice(0, 300) ?? null,
      ipHash,
    )
    .run();
  return { token, sessionId, ttlDays };
}

export async function revokeSession(env: Env, sessionId: string): Promise<void> {
  await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
    .bind(nowIso(), sessionId)
    .run();
}

export async function revokeAllSessions(
  env: Env,
  userId: string,
  exceptId?: string,
): Promise<number> {
  const result = await env.DB.prepare(
    "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id != ?",
  )
    .bind(nowIso(), userId, exceptId ?? "")
    .run();
  return result.meta.changes ?? 0;
}

export async function hashIp(env: Env, ip: string): Promise<string> {
  return hmacHex(env.SESSION_SECRET, `ip:${ip}`);
}

export function requestIp(c: import("hono").Context<import("../types").AppEnv>): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "127.0.0.1"
  );
}
