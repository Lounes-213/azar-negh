import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { AppNotification, Paginated } from "../../shared/types";
import { EmptyState, Pagination, Spinner, useToast } from "../components/ui";
import { Icon, type IconName } from "../components/Icons";
import { api, errorMessage } from "../lib/api";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { useRealtime } from "../lib/realtime";
import { timeAgo } from "../lib/format";

const TONES: Record<string, { icon: IconName; tone: string }> = {
  LISTING_APPROVED: { icon: "check", tone: "badge-success" },
  LISTING_REJECTED: { icon: "x", tone: "badge-danger" },
  LISTING_REMOVED: { icon: "alert", tone: "badge-danger" },
  LISTING_SUBMITTED: { icon: "send", tone: "badge-info" },
  REPORT_CREATED: { icon: "flag", tone: "badge-warning" },
  ACCOUNT_UPDATED: { icon: "user", tone: "badge-info" },
};

export function Notifications() {
  const { t, lang } = useI18n();
  const { push } = useToast();
  const { unread, refreshUnread } = useRealtime();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  useDocumentTitle(t("notifications.title"));

  const state = useAsync(
    () =>
      api<{ notifications: Paginated<AppNotification>; unread: number }>(
        `/notifications?page=${page}&perPage=20`,
      ),
    [page],
  );

  useEffect(() => {
    const onChange = () => state.reload();
    window.addEventListener("azar:notification", onChange);
    return () => window.removeEventListener("azar:notification", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNotification = async (notification: AppNotification) => {
    if (!notification.read) {
      try {
        await api(`/notifications/${notification.id}/read`, { method: "POST" });
        await refreshUnread();
      } catch (error) {
        push(errorMessage(error), "error");
      }
    }
    if (notification.link) navigate(notification.link);
    else state.reload();
  };

  const readAll = async () => {
    try {
      await api("/notifications/read-all", { method: "POST" });
      await refreshUnread();
      state.reload();
    } catch (error) {
      push(errorMessage(error), "error");
    }
  };

function PushNotificationCard() {
  const { push } = useToast();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window) {
      setSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  if (!supported) return null;

  const enablePush = async () => {
    try {
      setLoading(true);
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        push("يرجى السماح بالإشعارات في إعدادات المتصفح.", "default");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const vapidRes = await api<{ publicKey: string }>("/push/vapid-key");

      const padding = "=".repeat((4 - (vapidRes.publicKey.length % 4)) % 4);
      const base64 = (vapidRes.publicKey + padding).replace(/-/g, "+").replace(/_/g, "/");
      const rawData = window.atob(base64);
      const applicationServerKey = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        applicationServerKey[i] = rawData.charCodeAt(i);
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      const jsonSub = sub.toJSON();
      await api("/push/subscribe", {
        method: "POST",
        body: JSON.stringify({
          endpoint: jsonSub.endpoint,
          keys: jsonSub.keys,
        }),
      });

      push("تم تفعيل إشعارات الهاتف بنجاح! ستصلك التنبيهات حتى والشاشة مغلقة 🔔", "success");
    } catch (err) {
      console.error("enablePush error:", err);
      push("حدث خطأ أثناء تفعيل الإشعارات.", "error");
    } finally {
      setLoading(false);
    }
  };

  const testPush = async () => {
    try {
      setTesting(true);
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        await enablePush();
        return;
      }
      await api("/push/test", {
        method: "POST",
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      push("تم إرسال إشعار تجريبي! اقفل شاشة الهاتف أو بدّل التطبيق لتشاهد الإشعار المنبثق 📲", "success");
    } catch (err) {
      console.error("testPush error:", err);
      push("فشل إرسال الإشعار التجريبي.", "error");
    } finally {
      setTesting(false);
    }
  };

  if (permission === "granted") {
    return (
      <div
        className="card"
        style={{
          padding: "14px 18px",
          marginBottom: 20,
          background: "linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(5, 150, 105, 0.03))",
          border: "1px solid rgba(16, 185, 129, 0.25)",
          borderRadius: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#10b981", fontSize: 20 }}>🔔</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>إشعارات الهاتف مفعّلة ونشطة</div>
            <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
              تصلك التنبيهات في أي وقت حتى لو كان هاتفك مقفولاً أو المتصفح مغلقاً.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={testPush}
          className="btn btn-secondary btn-sm"
          disabled={testing}
          style={{ borderRadius: 8 }}
        >
          {testing ? "جاري الإرسال..." : "📲 جرّب إشعار الهاتف الآن"}
        </button>
      </div>
    );
  }

  return (
    <div
      className="card"
      style={{
        padding: "16px 20px",
        marginBottom: 20,
        background: "linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.04))",
        border: "1px solid rgba(16, 185, 129, 0.3)",
        borderRadius: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "var(--brand)",
            color: "white",
            display: "grid",
            placeItems: "center",
            fontSize: 22,
            boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
          }}
        >
          🔔
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>تفعيل إشعارات الهاتف (حتى والشاشة مغلقة)</div>
          <div style={{ fontSize: "0.86rem", color: "var(--muted)", marginTop: 2 }}>
            لا تفوت أي رسالة من زبون أو تحديث لإعلاناتك عندما تكون خارج التطبيق.
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={enablePush}
        className="btn btn-primary"
        disabled={loading}
        style={{ minWidth: 170, borderRadius: 10, fontWeight: 700 }}
      >
        {loading ? "جاري التفعيل..." : "🔔 تفعيل الإشعارات الآن"}
      </button>
    </div>
  );
}

  return (
    <div className="container page page-narrow">
      <div className="page-head">
        <div>
          <h1>{t("notifications.title")}</h1>
          <p>{unread > 0 ? `${unread} non lue(s)` : "Tout est à jour."}</p>
        </div>
        {unread > 0 ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={readAll}>
            {t("notifications.readAll")}
          </button>
        ) : null}
      </div>

      <PushNotificationCard />

      {state.loading ? (
        <Spinner />
      ) : !state.data || state.data.notifications.items.length === 0 ? (
        <EmptyState
          icon="bell"
          title={t("notifications.empty")}
          text="Les décisions de modération et les mises à jour de vos annonces apparaîtront ici."
        />
      ) : (
        <>
          <div className="card">
            {state.data.notifications.items.map((notification) => {
              const meta = TONES[notification.type] ?? { icon: "bell" as IconName, tone: "badge" };
              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => openNotification(notification)}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    width: "100%",
                    textAlign: "start",
                    padding: "14px 16px",
                    border: 0,
                    borderBottom: "1px solid var(--line)",
                    background: notification.read ? "transparent" : "var(--brand-50)",
                    cursor: "pointer",
                  }}
                >
                  <span className={`badge ${meta.tone}`} style={{ padding: 8, borderRadius: 10 }}>
                    <Icon name={meta.icon} size={16} />
                  </span>
                  <span className="grow">
                    <span className="strong" style={{ display: "block" }}>
                      {notification.title}
                    </span>
                    {notification.body ? (
                      <span className="small muted">{notification.body}</span>
                    ) : null}
                    <span className="small muted" style={{ display: "block", marginTop: 4 }}>
                      {timeAgo(notification.createdAt, lang)}
                    </span>
                  </span>
                  {!notification.read ? (
                    <span
                      aria-label="Non lue"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "var(--brand-600)",
                        marginTop: 8,
                      }}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
          <Pagination
            page={state.data.notifications.page}
            totalPages={state.data.notifications.totalPages}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}
