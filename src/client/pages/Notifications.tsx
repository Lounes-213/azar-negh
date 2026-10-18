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
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window) {
      setSupported(true);
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub && Notification.permission === "granted");
        });
      });
    }
  }, []);

  if (!supported) return null;

  const toggleSubscription = async () => {
    try {
      setLoading(true);
      const reg = await navigator.serviceWorker.ready;

      if (isSubscribed) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await api("/push/unsubscribe", {
            method: "POST",
            body: { endpoint: sub.endpoint },
          }).catch(() => {});
          await sub.unsubscribe();
        }
        setIsSubscribed(false);
        push("تم إلغاء تفعيل إشعارات الهاتف.", "default");
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          push("يرجى السماح بالإشعارات من إعدادات المتصفح.", "default");
          return;
        }

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
        if (jsonSub.endpoint && jsonSub.keys) {
          await api("/push/subscribe", {
            method: "POST",
            body: {
              endpoint: jsonSub.endpoint,
              keys: jsonSub.keys,
            },
          });
        }
        setIsSubscribed(true);
        push("تم تفعيل إشعارات الهاتف بنجاح.", "success");
      }
    } catch (err) {
      console.error("toggleSubscription error:", err);
      push("حدث خطأ، يرجى المحاولة لاحقاً.", "error");
    } finally {
      setLoading(false);
    }
  };

  const testPush = async () => {
    try {
      setLoading(true);
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        push("يرجى تفعيل الإشعارات أولاً.", "default");
        return;
      }

      if ("Notification" in window && Notification.permission === "granted") {
        try {
          if (reg?.showNotification) {
            reg.showNotification("Azar Neɣ", {
              body: "إشعار تجريبي: النظام يعمل بنجاح في الخلفية.",
              icon: "/brand/icon-192.png",
              badge: "/brand/icon-192.png",
              data: { url: "/compte/notifications" },
            } as any);
          }
        } catch {}
      }

      await api("/push/test", {
        method: "POST",
        body: { endpoint: sub.endpoint },
      });
      push("تم إرسال إشعار تجريبي إلى جهازك.", "success");
    } catch {
      push("تعذر إرسال الإشعار التجريبي.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="card"
      style={{
        padding: "16px 20px",
        marginBottom: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        borderRadius: "var(--radius-lg, 12px)",
        border: "1px solid var(--line)",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: "0.98rem", color: "var(--text)" }}>
            إشعارات الهاتف والمتصفح (Web Push)
          </span>
          <span
            className={`badge ${isSubscribed ? "badge-success" : ""}`}
            style={{ fontSize: "0.75rem", padding: "2px 8px", borderRadius: 6 }}
          >
            {isSubscribed ? "مفعلة" : "غير مفعلة"}
          </span>
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 4 }}>
          {isSubscribed
            ? "الإشعارات نشطة وتصلك في الخلفية عند وصول رسائل جديدة أو تحديث حالة إعلاناتك."
            : "تلقي تنبيهات سريعة على جهازك عند حدوث أي تفاعل جديد في حسابك."}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {isSubscribed ? (
          <button
            type="button"
            onClick={testPush}
            disabled={loading}
            className="btn btn-secondary btn-sm"
          >
            تجربة
          </button>
        ) : null}

        <button
          type="button"
          onClick={toggleSubscription}
          disabled={loading}
          className={`btn btn-sm ${isSubscribed ? "btn-secondary" : "btn-primary"}`}
          style={{ minWidth: 100 }}
        >
          {loading ? "..." : isSubscribed ? "تعطيل" : "تفعيل"}
        </button>
      </div>
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
