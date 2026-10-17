import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv, Env } from "./types";
import { HttpError, nowIso } from "./lib/http";
import { attachAuth, getAllowedOrigins, hashIp, requestIp } from "./lib/auth";
import { authRoutes } from "./routes/auth";
import { metaRoutes } from "./routes/meta";
import { listingRoutes } from "./routes/listings";
import { sellerRoutes } from "./routes/sellers";
import { favoriteRoutes } from "./routes/favorites";
import { reportRoutes } from "./routes/reports";
import { notificationRoutes } from "./routes/notifications";
import { moderationRoutes } from "./routes/moderation";
import { adminRoutes } from "./routes/admin";
import { imageRoutes } from "./routes/images";
import { realtimeRoutes } from "./routes/realtime";
import { aiRoutes } from "./routes/ai";
import { cleanupRateLimits } from "./lib/rate-limit";
import { cleanupAbandonedUploads } from "./lib/images";

export { NotificationHub } from "./durable/notification-hub";

const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Frame-Options", "DENY");
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  const isApi = new URL(c.req.url).pathname.startsWith("/api");
  if (isApi) {
    c.header(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
  } else {
    c.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com; font-src 'self' data:; img-src 'self' data: blob: https://*.tile.openstreetmap.org https://images.unsplash.com https://*.googleusercontent.com https://accounts.google.com; connect-src 'self' wss: https: https://accounts.google.com; frame-src https://accounts.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
  }
  if (!getAllowedOrigins(c).includes("http://localhost:5173")) {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
});

app.use("/api/*", async (c, next) => {
  // Fail closed if the deployment secret is missing: sessions and CSRF depend on it.
  if (!c.env.SESSION_SECRET || c.env.SESSION_SECRET.length < 32) {
    console.error(JSON.stringify({ event: "missing_session_secret" }));
    return c.json(
      {
        error: {
          code: "CONFIG_ERROR",
          message: "Configuration serveur incomplète. Contactez l'administrateur.",
        },
      },
      500,
    );
  }
  await next();
});

app.use("/api/*", bodyLimit({ maxSize: 6 * 1024 * 1024 }));

app.get("/api/health", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1 AS ok").first();
    return c.json({ status: "ok", time: nowIso() });
  } catch {
    return c.json({ status: "degraded", time: nowIso() }, 503);
  }
});

app.use("/api/*", async (c, next) => {
  // Cheap pre-session rate limit for every API hit, keyed by hashed IP.
  const ipHash = await hashIp(c.env, requestIp(c));
  c.set("ipHash", ipHash);
  await next();
});

app.use("/api/*", attachAuth);

app.route("/api/auth", authRoutes);
app.route("/api", metaRoutes);
app.route("/api", listingRoutes);
app.route("/api", sellerRoutes);
app.route("/api", favoriteRoutes);
app.route("/api", reportRoutes);
app.route("/api", notificationRoutes);
app.route("/api", moderationRoutes);
app.route("/api", adminRoutes);
app.route("/api", imageRoutes);
app.route("/api", realtimeRoutes);
app.route("/api", aiRoutes);

app.all("/api/*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Ressource introuvable." } }, 404),
);

app.onError((error, c) => {
  if (error instanceof HttpError) {
    return c.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      error.status as 400,
    );
  }
  const path = new URL(c.req.url).pathname;
  console.error(
    JSON.stringify({
      event: "unhandled_error",
      path,
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "Une erreur interne est survenue." } },
    500,
  );
});

app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith("/api/")) {
    return c.json({ error: { code: "NOT_FOUND", message: "Ressource introuvable." } }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

async function runCleanup(env: Env): Promise<void> {
  const now = nowIso();
  const staleSessionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const notificationCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  await cleanupRateLimits(env.DB);
  await cleanupAbandonedUploads(env);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(staleSessionCutoff),
    env.DB.prepare("DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < ?").bind(
      notificationCutoff,
    ),
    env.DB.prepare("DELETE FROM upload_gc_queue WHERE created_at < ?").bind(notificationCutoff),
    env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(
      Math.floor(Date.now() / 1000) - 86400,
    ),
  ]);
  console.log(JSON.stringify({ event: "cleanup_completed", at: now }));
}

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCleanup(env));
  },
} satisfies ExportedHandler<Env>;
