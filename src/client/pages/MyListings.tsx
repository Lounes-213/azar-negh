import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { ListingStatus, ListingSummary, Paginated } from "../../shared/types";
import {
  Button,
  Dialog,
  EmptyState,
  Field,
  Pagination,
  SkeletonStack,
  StatusBadge,
  Textarea,
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
  const [appealListing, setAppealListing] = useState<ListingSummary | null>(null);
  const [appealRemark, setAppealRemark] = useState("");
  const [appealBusy, setAppealBusy] = useState(false);
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
                    </>
                  }
                />
                {listing.status === "REJECTED" && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "10px 12px",
                      background: "rgba(239, 68, 68, 0.08)",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <div
                      style={{
                        color: "var(--danger)",
                        fontWeight: 600,
                        fontSize: "0.88rem",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Icon name="alert" size={15} />
                      <span>
                        {lang === "ar" ? "سبب رفض الإعلان :" : "Motif de refus :"} {listing.rejectionReason || (lang === "ar" ? "السعر أو البيانات بحاجة لمراجعة" : "Données ou prix à vérifier")}
                      </span>
                    </div>

                    {listing.sellerRemark ? (
                      <div
                        style={{
                          marginTop: 6,
                          padding: "6px 10px",
                          background: "var(--surface)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "0.82rem",
                          color: "var(--ink-muted)",
                          border: "1px solid var(--line)",
                        }}
                      >
                        💬 <strong>{lang === "ar" ? "توضيحك المرسل للإدارة :" : "Votre remarque envoyée :"}</strong>{" "}
                        {listing.sellerRemark}
                      </div>
                    ) : null}

                    <div style={{ marginTop: 8 }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setAppealListing(listing);
                          setAppealRemark(listing.sellerRemark || "");
                        }}
                        style={{ fontSize: "0.82rem", padding: "4px 10px" }}
                      >
                        💬 {lang === "ar" ? "إرسال توضيح / ملاحظة للإدارة" : "Envoyer une remarque à l'admin"}
                      </Button>
                    </div>
                  </div>
                )}
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

      {/* Confirmation modal for delete */}
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

      {/* Appeal / Remark to Admin dialog */}
      <Dialog
        open={Boolean(appealListing)}
        onClose={() => setAppealListing(null)}
        title={lang === "ar" ? "إرسال ملاحظة وتوضيح للإدارة" : "Envoyer une remarque à l'administrateur"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAppealListing(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              loading={appealBusy}
              disabled={!appealRemark.trim()}
              onClick={async () => {
                if (!appealListing || !appealRemark.trim()) return;
                setAppealBusy(true);
                try {
                  await api(`/listings/${appealListing.id}/appeal`, {
                    method: "POST",
                    body: JSON.stringify({ remark: appealRemark.trim() }),
                  });
                  push(
                    lang === "ar"
                      ? "تم إرسال توضيحك بنجاح، وتمت إعادة توجيه الإعلان للمراجعة !"
                      : "Remarque transmise à l'administrateur ! L'annonce est de nouveau en révision.",
                    "success",
                  );
                  setAppealListing(null);
                  setAppealRemark("");
                  state.reload();
                } catch (err) {
                  push(errorMessage(err), "error");
                } finally {
                  setAppealBusy(false);
                }
              }}
            >
              {lang === "ar" ? "إرسال التوضيح" : "Envoyer la remarque"}
            </Button>
          </>
        }
      >
        <div className="stack" style={{ gap: 12 }}>
          <div className="small">
            <strong>{lang === "ar" ? "الإعلان :" : "Annonce :"}</strong> {appealListing?.title}
          </div>
          {appealListing?.rejectionReason ? (
            <div
              style={{
                padding: "8px 12px",
                background: "rgba(239, 68, 68, 0.08)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.85rem",
                color: "var(--danger)",
              }}
            >
              <strong>{lang === "ar" ? "سبب الرفض :" : "Motif de refus :"}</strong> {appealListing.rejectionReason}
            </div>
          ) : null}
          <Field
            label={lang === "ar" ? "توضيحك أو ردك على سبب الرفض" : "Votre explication / justificatif"}
            htmlFor="appeal-text"
            hint={
              lang === "ar"
                ? "اشرح للإدارة لماذا السعر دقيق أو مبرر، وسيتم مراجعة إعلانك مرة أخرى."
                : "Expliquez à l'admin les détails nécessaires (prix réel vérifié, factures, détails...)."
            }
            required
          >
            <Textarea
              id="appeal-text"
              rows={4}
              value={appealRemark}
              onChange={(e) => setAppealRemark(e.target.value)}
              placeholder={
                lang === "ar"
                  ? "اكتب توضيحك هنا للإدارة (مثال: السعر مبرر لأن الهاتف بحالة ممتازة مع العلبة الأصلية والشاحن...)"
                  : "Ex. Le prix est justifié car l'appareil est comme neuf avec facture d'achat et accessoires d'origine..."
              }
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
