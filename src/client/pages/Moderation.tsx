import { useState } from "react";
import { Link } from "react-router";
import type { ListingSummary, Paginated } from "../../shared/types";
import { EmptyState, Pagination, SkeletonStack } from "../components/ui";
import { Icon } from "../components/Icons";
import { api } from "../lib/api";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { formatPrice, timeAgo } from "../lib/format";

export function Moderation() {
  const { t, lang } = useI18n();
  const [page, setPage] = useState(1);
  useDocumentTitle(t("mod.title"));
  const state = useAsync(
    () => api<{ listings: Paginated<ListingSummary> }>(`/moderation/queue?page=${page}&perPage=20`),
    [page],
  );

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>{t("mod.title")}</h1>
          <p>Vérifiez les annonces avant leur publication. Chaque décision est enregistrée.</p>
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
        <SkeletonStack count={4} />
      ) : !state.data || state.data.listings.items.length === 0 ? (
        <EmptyState
          icon="check"
          title={t("mod.noPending")}
          text="Les nouvelles annonces apparaîtront ici dès leur soumission."
        />
      ) : (
        <>
          <div className="queue-grid">
            {state.data.listings.items.map((listing) => (
              <article key={listing.id} className="mod-card">
                <div className="media">
                  {listing.coverImage ? (
                    <img src={listing.coverImage} alt="" loading="lazy" />
                  ) : (
                    <div className="placeholder" style={{ height: "100%" }}>
                      <Icon name="image" size={26} />
                    </div>
                  )}
                </div>
                <div className="body">
                  <span className="badge badge-warning">{t("status.PENDING")}</span>
                  <Link to={`/mod/annonces/${listing.id}`} className="strong">
                    {listing.title}
                  </Link>
                  <span className="price" style={{ fontSize: "var(--text-md)" }}>
                    {formatPrice(listing.priceDa, lang)}
                  </span>
                  <span className="small muted">
                    <Icon name="user" size={12} /> {listing.sellerDisplayName} ·{" "}
                    <Icon name="map-pin" size={12} />{" "}
                    {lang === "ar" ? listing.wilaya.nameAr : listing.wilaya.nameFr}
                  </span>
                  <span className="small muted">
                    <Icon name="clock" size={12} /> {timeAgo(listing.createdAt, lang)}
                  </span>
                  <Link to={`/mod/annonces/${listing.id}`} className="btn btn-sm mt-2">
                    Examiner <Icon name="arrow-right" size={14} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <Pagination
            page={state.data.listings.page}
            totalPages={state.data.listings.totalPages}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}
