import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { trackCategoryInPersona, trackWilayaInPersona } from "../lib/persona";
import type { ListingDetail as ListingDetailType, ListingSummary } from "../../shared/types";
import { Icon } from "../components/Icons";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
  useToast,
} from "../components/ui";
import { ListingCard } from "../components/ListingCard";
import { CategoryAvatar } from "../components/CategoryAvatar";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { formatDate, formatPrice, phoneDisplay, timeAgo, whatsappLink } from "../lib/format";
import { getListingFallbackImage } from "../lib/productImages";

const REPORT_REASONS = [
  { value: "FRAUD", label: "Arnaque ou fraude" },
  { value: "PROHIBITED", label: "Produit interdit" },
  { value: "WRONG_CATEGORY", label: "Mauvaise catégorie" },
  { value: "SPAM", label: "Spam ou doublon" },
  { value: "OTHER", label: "Autre" },
];

export function ListingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { push } = useToast();
  const navigate = useNavigate();
  const [imageIndex, setImageIndex] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("FRAUD");
  const [reportDetails, setReportDetails] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealRemark, setAppealRemark] = useState("");
  const [appealBusy, setAppealBusy] = useState(false);

  const state = useAsync(
    () => api<{ listing: ListingDetailType; related: ListingSummary[] }>(`/listings/${id}`),
    [id, user?.id],
  );

  useDocumentTitle(state.data?.listing.title ?? "Annonce");

  useEffect(() => {
    if (state.data?.listing) {
      trackCategoryInPersona(state.data.listing.category.nameFr);
      trackWilayaInPersona(state.data.listing.wilaya.nameFr);
    }
  }, [state.data?.listing]);

  if (state.loading) return <Spinner />;

  if (state.error || !state.data) {
    return (
      <div className="container page">
        <EmptyState
          icon="alert"
          title={t("error.notFound")}
          text={t("error.notFoundText")}
          action={
            <Link to="/annonces" className="btn">
              {t("nav.browse")}
            </Link>
          }
        />
      </div>
    );
  }

  const { listing, related } = state.data;
  const fallbackCover = getListingFallbackImage(listing.title, listing.category?.slug);
  const activeImage = listing.images[imageIndex] ?? listing.images[0];
  const coverUrl = activeImage?.url || fallbackCover;

  const runAction = async (name: string, request: () => Promise<unknown>, success: string) => {
    setActionBusy(name);
    try {
      await request();
      push(success, "success");
      state.reload();
    } catch (error) {
      push(errorMessage(error), "error");
    } finally {
      setActionBusy(null);
    }
  };

  const toggleFavorite = async () => {
    if (!user) {
      navigate(`/connexion?next=${encodeURIComponent(`/annonces/${listing.id}`)}`);
      return;
    }
    try {
      await api(`/favorites/${listing.id}`, { method: listing.isFavorite ? "DELETE" : "POST" });
      state.reload();
    } catch (error) {
      push(errorMessage(error), "error");
    }
  };

  const trackClick = async (type: "CALL" | "BUY_ORDER" | "WHATSAPP") => {
    // Each call / buy click is counted only if user is logged in with Google/authenticated, not guest
    if (!user) return;
    try {
      await api<{ counted: boolean }>(`/listings/${listing.id}/track-click`, {
        method: "POST",
        body: { clickType: type },
      });
    } catch {
      // silent
    }
  };

  const handleShareListing = async () => {
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: listing.title,
          text: `${listing.title} — ${listing.priceDa} DA sur Azar Neɣ`,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback
      }
    }
    await navigator.clipboard.writeText(shareUrl);
    push(lang === "ar" ? "تم نسخ رابط الإعلان !" : "Lien de l'annonce copié !", "success");
  };

  const sendReport = async (event: React.FormEvent) => {
    event.preventDefault();
    setReportBusy(true);
    try {
      await api(`/listings/${listing.id}/reports`, {
        method: "POST",
        body: { reason: reportReason, details: reportDetails.trim() || null },
      });
      push(t("report.sent"), "success");
      setReportOpen(false);
      setReportDetails("");
    } catch (error) {
      push(errorMessage(error), "error");
    } finally {
      setReportBusy(false);
    }
  };

  const ownerBanner = () => {
    if (!listing.isOwner) return null;
    if (listing.status === "DRAFT") {
      return (
        <Alert tone="info">Brouillon — cette annonce n'est pas encore visible publiquement.</Alert>
      );
    }
    if (listing.status === "PENDING") {
      return (
        <Alert tone="warning">En attente de modération — elle sera visible après validation.</Alert>
      );
    }
    if (listing.status === "REJECTED") {
      return (
        <div className="reject-reason stack" style={{ gap: 8, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="alert" size={18} style={{ color: "var(--danger)" }} />
            <strong>{lang === "ar" ? "تم رفض الإعلان من قبل الإدارة" : "Annonce refusée par la modération."}</strong>
          </div>
          {listing.rejectionReason ? (
            <p className="mt-1" style={{ color: "var(--danger)", fontWeight: 500 }}>
              <strong>{lang === "ar" ? "سبب الرفض :" : "Motif :"}</strong> {listing.rejectionReason}
            </p>
          ) : null}
          {listing.sellerRemark ? (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                background: "var(--surface)",
                border: "1px solid var(--line)",
                fontSize: "0.85rem",
              }}
            >
              💬 <strong>{lang === "ar" ? "توضيحك المرسل للإدارة :" : "Votre remarque envoyée :"}</strong>{" "}
              {listing.sellerRemark}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setAppealRemark(listing.sellerRemark || "");
                setAppealOpen(true);
              }}
            >
              💬 {lang === "ar" ? "إرسال توضيح / ملاحظة للإدارة" : "Envoyer une remarque à l'admin"}
            </Button>
            <Link to={`/vendre/${listing.id}`} className="btn btn-sm btn-outline">
              <Icon name="edit" size={14} /> {t("common.edit")}
            </Link>
          </div>
        </div>
      );
    }
    if (listing.status === "ARCHIVED") {
      return <Alert tone="info">Annonce archivée — elle n'apparaît plus dans la recherche.</Alert>;
    }
    if (listing.status === "SOLD") {
      return (
        <Alert tone="success">Annonce vendue. Vous pouvez la remettre en ligne si besoin.</Alert>
      );
    }
    return null;
  };

  return (
    <div className="container page page-detail">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate("/");
            }
          }}
          className="btn btn-secondary btn-sm"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontWeight: 700,
            padding: "6px 14px",
            borderRadius: "var(--radius-md)",
            border: "1.5px solid var(--line)",
            background: "var(--surface)",
            cursor: "pointer",
          }}
          title={lang === "ar" ? "الرجوع للقائمة السابقة بنفس المكان" : "Retour à la position précédente"}
        >
          <Icon name={lang === "ar" ? "arrow-right" : "arrow-left"} size={15} />
          <span>{lang === "ar" ? "رجوع" : "Retour"}</span>
        </button>

        <nav className="breadcrumbs" aria-label="Fil d'Ariane" style={{ margin: 0, flex: 1 }}>
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate("/");
              }
            }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              font: "inherit",
              color: "inherit",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            {t("nav.home")}
          </button>
          <Icon name="chevron-right" size={13} />
          <Link to={`/categories/${listing.category.slug}`}>
            {lang === "ar" ? listing.category.nameAr : listing.category.nameFr}
          </Link>
          <Icon name="chevron-right" size={13} />
          <span className="truncate" style={{ maxWidth: 260 }}>
            {listing.title}
          </span>
        </nav>
      </div>

      {ownerBanner() ? <div className="mb-4">{ownerBanner()}</div> : null}

      <div className="detail-layout">
        <div className="detail-media">
          <div className="gallery-main">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={`${listing.title} — photo ${imageIndex + 1}`}
                width={1200}
                height={900}
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src !== fallbackCover) {
                    target.src = fallbackCover;
                  }
                }}
              />
            ) : (
              <div className="placeholder">
                <Icon name="image" size={48} />
              </div>
            )}
          </div>
          {listing.images.length > 1 ? (
            <div className="gallery-thumbs" role="list">
              {listing.images.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  className={`gallery-thumb ${index === imageIndex ? "active" : ""}`}
                  onClick={() => setImageIndex(index)}
                  aria-label={`Photo ${index + 1}`}
                  aria-current={index === imageIndex}
                  role="listitem"
                >
                  <img src={image.url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="detail-head">
          <div className="row wrap">
            <StatusBadge status={listing.status} />
            <Badge tone="badge-brand">{t(`cond.${listing.condition}`)}</Badge>
            {listing.category ? (
              <Badge>
                <CategoryAvatar slug={listing.category.slug} size={15} />
                {lang === "ar" ? listing.category.nameAr : listing.category.nameFr}
              </Badge>
            ) : null}
          </div>
          <h1 className="detail-title">{listing.title}</h1>
          <div>
            <span className="detail-price">
              {formatPrice(listing.priceDa, lang)}
              {listing.negotiable ? <small> · {t("common.negotiable")}</small> : null}
            </span>
          </div>
          <p className="small muted">
            Publiée {formatDate(listing.publishedAt ?? listing.createdAt, lang)}
          </p>
        </div>

        <div className="detail-body">
          <section className="section" style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: "var(--text-lg)" }} className="mb-2">
              {t("listing.description")}
            </h2>
            <p className="description">{listing.description}</p>
            <div className="detail-meta mt-4">
              <span>
                <Icon name="map-pin" size={15} />{" "}
                {lang === "ar" ? listing.wilaya.nameAr : listing.wilaya.nameFr}
              </span>
              <span>
                <Icon name="clock" size={15} />{" "}
                {timeAgo(listing.publishedAt ?? listing.createdAt, lang)}
              </span>
              <span>
                <Icon name="eye" size={15} /> {listing.viewCount} {t("listing.views")}
              </span>
              <span>
                <Icon name="tag" size={15} />{" "}
                {listing.itemType === "SERVICE"
                  ? (lang === "ar" ? "🛠️ خدمة" : "🛠️ Service")
                  : listing.itemType === "DIGITAL"
                    ? (lang === "ar" ? "💾 منتج رقمي" : "💾 Produit numérique")
                    : t(`cond.${listing.condition}`)}
              </span>
            </div>
          </section>

          <div className="safety-note mt-6">{t("listing.safety")}</div>
        </div>

        <aside className="detail-aside">
          <div className="card" style={{ padding: 16 }}>
            <div className="seller-card">
              <Avatar
                name={listing.seller.storeName || listing.seller.displayName}
                imageUrl={listing.seller.logoUrl || listing.seller.avatarUrl}
                size="lg"
                withGreenRing={true}
              />
              <div className="grow">
                <Link
                  to={`/vendeurs/${listing.seller.storeSlug || listing.seller.id}`}
                  className="strong"
                >
                  {listing.seller.storeName || listing.seller.displayName}
                </Link>
                <div className="row mt-1" style={{ gap: 6, fontSize: "var(--text-xs)" }}>
                  <span className="ali-rating-badge row" style={{ gap: 3 }}>
                    <Icon name="star" size={12} filled className="text-accent" />
                    <strong>{listing.seller.averageRating ?? 5}★</strong>
                  </span>
                  <span className="muted">·</span>
                  <span className="muted">
                    <Icon name="map-pin" size={12} />{" "}
                    {lang === "ar" ? (listing.wilaya?.nameAr || "الجزائر") : (listing.wilaya?.nameFr || "Algérie")}
                  </span>
                </div>
                <p className="small muted mt-1">
                  {t("listing.memberSince")} {formatDate(listing.seller.memberSince, lang)}
                </p>
              </div>
            </div>
            {listing.seller.bio ? <p className="small mt-3">{listing.seller.bio}</p> : null}

            <div className="divider" />
            <h2 className="small strong mb-2">{t("listing.contact")}</h2>
            <div className="contact-actions">
              {listing.contactPhone ? (
                <>
                  <a
                    className="btn btn-primary"
                    href={`tel:${listing.contactPhone}`}
                    onClick={() => void trackClick("CALL")}
                  >
                    <Icon name="phone" size={17} /> {phoneDisplay(listing.contactPhone)}
                  </a>
                  {listing.contactWhatsapp ? (
                    <a
                      className="btn btn-secondary"
                      href={whatsappLink(
                        listing.contactPhone,
                        `Bonjour, je souhaite commander votre article « ${listing.title} » au prix de ${listing.priceDa} DA sur Azar Neɣ.`,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => void trackClick("BUY_ORDER")}
                    >
                      <Icon name="bag" size={17} /> {lang === "ar" ? "طلب شراء عبر WhatsApp" : "Commander (WhatsApp)"}
                    </a>
                  ) : null}
                </>
              ) : (
                <p className="small muted">{t("listing.phoneHidden")}</p>
              )}
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-ghost grow"
                  onClick={toggleFavorite}
                  aria-pressed={listing.isFavorite}
                >
                  <Icon name="heart" size={17} filled={listing.isFavorite} />
                  {listing.isFavorite ? "Favori" : t("listing.favorite")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost grow"
                  onClick={handleShareListing}
                  title="Partager"
                >
                  <Icon name="share" size={17} />
                  {lang === "ar" ? "مشاركة" : "Partager"}
                </button>
              </div>
              {!listing.isOwner ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReportOpen(true)}>
                  <Icon name="flag" size={15} /> {t("listing.report")}
                </button>
              ) : null}
            </div>
          </div>

          {listing.isOwner ? (
            <div className="owner-bar">
              <span className="small strong" style={{ flexBasis: "100%" }}>
                {t("listing.manage")}
              </span>
              {listing.allowedActions.includes("edit") ? (
                <Link to={`/vendre/${listing.id}`} className="btn btn-secondary btn-sm">
                  <Icon name="edit" size={15} /> {t("common.edit")}
                </Link>
              ) : null}
              {listing.allowedActions.includes("submit") ? (
                <Button
                  size="sm"
                  loading={actionBusy === "submit"}
                  onClick={() =>
                    runAction(
                      "submit",
                      () => api(`/listings/${listing.id}/submit`, { method: "POST" }),
                      "Annonce soumise à la modération.",
                    )
                  }
                >
                  <Icon name="send" size={15} /> {t("sell.publish")}
                </Button>
              ) : null}
              {listing.allowedActions.includes("mark_sold") ? (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={actionBusy === "sold"}
                  onClick={() =>
                    runAction(
                      "sold",
                      () => api(`/listings/${listing.id}/sold`, { method: "POST" }),
                      "Annonce marquée comme vendue.",
                    )
                  }
                >
                  <Icon name="check" size={15} /> Marquer vendue
                </Button>
              ) : null}
              {listing.allowedActions.includes("relist") ? (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={actionBusy === "relist"}
                  onClick={() =>
                    runAction(
                      "relist",
                      () => api(`/listings/${listing.id}/relist`, { method: "POST" }),
                      "Annonce remise en ligne.",
                    )
                  }
                >
                  <Icon name="refresh" size={15} /> Remettre en ligne
                </Button>
              ) : null}
              {listing.allowedActions.includes("archive") ? (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={actionBusy === "archive"}
                  onClick={() =>
                    runAction(
                      "archive",
                      () => api(`/listings/${listing.id}/archive`, { method: "POST" }),
                      "Annonce archivée.",
                    )
                  }
                >
                  <Icon name="folder" size={15} /> Archiver
                </Button>
              ) : null}
              {listing.allowedActions.includes("delete") || listing.isOwner ? (
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} style={{ color: "var(--danger)" }}>
                  <Icon name="trash" size={15} /> {t("common.delete")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>

      {listing.isOwner ? (
        <div className="mobile-cta">
          <Link to={`/vendre/${listing.id}`} className="btn btn-primary grow">
            <Icon name="edit" size={17} /> {t("common.edit")}
          </Link>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setConfirmDelete(true)}
            style={{ color: "var(--danger)", display: "inline-flex", alignItems: "center", gap: 6 }}
            title={t("common.delete")}
          >
            <Icon name="trash" size={17} />
            <span>{t("common.delete")}</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={handleShareListing}
            aria-label="Partager"
            title="Partager"
          >
            <Icon name="share" size={18} />
          </button>
        </div>
      ) : listing.contactPhone ? (
        <div className="mobile-cta">
          <a
            className="btn btn-primary grow"
            href={`tel:${listing.contactPhone}`}
            onClick={() => void trackClick("CALL")}
          >
            <Icon name="phone" size={17} /> {phoneDisplay(listing.contactPhone)}
          </a>
          {listing.contactWhatsapp ? (
            <a
              className="btn btn-secondary"
              href={whatsappLink(
                listing.contactPhone,
                `Bonjour, je souhaite commander votre article « ${listing.title} » au prix de ${listing.priceDa} DA sur Azar Neɣ.`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("listing.whatsapp")}
              onClick={() => void trackClick("BUY_ORDER")}
            >
              <Icon name="bag" size={18} />
              <span>{lang === "ar" ? "طلب شراء" : "Commander"}</span>
            </a>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={handleShareListing}
            aria-label="Partager"
            title="Partager"
          >
            <Icon name="share" size={18} />
          </button>
        </div>
      ) : null}

      {related.length > 0 ? (
        <section className="section" aria-labelledby="related-title">
          <div className="section-head">
            <h2 id="related-title">{t("listing.related")}</h2>
          </div>
          <div className="listing-grid">
            {related.map((item) => (
              <ListingCard key={item.id} listing={item} />
            ))}
          </div>
        </section>
      ) : null}

      <Dialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title={t("report.title")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReportOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" form="report-form" type="submit" loading={reportBusy}>
              {t("report.send")}
            </Button>
          </>
        }
      >
        <form id="report-form" onSubmit={sendReport} className="stack">
          <Field label={t("report.reason")} htmlFor="report-reason" required>
            <Select
              id="report-reason"
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
            >
              {REPORT_REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("report.details")}
            htmlFor="report-details"
            hint="1000 caractères maximum."
          >
            <Textarea
              id="report-details"
              value={reportDetails}
              maxLength={1000}
              onChange={(event) => setReportDetails(event.target.value)}
              placeholder="Expliquez brièvement le problème…"
            />
          </Field>
        </form>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer cette annonce ?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              loading={actionBusy === "delete"}
              onClick={async () => {
                setActionBusy("delete");
                try {
                  await api(`/listings/${listing.id}`, { method: "DELETE" });
                  push("Annonce supprimée.", "success");
                  navigate("/compte/annonces");
                } catch (error) {
                  push(errorMessage(error), "error");
                } finally {
                  setActionBusy(null);
                  setConfirmDelete(false);
                }
              }}
            >
              {t("common.delete")}
            </Button>
          </>
        }
      >
        <p className="small">
          Cette action est définitive. L'annonce ainsi que ses photos associées seront définitivement supprimées.
        </p>
      </Dialog>

      {/* Appeal / Remark dialog */}
      <Dialog
        open={appealOpen}
        onClose={() => setAppealOpen(false)}
        title={lang === "ar" ? "إرسال ملاحظة وتوضيح للإدارة" : "Envoyer une remarque à l'administrateur"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAppealOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              loading={appealBusy}
              disabled={!appealRemark.trim()}
              onClick={async () => {
                if (!appealRemark.trim()) return;
                setAppealBusy(true);
                try {
                  await api(`/listings/${listing.id}/appeal`, {
                    method: "POST",
                    body: JSON.stringify({ remark: appealRemark.trim() }),
                  });
                  push(
                    lang === "ar"
                      ? "تم إرسال توضيحك بنجاح، وتمت إعادة توجيه الإعلان للمراجعة !"
                      : "Remarque transmise à l'administrateur ! L'annonce est de nouveau en cours d'examen.",
                    "success",
                  );
                  setAppealOpen(false);
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
          {listing.rejectionReason ? (
            <div
              style={{
                padding: "8px 12px",
                background: "rgba(239, 68, 68, 0.08)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.85rem",
                color: "var(--danger)",
              }}
            >
              <strong>{lang === "ar" ? "سبب الرفض :" : "Motif de refus :"}</strong> {listing.rejectionReason}
            </div>
          ) : null}
          <Field
            label={lang === "ar" ? "توضيحك أو ردك على سبب الرفض" : "Votre explication / justificatif"}
            htmlFor="detail-appeal-text"
            hint={
              lang === "ar"
                ? "اشرح للإدارة لماذا السعر دقيق ومبرر لمراجعة إعلانك مجدداً."
                : "Expliquez à l'admin les détails nécessaires (prix réel vérifié, conformité...)."
            }
            required
          >
            <Textarea
              id="detail-appeal-text"
              rows={4}
              value={appealRemark}
              onChange={(e) => setAppealRemark(e.target.value)}
              placeholder={
                lang === "ar"
                  ? "اكتب توضيحك هنا للإدارة..."
                  : "Ex. Le prix est justifié car l'appareil est comme neuf avec facture et accessoires..."
              }
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
