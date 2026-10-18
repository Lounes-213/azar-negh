import type { Env } from "../types";
import type { RealtimeNotification } from "../../shared/realtime";
import { randomId } from "./crypto";
import { hmacHex } from "./crypto";
import { nowIso } from "./http";

export interface NewNotification {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
}

export interface StoredNotification {
  id: string;
  userId: string;
  createdAt: string;
}

/** Persists one notification (source of truth; offline users see it later). */
export async function persistNotification(
  db: D1Database,
  input: NewNotification,
): Promise<StoredNotification> {
  const id = randomId();
  const createdAt = nowIso();
  await db
    .prepare(
      "INSERT INTO notifications (id, user_id, type, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      input.userId,
      input.type,
      input.title,
      input.body ?? null,
      input.link ?? null,
      createdAt,
    )
    .run();
  return { id, userId: input.userId, createdAt };
}

/** Best-effort realtime push; failures never block the D1 write. */
export async function pushNotification(
  env: Env,
  stored: StoredNotification,
  input: NewNotification,
  unread: number,
): Promise<void> {
  const notification: RealtimeNotification = {
    id: stored.id,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    createdAt: stored.createdAt,
  };
  const body = JSON.stringify({ notification, unread });
  const signature = await hmacHex(env.SESSION_SECRET, `notify:${input.userId}:${body}`);
  try {
    const stub = env.NOTIFICATIONS.get(env.NOTIFICATIONS.idFromName(input.userId));
    await stub.fetch("https://notification-hub/notify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-azar-user": input.userId,
        "x-azar-signature": signature,
      },
      body,
    });
  } catch {
    // Realtime is best-effort. The notification stays in D1.
  }
}

export async function unreadCount(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL")
    .bind(userId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

import { sendPushToUser } from "./webpush";

export async function notifyUser(env: Env, input: NewNotification): Promise<StoredNotification> {
  const stored = await persistNotification(env.DB, input);
  const unread = await unreadCount(env.DB, input.userId);
  await pushNotification(env, stored, input, unread);

  // Dispatch background Web Push (pops up on phone lock screen / desktop even when app is closed)
  sendPushToUser(env.DB, input.userId, {
    title: input.title,
    body: input.body || undefined,
    url: input.link || "/compte/notifications",
  }).catch(() => {});

  return stored;
}

/** Fan-out to staff. Staff count is small by design, so this stays bounded. */
export async function notifyStaff(
  env: Env,
  roles: ("MODERATOR" | "ADMIN")[],
  input: Omit<NewNotification, "userId">,
): Promise<void> {
  const placeholders = roles.map(() => "?").join(",");
  const staff = await env.DB.prepare(
    `SELECT id FROM users WHERE role IN (${placeholders}) AND status = 'ACTIVE'`,
  )
    .bind(...roles)
    .all<{ id: string }>();

  for (const member of staff.results ?? []) {
    await notifyUser(env, { ...input, userId: member.id });
  }
}

export function listingModerationLink(listingId: string): string {
  return `/mod/annonces/${listingId}`;
}
