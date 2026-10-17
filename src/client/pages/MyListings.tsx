import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { ListingStatus, ListingSummary, Paginated } from "../../shared/types";
import {
  Button,
  Dialog,
  EmptyState,
  Pagination,
  SkeletonStack,
  StatusBadge,
  useToast,
} from "../components/ui";
import { ListingCard } from "../components/ListingCard";
import { Icon } from "../components/Icons";
import { api, errorMessage } from "../lib/api";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { formatDate } from "../lib/format";

const STATUSES: ListingStatus[] = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "SOLD", "ARCHIVED"];

export function MyListings() {
  const { t, lang } = useI18n();
  const { push } = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useDocumentTitle(t("account.myListings"));

  const state = useAsync(
    () =>
      api<{ listings: Paginated<ListingSummary> }>(
        `/account/listings?page=${page}&perPage=20${status ? `&status=${status}` : ""}`,
      ),
    [page, status],
  );

  const run = async (id: string, path: string, method: "POST" | "DELETE", success: string) => {
    setBusy(id + path);
    try {
      await api(`/listings/${id}${path}`, { method });
      push(success, "success");
      state.reload();
    } catch (error) {
      push(errorMessage(error), "error");
    } finally {
      setBusy(null);
    }
  };

  const setStatus = (next: string) => {
    const query = new URLSearchParams();
    if (next) query.set("status", next);
    setParams(query);
  };

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>{t("account.myListings")}</h1>
          <p>Gérez vos brouillons, suivez la modération et mettez à jour vos annonces.</p>
        </div>
        <Link to="/vendre" className="btn">
          <Icon name="plus" size={16} /> {t("sell.new")}
        </Link>
      </div>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={!status}
          className={`tab ${!status ? "active" : ""}`}
          onClick={() => setStatus("")}
        >
          {t("common.allF")}
        </button>
        {STATUSES.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={status === item}
            className={`tab ${status === item ? "active" : ""}`}
            onClick={() => setStatus(item)}
          >
            {t(`status.${item}`)}
          </button>
        ))}
      </div>

      {state.loading ? (
        <SkeletonStack count={4} />
      ) : state.error ? (
        <EmptyState icon="alert" title={t("common.error")} text={errorMessage(state.error)} />
      ) : !state.data || state.data.listings.items.length === 0 ? (
        <EmptyState
          icon="tag"
          title="Aucune annonce dans cette catégorie"
          text="Publiez votre première annonce : elle sera vérifiée par un modérateur avant sa mise en ligne."
          action={
            <Link to="/vendre" className="btn">
              {t("home.cta")}
            </Link>
          }
        />
      ) : (
        <>
          <div className="listing-grid">
            {state.data.listings.items.map((listing) => (
              <div key={listing.id} className="stack" style={{ gap: 0 }}>
                <ListingCard
                  listing={listing}
                  showStatus
                  ownerActions={
                    <>
                      {(listing.status === "DRAFT" || listing.status === "REJECTED") && (
                        <>
                          <Link to={`/vendre/${listing.id}`} className="btn btn-secondary btn-sm">
                            <Icon name="edit" size={14} /> {t("common.edit")}
                          </Link>
                          <Button
                            size="sm"
                            loading={busy === `${listing.id}/submit`}
                            onClick={() =>
                              run(listing.id, "/submit", "POST", "Annonce soumise à la modération.")
                            }
                          >
                            {t("sell.publish")}
                          </Button>
                        </>
                      )}
                      {listing.status === "APPROVED" && (
                        <>
                          <Link to={`/vendre/${listing.id}`} className="btn btn-secondary btn-sm">
                            <Icon name="edit" size={14} /> {t("common.edit")}
                          </Link>
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={busy === `${listing.id}/sold`}
                            onClick={() =>
                              run(listing.id, "/sold", "POST", "Annonce marquée comme vendue.")
                            }
                          >
                            <Icon name="check" size={14} /> Vendue
                          </Button>
                        </>
                      )}
                      {listing.status === "SOLD" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={busy === `${listing.id}/relist`}
                          onClick={() =>
                            run(listing.id, "/relist", "POST", "Annonce remise en ligne.")
                          }
                        >
                          <Icon name="refresh" size={14} /> Remettre en ligne
                        </Button>
                      )}
                      {["DRAFT", "REJECTED", "ARCHIVED"].includes(listing.status) && (
                        <Button size="sm" variant="ghost" onClick={() => setDeleteId(listing.id)}>
                          <Icon name="trash" size={14} /> {t("common.delete")}
                        </Button>
                      )}
                    </>
                  }
                />
                {listing.rejectionReason ? (
                  <p className="reject-reason" style={{ marginTop: 6 }}>
                    <strong>Motif :</strong> {listing.rejectionReason}
                  </p>
                ) : null}
                <p className="small muted" style={{ padding: "6px 4px" }}>
                  <StatusBadge status={listing.status} /> Mis à jour le{" "}
                  {formatDate(listing.publishedAt ?? listing.createdAt, lang)}
                </p>
              </div>
            ))}
          </div>
          <Pagination
            page={state.data.listings.page}
            totalPages={state.data.listings.totalPages}
            onChange={(nextPage) => {
              const query = new URLSearchParams(params);
              query.set("page", String(nextPage));
              setParams(query);
            }}
          />
        </>
      )}

      <Dialog
        open={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        title="Supprimer l'annonce ?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              loading={busy === `${deleteId}/delete`}
              onClick={async () => {
                if (!deleteId) return;
                setBusy(`${deleteId}/delete`);
                try {
                  await api(`/listings/${deleteId}`, { method: "DELETE" });
                  push("Annonce supprimée.", "success");
                  setDeleteId(null);
                  state.reload();
                } catch (error) {
                  push(errorMessage(error), "error");
                } finally {
                  setBusy(null);
                }
              }}
            >
              {t("common.delete")}
            </Button>
          </>
        }
      >
        <p className="small">Cette action est définitive et supprime aussi les photos.</p>
      </Dialog>
    </div>
  );
}
