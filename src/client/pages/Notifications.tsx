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
