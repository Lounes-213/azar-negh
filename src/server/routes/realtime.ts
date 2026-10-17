import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireUser } from "../lib/auth";
import { signHubToken } from "../durable/notification-hub";

export const realtimeRoutes = new Hono<AppEnv>();

realtimeRoutes.get("/ws", async (c) => {
  const user = requireUser(c);
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
    return c.json({ error: { code: "UPGRADE_REQUIRED", message: "WebSocket requis." } }, 426);
  }
  const token = await signHubToken(c.env.SESSION_SECRET, user.id);
  const stub = c.env.NOTIFICATIONS.get(c.env.NOTIFICATIONS.idFromName(user.id));
  const target = new URL("https://notification-hub/ws");
  target.searchParams.set("user", user.id);
  target.searchParams.set("token", token);
  return stub.fetch(target.toString(), {
    headers: { Upgrade: "websocket", Connection: "Upgrade" },
  });
});
