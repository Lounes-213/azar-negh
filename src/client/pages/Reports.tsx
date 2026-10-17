import { useState } from "react";
import { Link } from "react-router";
import type { Paginated, ReportItem } from "../../shared/types";
import { Button, EmptyState, Pagination, Spinner, StatusBadge, useToast } from "../components/ui";
import { Icon } from "../components/Icons";
import { api, errorMessage } from "../lib/api";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { timeAgo } from "../lib/format";

const REASON_LABELS: Record<string, string> = {
  FRAUD: "Arnaque / fraude",
  PROHIBITED: "Produit interdit",
  WRONG_CATEGORY: "Mauvaise catégorie",
  SPAM: "Spam / doublon",
  OTHER: "Autre",
};

export function Reports() {
  const { t, lang } = useI18n();
  const { push } = useToast();
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  useDocumentTitle(t("mod.reports"));

  const state = useAsync(
    () => api<{ reports: Paginated<ReportItem> }>(`/moderation/reports?page=${page}&perPage=20`),
    [page],
  );

  const resolve = async (id: string, status: "REVIEWED" | "DISMISSED") => {
    setBusy(id + status);
    try {
      await api(`/moderation/reports/${id}/resolve`, { method: "POST", body: { status } });
      push(
        status === "REVIEWED" ? "Signalement traité." : "Signalement classé sans suite.",
        "success",
      );
      state.reload();
    } catch (error) {
      push(errorMessage(error), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>{t("mod.reports")}</h1>
          <p>Signalements envoyés par les utilisateurs, du plus ancien au plus récent.</p>
        </div>
        <div className="row">
          <Link to="/mod" className="btn btn-secondary btn-sm">
            <Icon name="list" size={15} /> {t("mod.queue")}
          </Link>
          <Link to="/mod/signalements" className="btn btn-ghost btn-sm">
            <Icon name="flag" size={15} /> {t("mod.reports")}
          </Link>
        </div>
      </div>

      {state.loading ? (
        <Spinner />
      ) : !state.data || state.data.reports.items.length === 0 ? (
        <EmptyState
          icon="shield"
          title="Aucun signalement ouvert"
          text="Les signalements traités n'apparaissent plus ici."
        />
      ) : (
        <>
          <div className="stack">
            {state.data.reports.items.map((report) => (
              <article key={report.id} className="panel">
                <div className="row-between">
                  <div className="grow">
                    <div className="row wrap mb-2">
                      <span className="badge badge-warning">
                        {REASON_LABELS[report.reason] ?? report.reason}
                      </span>
                      <StatusBadge status={report.listingStatus} />
                      <span className="small muted">{timeAgo(report.createdAt, lang)}</span>
                    </div>
                    <h2 style={{ fontSize: "var(--text-md)" }}>{report.listingTitle}</h2>
                    {report.details ? <p className="small mt-1">{report.details}</p> : null}
                    <p className="small muted mt-1">Signalé par {report.reporterName}</p>
                  </div>
                  <div className="stack" style={{ minWidth: 150 }}>
                    <Link to={`/mod/annonces/${report.listingId}`} className="btn btn-sm">
                      Examiner <Icon name="arrow-right" size={14} />
                    </Link>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === report.id + "REVIEWED"}
                      onClick={() => resolve(report.id, "REVIEWED")}
                    >
                      Traité
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busy === report.id + "DISMISSED"}
                      onClick={() => resolve(report.id, "DISMISSED")}
                    >
                      Classer
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <Pagination
            page={state.data.reports.page}
            totalPages={state.data.reports.totalPages}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}
