import { Hono } from "hono";
import type { AppEnv } from "../types";
import type { AppNotification } from "../../shared/types";
import { paginationSchema } from "../../shared/validation";
import { HttpError, nowIso, pageCount, parseQuery } from "../lib/http";
import { assertCsrf, requireUser } from "../lib/auth";
import { unreadCount } from "../lib/notifications";

export const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.get("/notifications", async (c) => {
  const user = requireUser(c);
  const { page, perPage } = parseQuery(c.req.query(), paginationSchema);
  const offset = (page - 1) * perPage;

  const [rows, count, unread] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, type, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
    )
      .bind(user.id, perPage, offset)
      .all<{
        id: string;
        type: string;
        title: string;
        body: string | null;
        link: string | null;
        read_at: string | null;
        created_at: string;
      }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ?")
      .bind(user.id)
      .first<{ count: number }>(),
    unreadCount(c.env.DB, user.id),
  ]);

  const items: AppNotification[] = (rows.results ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    read: row.read_at !== null,
    createdAt: row.created_at,
  }));
  const total = count?.count ?? 0;

  return c.json({
    notifications: {
      items,
      page,
      perPage,
      total,
      totalPages: pageCount(total, perPage),
    },
    unread,
  });
});

notificationRoutes.get("/notifications/unread-count", async (c) => {
  const user = requireUser(c);
  return c.json({ unread: await unreadCount(c.env.DB, user.id) });
});

notificationRoutes.post("/notifications/:id/read", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  const id = c.req.param("id");
  const result = await c.env.DB.prepare(
    "UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL",
  )
    .bind(nowIso(), id, user.id)
    .run();
  if (result.meta.changes === 0) {
    const exists = await c.env.DB.prepare(
      "SELECT id FROM notifications WHERE id = ? AND user_id = ?",
    )
      .bind(id, user.id)
      .first();
    if (!exists) throw new HttpError(404, "NOT_FOUND", "Notification introuvable.");
  }
  return c.json({ unread: await unreadCount(c.env.DB, user.id) });
});

notificationRoutes.post("/notifications/read-all", async (c) => {
  const user = requireUser(c);
  assertCsrf(c);
  await c.env.DB.prepare(
    "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL",
  )
    .bind(nowIso(), user.id)
    .run();
  return c.json({ unread: 0 });
});

import { VAPID_PUBLIC_KEY, sendWebPush } from "../lib/webpush";
import { randomId } from "../lib/crypto";

notificationRoutes.get("/push/vapid-key", (c) => {
  return c.json({ publicKey: VAPID_PUBLIC_KEY });
});

notificationRoutes.post("/push/subscribe", async (c) => {
  const user = c.get("user");
  let body: any = await c.req.json().catch(() => null);
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {}
  }

  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    throw new HttpError(400, "INVALID_SUBSCRIPTION", "Données d'abonnement invalides.");
  }

  const id = randomId();
  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       created_at = excluded.created_at`,
  )
    .bind(
      id,
      user?.id ?? null,
      endpoint,
      p256dh,
      auth,
      nowIso(),
    )
    .run();

  return c.json({ ok: true });
});

notificationRoutes.post("/push/test", async (c) => {
  const user = c.get("user");
  let body: any = await c.req.json().catch(() => ({}));
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {}
  }

  const targetSubs: { id?: string; endpoint: string }[] = [];
  if (body?.endpoint) {
    targetSubs.push({ endpoint: body.endpoint });
  }
  if (user) {
    const rows = await c.env.DB.prepare("SELECT id, endpoint FROM push_subscriptions WHERE user_id = ?")
      .bind(user.id)
      .all<{ id: string; endpoint: string }>();
    for (const r of rows.results || []) {
      if (!targetSubs.some((s) => s.endpoint === r.endpoint)) {
        targetSubs.push(r);
      }
    }
  }

  if (targetSubs.length === 0) {
    return c.json({ ok: true, sent: 0, message: "Aucun appareil enregistré." });
  }

  let sent = 0;
  for (const sub of targetSubs) {
    const ok = await sendWebPush(c.env.DB, sub, {
      title: "Azar Neɣ — تجربة إشعار الهاتف 🔔",
      body: "مرحباً بك! إشعارات الهاتف تعمل بنجاح حتى والشاشة مغلقة 🚀",
      url: "/compte/notifications",
    });
    if (ok) sent++;
  }

  return c.json({ ok: true, sent });
});

