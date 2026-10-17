import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { ListingDetail, ModerationReview } from "../../shared/types";
import {
  Alert,
  Badge,
  Button,
  Field,
  Spinner,
  StatusBadge,
  Textarea,
  useToast,
} from "../components/ui";
import { Icon } from "../components/Icons";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { formatDate, formatPrice, phoneDisplay } from "../lib/format";

export function ModerationDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { push } = useToast();
  const navigate = useNavigate();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const state = useAsync(
    () =>
      api<{ listing: ListingDetail; reviews: ModerationReview[] }>(`/moderation/listings/${id}`),
    [id],
  );
  useDocumentTitle("Modération");

  if (state.loading) return <Spinner />;
  if (state.error || !state.data) {
    return (
      <div className="container page">
        <Alert tone="danger">{errorMessage(state.error)}</Alert>
      </div>
    );
  }

  const { listing, reviews } = state.data;
  const pending = listing.status === "PENDING";

  const decide = async (action: "APPROVE" | "REJECT" | "REMOVE") => {
    setError(null);
    if (action === "REJECT" && reason.trim().length < 5) {
      setError("Un motif de refus est obligatoire (5 caractères minimum).");
      return;
    }
    setBusy(action);
    try {
      await api(`/moderation/listings/${listing.id}/decision`, {
        method: "POST",
        body: { action, reason: reason.trim() || null },
      });
      push(
        action === "APPROVE"
          ? "Annonce approuvée et publiée."
          : action === "REJECT"
            ? "Annonce refusée."
            : "Annonce retirée.",
        "success",
      );
      navigate("/mod");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="container page">
      <nav className="breadcrumbs">
        <Link to="/mod">{t("mod.title")}</Link>
        <Icon name="chevron-right" size={13} />
        <span>{listing.title}</span>
      </nav>

      <div className="page-head">
        <div>
          <h1>{listing.title}</h1>
          <p>
            <StatusBadge status={listing.status} /> · {formatPrice(listing.priceDa, lang)} ·{" "}
            {lang === "ar" ? listing.wilaya.nameAr : listing.wilaya.nameFr}
          </p>
        </div>
        <Link to={`/annonces/${listing.id}`} className="btn btn-secondary btn-sm" target="_blank">
          <Icon name="eye" size={15} /> Voir la page
        </Link>
      </div>

      <div className="detail-layout">
        <div className="stack">
          <div className="panel">
            <h2 className="panel-title mb-2">Photos ({listing.images.length})</h2>
            {listing.images.length === 0 ? (
              <Alert tone="danger">
                Aucune photo. L'annonce ne peut pas être approuvée sans photo.
              </Alert>
            ) : (
              <div className="image-inspect">
                {listing.images.map((image, index) => (
                  <a key={image.id} href={image.url} target="_blank" rel="noopener noreferrer">
                    <img src={image.url} alt={`Photo ${index + 1}`} loading="lazy" />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <h2 className="panel-title mb-2">{t("listing.description")}</h2>
            <p className="description">{listing.description}</p>
            <div className="row wrap mt-4">
              <Badge tone="badge-brand">{t(`cond.${listing.condition}`)}</Badge>
              <Badge>{lang === "ar" ? listing.category.nameAr : listing.category.nameFr}</Badge>
              <Badge>{listing.negotiable ? t("common.negotiable") : "Prix fixe"}</Badge>
            </div>
          </div>

          <div className="panel">
            <h2 className="panel-title mb-2">Vendeur</h2>
            <p className="small">
              <strong>{listing.seller.displayName}</strong> · membre depuis{" "}
              {formatDate(listing.seller.memberSince, lang)}
            </p>
            <p className="small muted mt-1">
              <Icon name="phone" size={13} />{" "}
              {listing.seller.phone ? phoneDisplay(listing.seller.phone) : "Numéro non public"}
            </p>
            <p className="small muted mt-1">
              <Icon name="map-pin" size={13} /> {listing.seller.wilayaId} · {listing.viewCount}{" "}
              {t("listing.views")}
            </p>
            {listing.seller.bio ? <p className="small mt-2">{listing.seller.bio}</p> : null}
          </div>

          <div className="panel">
            <h2 className="panel-title mb-3">{t("mod.history")}</h2>
            {reviews.length === 0 ? (
              <p className="small muted">Aucune décision enregistrée.</p>
            ) : (
              <div className="review-list">
                {reviews.map((review) => (
                  <div key={review.id} className="review-item">
                    <div className="row-between">
                      <span className="strong">
                        {review.action} · {review.moderatorName ?? "Système"}
                      </span>
                      <span className="small muted">{formatDate(review.createdAt, lang)}</span>
                    </div>
                    {review.reason ? <p className="small mt-1">{review.reason}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="stack">
          <div className="panel">
            <h2 className="panel-title">Décision</h2>
            {pending ? (
              <>
                {error ? (
                  <div className="mb-3">
                    <Alert tone="danger">{error}</Alert>
                  </div>
                ) : null}
                <Field
                  label={t("mod.reason")}
                  htmlFor="reject-reason"
                  hint="Obligatoire pour un refus (5 caractères minimum)."
                >
                  <Textarea
                    id="reject-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={1000}
                    placeholder="Expliquez pourquoi l'annonce est refusée…"
                    style={{ minHeight: 100 }}
                  />
                </Field>
                <div className="stack mt-4">
                  <Button
                    variant="primary"
                    loading={busy === "APPROVE"}
                    onClick={() => decide("APPROVE")}
                  >
                    <Icon name="check" size={16} /> {t("mod.approve")}
                  </Button>
                  <Button
                    variant="danger"
                    loading={busy === "REJECT"}
                    onClick={() => decide("REJECT")}
                  >
                    <Icon name="x" size={16} /> {t("mod.reject")}
                  </Button>
                  {user?.role === "ADMIN" ? (
                    <Button
                      variant="ghost"
                      loading={busy === "REMOVE"}
                      onClick={() => decide("REMOVE")}
                    >
                      <Icon name="trash" size={16} /> Retirer l'annonce
                    </Button>
                  ) : null}
                </div>
                <p className="small muted mt-3">
                  Le vendeur reçoit une notification immédiate et retrouvera la décision dans son
                  espace.
                </p>
              </>
            ) : (
              <p className="small muted">
                Cette annonce n'est plus en attente ({t(`status.${listing.status}`)}). Aucune action
                disponible.
              </p>
            )}
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h3 className="small strong mb-2">Points de contrôle</h3>
            <ul className="small muted stack" style={{ gap: 6 }}>
              <li>✓ Photos nettes et non copiées d'internet</li>
              <li>✓ Prix réaliste et conforme au marché</li>
              <li>✓ Pas de doublon, d'arnaque ni de produit interdit</li>
              <li>✓ Description suffisamment détaillée</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
