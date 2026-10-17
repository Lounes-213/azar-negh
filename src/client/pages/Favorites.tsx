import { useState } from "react";
import { Link } from "react-router";
import type { ListingSummary, Paginated } from "../../shared/types";
import { EmptyState, Pagination, SkeletonStack } from "../components/ui";
import { ListingCard } from "../components/ListingCard";
import { api } from "../lib/api";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";

export function Favorites() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  useDocumentTitle(t("account.favorites"));
  const state = useAsync(
    () => api<{ listings: Paginated<ListingSummary> }>(`/favorites?page=${page}&perPage=24`),
    [page],
  );

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>{t("account.favorites")}</h1>
          <p>Retrouvez les annonces que vous avez sauvegardées.</p>
        </div>
        <Link to="/annonces" className="btn btn-secondary">
          {t("nav.browse")}
        </Link>
      </div>

      {state.loading ? (
        <SkeletonStack count={4} />
      ) : !state.data || state.data.listings.items.length === 0 ? (
        <EmptyState
          icon="heart"
          title="Aucun favori pour le moment"
          text="Touchez le cœur sur une annonce pour la retrouver ici."
          action={
            <Link to="/annonces" className="btn">
              {t("nav.browse")}
            </Link>
          }
        />
      ) : (
        <>
          <div className="listing-grid">
            {state.data.listings.items.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
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
