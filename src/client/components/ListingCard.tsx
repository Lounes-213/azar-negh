import { memo, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import type { ListingSummary } from "../../shared/types";
import { Icon } from "./Icons";
import { StatusBadge, useToast } from "./ui";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { formatDa } from "../lib/format";
import { getListingFallbackImage } from "../lib/productImages";

function ListingCardInner({
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
  const [likesCount, setLikesCount] = useState(listing.favoritesCount ?? 0);
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
    setLikesCount((prev) => (next ? prev + 1 : Math.max(0, prev - 1)));
    try {
      await api(`/favorites/${listing.id}`, { method: next ? "POST" : "DELETE" });
    } catch (error) {
      setFavorite(!next);
      setLikesCount((prev) => (next ? Math.max(0, prev - 1) : prev + 1));
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
          text: `${listing.title} — ${formatDa(listing.priceDa)} sur Azar Negh`,
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
  const fallback = useMemo(
    () => getListingFallbackImage(listing.title, listing.category?.slug),
    [listing.title, listing.category?.slug],
  );
  const imageSrc = listing.coverImage || fallback;

  return (
    <article className="ali-card">
      <div className="ali-media-wrap">
        <Link
          to={`/annonces/${listing.id}`}
          tabIndex={-1}
          aria-hidden="true"
          className="ali-media-link"
        >
          <img
            src={imageSrc}
            alt={listing.title}
            width={400}
            height={400}
            loading="lazy"
            decoding="async"
            className="ali-img"
            onError={(e) => {
              const target = e.currentTarget;
              if (target.src !== fallback) {
                target.src = fallback;
              }
            }}
          />
        </Link>

        {/* Floating Top Badges */}
        <div className="ali-top-badges">
          {listing.itemType === "SERVICE" ? (
            <span className="ali-cond-badge" style={{ background: "#0284c7", color: "#fff", fontWeight: 700 }}>
              {lang === "ar" ? "خدمة" : "Service"}
            </span>
          ) : listing.itemType === "DIGITAL" ? (
            <span className="ali-cond-badge" style={{ background: "#7c3aed", color: "#fff", fontWeight: 700 }}>
              {lang === "ar" ? "رقمي" : "Numérique"}
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
            title={likesCount > 0 ? `${likesCount} j'aime` : undefined}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              padding: likesCount > 0 ? "4px 8px" : "6px",
              width: "auto",
              minWidth: 30,
              borderRadius: 16,
            }}
          >
            <Icon name="heart" size={14} filled={favorite} />
            {likesCount > 0 ? (
              <span style={{ fontSize: "0.72rem", fontWeight: 800, lineHeight: 1 }}>{likesCount}</span>
            ) : null}
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

        {/* Social Proof (Stars & Sales & Likes) */}
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
          {likesCount > 0 ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
                fontSize: "0.74rem",
                fontWeight: 700,
                color: favorite ? "#ef4444" : "var(--ink-muted)",
                marginInlineStart: "auto",
              }}
              title={`${likesCount} likes`}
            >
              <Icon name="heart" size={10} filled={favorite} />
              <span>{likesCount}</span>
            </span>
          ) : null}
        </div>

        {/* Shop / Store Row with Store Logo or Seller Avatar */}
        <div className="ali-store-footer">
          <Link
            to={listing.storeSlug ? `/vendeurs/${listing.storeSlug}` : `/vendeurs/${listing.sellerId || listing.id}`}
            className="ali-store-link"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {listing.storeLogoUrl || listing.sellerAvatarUrl ? (
              <img
                src={listing.storeLogoUrl || listing.sellerAvatarUrl!}
                alt=""
                width={20}
                height={20}
                loading="lazy"
                decoding="async"
                className="ali-store-avatar"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "1.5px solid var(--brand-500)",
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "var(--brand-700)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  flexShrink: 0,
                  border: "1px solid var(--brand-300)",
                }}
              >
                {(listing.storeName || listing.sellerDisplayName || "V").charAt(0).toUpperCase()}
              </div>
            )}
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

export const ListingCard = memo(ListingCardInner);
