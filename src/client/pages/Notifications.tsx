import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { AppNotification, Paginated } from "../../shared/types";
import { EmptyState, Pagination, Spinner, useToast } from "../components/ui";
import { Icon, type IconName } from "../components/Icons";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
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

export function PushNotificationCard() {
  const { push } = useToast();
  const { lang } = useI18n();
  const isAr = lang === "ar";
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
          try {
            await api("/push/unsubscribe", {
              method: "POST",
              body: { endpoint: sub.endpoint },
            });
          } catch {}
          try {
            await sub.unsubscribe();
          } catch {}
        }
        setIsSubscribed(false);
        push(isAr ? "تم إلغاء تفعيل إشعارات الهاتف." : "Notifications désactivées.", "default");
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          push(
            isAr
              ? "يرجى السماح بالإشعارات من إعدادات المتصفح لتفعيل التنبيهات."
              : "Veuillez autoriser les notifications dans les paramètres de votre navigateur.",
            "error"
          );
          return;
        }

        const vapidRes = await api<{ publicKey: string }>("/push/vapid-key");
        if (!vapidRes?.publicKey) {
          throw new Error("Clé VAPID introuvable.");
        }

        const padding = "=".repeat((4 - (vapidRes.publicKey.length % 4)) % 4);
        const base64 = (vapidRes.publicKey + padding).replace(/-/g, "+").replace(/_/g, "/");
        const rawData = window.atob(base64);
        const applicationServerKey = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          applicationServerKey[i] = rawData.charCodeAt(i);
        }

        // Clean up any stale subscription first to prevent DOMException: A subscription with a different applicationServerKey already exists
        const existingSub = await reg.pushManager.getSubscription();
        if (existingSub) {
          try {
            await existingSub.unsubscribe();
          } catch (e) {
            console.warn("Could not unsubscribe stale push subscription:", e);
          }
        }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });

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
        push(isAr ? "تم تفعيل إشعارات الهاتف بنجاح." : "Notifications activées avec succès.", "success");
      }
    } catch (err: any) {
      console.error("toggleSubscription error:", err);
      push(
        isAr
          ? "تعذر تفعيل الإشعارات، يرجى التأكد من إعدادات المتصفح."
          : "Impossible d'activer les notifications.",
        "error"
      );
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
            {isAr ? "إشعارات الهاتف والمتصفح" : "Notifications de l'appareil"}
          </span>
          <span
            className={`badge ${isSubscribed ? "badge-success" : ""}`}
            style={{ fontSize: "0.75rem", padding: "2px 8px", borderRadius: 6 }}
          >
            {isSubscribed ? (isAr ? "مفعلة" : "Actives") : (isAr ? "غير مفعلة" : "Inactives")}
          </span>
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 4 }}>
          {isSubscribed
            ? (isAr
                ? "الإشعارات نشطة وتصلك في الخلفية عند وصول رسائل جديدة أو تحديث حالة إعلاناتك."
                : "Les notifications sont actives en arrière-plan pour vos annonces et messages.")
            : (isAr
                ? "تلقي تنبيهات سريعة على جهازك عند حدوث أي تفاعل جديد في حسابك."
                : "Recevez des alertes instantanées sur votre appareil lors de nouvelles activités.")}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={toggleSubscription}
          disabled={loading}
          className={`btn btn-sm ${isSubscribed ? "btn-secondary" : "btn-primary"}`}
          style={{ minWidth: 100 }}
        >
          {loading ? "..." : isSubscribed ? (isAr ? "تعطيل" : "Désactiver") : (isAr ? "تفعيل" : "Activer")}
        </button>
      </div>
    </div>
  );
}

export function Notifications() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const isAr = lang === "ar";
  const { push } = useToast();
  const { unread, refreshUnread } = useRealtime();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  useDocumentTitle(t("notifications.title"));

  const state = useAsync(
    () =>
      user
        ? api<{ notifications: Paginated<AppNotification>; unread: number }>(
            `/notifications?page=${page}&perPage=20`,
          )
        : Promise.resolve({
            notifications: { items: [], page: 1, perPage: 20, total: 0, totalPages: 1 },
            unread: 0,
          }),
    [user, page],
  );

  useEffect(() => {
    const onChange = () => {
      if (user) state.reload();
    };
    window.addEventListener("azar:notification", onChange);
    return () => window.removeEventListener("azar:notification", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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

  return (
    <div className="container page page-narrow">
      <div className="page-head">
        <div>
          <h1>{t("notifications.title")}</h1>
          <p>
            {user
              ? unread > 0
                ? `${unread} non lue(s)`
                : isAr
                ? "كل الإشعارات مقروءة."
                : "Tout est à jour."
              : isAr
              ? "إعدادات الإشعارات وتنبيهات الهاتف"
              : "Paramètres des notifications push"}
          </p>
        </div>
        {user && unread > 0 ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={readAll}>
            {t("notifications.readAll")}
          </button>
        ) : null}
      </div>

      <PushNotificationCard />

      {!user ? (
        <div
          className="card stack"
          style={{
            padding: "clamp(1.5rem, 3vw, 2rem)",
            textAlign: "center",
            alignItems: "center",
            gap: 12,
            border: "1px dashed var(--line)",
            borderRadius: "var(--radius-lg)",
            marginTop: 8,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "rgba(16, 185, 129, 0.1)",
              display: "grid",
              placeItems: "center",
              color: "var(--brand-600)",
            }}
          >
            <Icon name="bell" size={24} />
          </div>
          <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>
            {isAr ? "تسجيل الدخول لعرض سجل إشعارات حسابك" : "Connectez-vous pour voir vos alertes"}
          </h3>
          <p className="small muted" style={{ maxWidth: 440, margin: 0 }}>
            {isAr
              ? "يمكنك تفعيل تنبيهات الهاتف أعلاه لتلقي إشعارات فورية. لتتبع رسائل المشترين وحالة إعلاناتك، سجّل الدخول إلى حسابك."
              : "Activez les alertes push ci-dessus. Pour suivre vos annonces et recevoir les messages, connectez-vous à votre compte."}
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => navigate("/connexion")}
            >
              {isAr ? "تسجيل الدخول" : "Connexion"}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigate("/connexion?mode=register")}
            >
              {isAr ? "إنشاء حساب جديد" : "Créer un compte"}
            </button>
          </div>
        </div>
      ) : state.loading ? (
        <Spinner />
      ) : !state.data || state.data.notifications.items.length === 0 ? (
        <EmptyState
          icon="bell"
          title={t("notifications.empty")}
          text={
            isAr
              ? "ستظهر قرارات الإشراف وتحديثات إعلاناتك ورسائلك هنا فور وصولها."
              : "Les décisions de modération et les mises à jour de vos annonces apparaîtront ici."
          }
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
