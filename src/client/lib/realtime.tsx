import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import { useToast } from "../components/ui";
import type { RealtimeFrame } from "../../shared/realtime";

interface RealtimeValue {
  unread: number;
  connected: boolean;
  refreshUnread: () => Promise<void>;
}

const RealtimeContext = createContext<RealtimeValue>({
  unread: 0,
  connected: false,
  refreshUnread: async () => {},
});

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { push } = useToast();
  const [unread, setUnread] = useState(0);
  const [connected, setConnected] = useState(false);

  const refreshUnread = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api<{ unread: number }>("/notifications/unread-count");
      setUnread(data.unread);
    } catch {
      // Badge stays at its last value; the socket may still recover.
    }
  }, [user]);

  useEffect(() => {
    // Signed-out visitors simply do not open a socket; the values they read are
    // masked below, so no state reset (and no cascading render) is needed here.
    if (!user) return;
    // The badge is seeded by the socket's own `ready` frame (which carries the
    // unread count), so no extra HTTP round-trip is fired from the effect.

    let socket: WebSocket | null = null;
    let disposed = false;
    let attempt = 0;
    let heartbeat: number | undefined;
    let reconnect: number | undefined;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${protocol}://${window.location.host}/api/ws`);

      socket.onopen = () => {
        if (disposed) return;
        setConnected(true);
        attempt = 0;
        heartbeat = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
        }, 25_000);
      };

      socket.onmessage = (event) => {
        let frame: RealtimeFrame;
        try {
          frame = JSON.parse(String(event.data)) as RealtimeFrame;
        } catch {
          return;
        }
        if (frame.type === "ready" || frame.type === "unread") {
          setUnread(frame.unread);
          if (frame.type === "unread") window.dispatchEvent(new Event("azar:notification"));
        }
        if (frame.type === "notification") {
          push(frame.notification.title, "default");
          window.dispatchEvent(new Event("azar:notification"));
        }
      };

      socket.onclose = () => {
        setConnected(false);
        window.clearInterval(heartbeat);
        if (disposed) return;
        const delay = Math.min(30_000, 1_000 * 2 ** attempt);
        attempt += 1;
        reconnect = window.setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      window.clearInterval(heartbeat);
      window.clearTimeout(reconnect);
      socket?.close(1000, "unmount");
    };
  }, [user, refreshUnread, push]);

  const value = useMemo(
    () => ({ unread: user ? unread : 0, connected: user ? connected : false, refreshUnread }),
    [user, unread, connected, refreshUnread],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeValue {
  return useContext(RealtimeContext);
}
