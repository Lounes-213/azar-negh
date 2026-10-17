export interface RealtimeNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
}

export type RealtimeFrame =
  | { type: "ready"; unread: number }
  | { type: "notification"; notification: RealtimeNotification }
  | { type: "unread"; unread: number }
  | { type: "pong" };
