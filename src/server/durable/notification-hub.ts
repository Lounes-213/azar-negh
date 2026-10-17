import type { Env } from "../types";
import type { RealtimeFrame, RealtimeNotification } from "../../shared/realtime";
import { hmacHex, timingSafeEqual } from "../lib/crypto";

export interface HubToken {
  userId: string;
  expiresAt: number;
  signature: string;
}

export async function signHubToken(
  secret: string,
  userId: string,
  ttlSeconds = 300,
): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = await hmacHex(secret, `ws:${userId}:${expiresAt}`);
  return `${expiresAt}.${signature}`;
}

export async function verifyHubToken(
  secret: string,
  userId: string,
  token: string,
): Promise<boolean> {
  const [expiresRaw, signature] = token.split(".");
  if (!expiresRaw || !signature) return false;
  const expiresAt = Number(expiresRaw);
  if (!Number.isInteger(expiresAt) || expiresAt * 1000 <= Date.now()) return false;
  const expected = await hmacHex(secret, `ws:${userId}:${expiresAt}`);
  return timingSafeEqual(expected, signature);
}

const MAX_SOCKETS_PER_USER = 5;

/**
 * One Durable Object per user ("inbox:<userId>" via idFromName). There is no
 * global broadcast object, so notification traffic is naturally sharded.
 */
export class NotificationHub {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    // Heartbeats are answered by the runtime without waking the object.
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      return this.handleUpgrade(request, url);
    }

    if (url.pathname === "/notify" && request.method === "POST") {
      const body = await request.text();
      if (body.length > 8192) return new Response("Payload too large", { status: 413 });
      const userId = request.headers.get("x-azar-user") ?? "";
      const signature = request.headers.get("x-azar-signature") ?? "";
      const expected = await hmacHex(this.env.SESSION_SECRET, `notify:${userId}:${body}`);
      if (!userId || !timingSafeEqual(expected, signature)) {
        return new Response("Forbidden", { status: 403 });
      }
      let payload: { notification: RealtimeNotification; unread: number };
      try {
        payload = JSON.parse(body);
      } catch {
        return new Response("Bad request", { status: 400 });
      }
      this.broadcast({ type: "notification", notification: payload.notification });
      this.broadcast({ type: "unread", unread: payload.unread });
      return new Response(null, { status: 204 });
    }

    return new Response("Not found", { status: 404 });
  }

  private async handleUpgrade(request: Request, url: URL): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const userId = url.searchParams.get("user") ?? "";
    const token = url.searchParams.get("token") ?? "";
    if (!userId || !(await verifyHubToken(this.env.SESSION_SECRET, userId, token))) {
      return new Response("Unauthorized", { status: 401 });
    }

    const sockets = this.state.getWebSockets(userId);
    for (const stale of sockets.slice(0, Math.max(0, sockets.length - MAX_SOCKETS_PER_USER + 1))) {
      try {
        stale.close(1008, "Too many connections");
      } catch {
        // already closed
      }
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server, [userId]);

    const unreadRow = await this.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL",
    )
      .bind(userId)
      .first<{ count: number }>();
    this.send(server, { type: "ready", unread: unreadRow?.count ?? 0 });
    return new Response(null, { status: 101, webSocket: client });
  }

  private send(ws: WebSocket, frame: RealtimeFrame): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      // Socket closed between lookup and send; ignore.
    }
  }

  private broadcast(frame: RealtimeFrame): void {
    const encoded = JSON.stringify(frame);
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(encoded);
      } catch {
        // ignore closed sockets
      }
    }
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== "string" || message.length > 1024) {
      ws.close(1009, "Message too large");
      return;
    }
    if (message === "ping") {
      this.send(ws, { type: "pong" });
      return;
    }
    // Client frames are not trusted and carry no state-changing commands.
  }

  webSocketClose(ws: WebSocket, code: number, _reason: string, _wasClean: boolean): void {
    try {
      ws.close(code === 1000 ? 1000 : 1001, "closed");
    } catch {
      // already closed
    }
  }

  webSocketError(ws: WebSocket): void {
    try {
      ws.close(1011, "error");
    } catch {
      // already closed
    }
  }
}
