import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import type { ListingSummary } from "../../shared/types";
import { Icon } from "./Icons";
import { StatusBadge, useToast } from "./ui";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { formatDa } from "../lib/format";

export function ListingCard({
  listing,
  showStatus = false,
  ownerActions,
}: {
  listing: ListingSummary;
  showStatus?: boolean;
  ownerActions?: React.ReactNode;
}) {
  const { user } = useAuth();
  const { lang, t } = useI18n();
  const { push } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [favorite, setFavorite] = useState(Boolean(listing.isFavorite));
  const [busy, setBusy] = useState(false);

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      navigate(`/connexion?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    if (busy) return;
    setBusy(true);
    const next = !favorite;
    setFavorite(next);
    try {
      await api(`/favorites/${listing.id}`, { method: next ? "POST" : "DELETE" });
    } catch (error) {
      setFavorite(!next);
      push(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const shareUrl = `${window.location.origin}/annonces/${listing.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: listing.title,
          text: `${listing.title} — ${formatDa(listing.priceDa)} sur Azar Neɣ`,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    await navigator.clipboard.writeText(shareUrl);
    push(lang === "ar" ? "تم نسخ رابط الإعلان !" : "Lien de l'annonce copié !", "success");
  };

  // AliExpress-style metrics (sales/calls and natural star rating)
  const totalEngagements = (listing.orderClicks ?? 0) + (listing.callClicks ?? 0);
  const salesDisplay = totalEngagements > 0 ? `${totalEngagements} ${lang === "ar" ? "طلب" : "commandes"}` : null;
  const rating = listing.averageRating ? Math.round(listing.averageRating) : 5;

  const conditionLabels: Record<string, { fr: string; ar: string }> = {
    NEW: { fr: "Neuf", ar: "جديد" },
    LIKE_NEW: { fr: "Comme neuf", ar: "شبه جديد" },
    GOOD: { fr: "Bon état", ar: "حالة جيدة" },
    FAIR: { fr: "État correct", ar: "مقبول" },
    FOR_PARTS: { fr: "Pour pièces", ar: "قطع غيار" },
  };

  const conditionLabel = conditionLabels[listing.condition]?.[lang === "ar" ? "ar" : "fr"] ?? listing.condition;

  return (
    <article className="ali-card">
      <div className="ali-media-wrap">
        <Link
          to={`/annonces/${listing.id}`}
          tabIndex={-1}
          aria-hidden="true"
          className="ali-media-link"
        >
          {listing.coverImage ? (
            <img
              src={listing.coverImage}
              alt={listing.title}
              loading="lazy"
              decoding="async"
              className="ali-img"
            />
          ) : (
            <div className="ali-placeholder">
              <Icon name="image" size={36} />
            </div>
          )}
        </Link>

        {/* Floating Top Badges */}
        <div className="ali-top-badges">
          {listing.itemType === "SERVICE" ? (
            <span className="ali-cond-badge" style={{ background: "#0284c7", color: "#fff", fontWeight: 700 }}>
              🛠️ {lang === "ar" ? "خدمة" : "Service"}
            </span>
          ) : listing.itemType === "DIGITAL" ? (
            <span className="ali-cond-badge" style={{ background: "#7c3aed", color: "#fff", fontWeight: 700 }}>
              💾 {lang === "ar" ? "رقمي" : "Numérique"}
            </span>
          ) : (
            <span className={`ali-cond-badge ${listing.condition === "NEW" ? "is-new" : ""}`}>
              {conditionLabel}
            </span>
          )}
          {showStatus ? (
            <span className="ali-status-badge">
              <StatusBadge status={listing.status} />
            </span>
          ) : null}
        </div>

        {/* Floating Action Buttons */}
        <div className="ali-floating-actions">
          <button
            type="button"
            className={`ali-action-btn ${favorite ? "is-fav" : ""}`}
            onClick={toggleFavorite}
            aria-label={favorite ? "Retirer des favoris" : t("listing.favorite")}
            aria-pressed={favorite}
          >
            <Icon name="heart" size={16} filled={favorite} />
          </button>
          <button
            type="button"
            className="ali-action-btn"
            onClick={handleShare}
            aria-label="Partager"
            title="Partager"
          >
            <Icon name="share" size={15} />
          </button>
        </div>

        {/* Bottom Wilaya Pill */}
        <div className="ali-wilaya-pill">
          <Icon name="map-pin" size={11} />
          <span>{lang === "ar" ? listing.wilaya.nameAr : listing.wilaya.nameFr}</span>
        </div>
      </div>

      <div className="ali-card-content">
        {/* AliExpress Bold Price Row */}
        <div className="ali-price-block">
          <div className="ali-main-price">
            <span className="ali-price-val">{formatDa(listing.priceDa).replace(/\s*DA$/, "")}</span>
            <span className="ali-currency">DA</span>
          </div>
          {listing.originalPriceDa && listing.originalPriceDa > listing.priceDa ? (
            <span className="ali-old-price">{formatDa(listing.originalPriceDa)}</span>
          ) : listing.negotiable ? (
            <span className="ali-negotiable-badge">{lang === "ar" ? "قابل للتفاوض" : "Négociable"}</span>
          ) : null}
        </div>

        {/* Product Title */}
        <Link to={`/annonces/${listing.id}`} className="ali-product-title" title={listing.title}>
          {listing.title}
        </Link>

        {/* Social Proof (Stars & Sales) */}
        <div className="ali-social-proof">
          <div className="ali-rating-stars">
            <Icon name="star" size={13} filled className="ali-star-icon" />
            <span className="ali-rating-num">{rating}</span>
          </div>
          {salesDisplay ? (
            <span className="ali-sales-count">{salesDisplay}</span>
          ) : (
            <span className="ali-free-tag">{lang === "ar" ? "توصيل مباشر" : "Vendeur direct"}</span>
          )}
        </div>

        {/* Shop / Store Row */}
        <div className="ali-store-footer">
          <Link
            to={listing.storeSlug ? `/vendeurs/${listing.storeSlug}` : `/vendeurs/${listing.id}`}
            className="ali-store-link"
          >
            <Icon name="store" size={13} />
            <span className="ali-store-name truncate">
              {listing.storeName || listing.sellerDisplayName}
            </span>
          </Link>
        </div>
      </div>

      {ownerActions ? <div className="listing-owner-actions">{ownerActions}</div> : null}
    </article>
  );
}
