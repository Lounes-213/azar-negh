import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { ListingSummary, Paginated, StoreProfile } from "../../shared/types";
import { Avatar, Button, Dialog, EmptyState, Field, Pagination, Spinner, Textarea, useToast } from "../components/ui";
import { ListingCard } from "../components/ListingCard";
import { Icon } from "../components/Icons";
import { api, errorMessage } from "../lib/api";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { phoneDisplay } from "../lib/format";

interface SellerResponse {
  seller: StoreProfile;
  listings: Paginated<ListingSummary>;
}

const sellerCache = new Map<string, SellerResponse>();

export function Seller() {
  const { id: rawId } = useParams();
  const id = rawId?.startsWith("@") ? rawId.slice(1) : rawId;
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { push } = useToast();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const cachedSeller = id ? sellerCache.get(String(id)) ?? null : null;
  const state = useAsync(
    () => api<SellerResponse>(`/sellers/${encodeURIComponent(id ?? "")}?page=${page}&perPage=24`),
    [id, page],
    cachedSeller,
  );

  useEffect(() => {
    if (state.data && id) {
      sellerCache.set(String(id), state.data);
    }
  }, [state.data, id]);

  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [followersCount, setFollowersCount] = useState<number | null>(null);
  const [followBusy, setFollowBusy] = useState(false);

  // Review dialog state
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [reviewsCount, setReviewsCount] = useState<number | null>(null);

  // Share Dialog
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // Reordering mode for store owner
  const [reorderMode, setReorderMode] = useState(false);
  const [orderedItems, setOrderedItems] = useState<ListingSummary[] | null>(null);
  const [reorderBusy, setReorderBusy] = useState(false);

  const seller = state.data?.seller;
  const listings = state.data?.listings;
  const isOwner = Boolean(user && seller && user.id === seller.id);

  const proLink = seller?.storeSlug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/@${seller.storeSlug}`
    : `${typeof window !== "undefined" ? window.location.origin : ""}/boutique/${seller?.id ?? id ?? ""}`;

  const storeTitle = seller?.storeName || seller?.displayName || (lang === "ar" ? "متجر" : "Boutique");
  useDocumentTitle(`${storeTitle} | Azar Negh`);

  // Update dynamic meta tags for clean social sharing (always called in the same hook order)
  useEffect(() => {
    if (!seller) return;
    const titleText = `${seller.storeName || seller.displayName} | Azar Negh`;
    const wilayaLabel = lang === "ar"
      ? (seller.wilaya?.nameAr || "الجزائر")
      : (seller.wilaya?.nameFr || "Algérie");
    const descText = `${seller.storeName || seller.displayName} (${wilayaLabel}) - Azar Negh`;
    const imgUrl = seller.logoUrl || seller.bannerUrl || `${window.location.origin}/brand/icon-512.png`;

    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    setMeta("property", "og:title", titleText);
    setMeta("property", "og:description", descText);
    setMeta("property", "og:image", imgUrl);
    setMeta("property", "og:url", proLink);
    setMeta("name", "twitter:title", titleText);
    setMeta("name", "twitter:description", descText);
    setMeta("name", "twitter:image", imgUrl);
  }, [seller, proLink, lang]);

  if (state.loading) return <Spinner />;
  if (state.error || !state.data || !seller || !listings) {
    return (
      <div className="container page page-enter">
        <EmptyState
          icon="store"
          title={lang === "ar" ? "المتجر غير موجود" : "Boutique introuvable"}
          text={lang === "ar" ? "هذا الحساب أو المتجر غير متوفر حالياً." : "Ce profil n'existe pas ou a été suspendu."}
        />
      </div>
    );
  }

  const currentIsFollowing = isFollowing !== null ? isFollowing : seller.isFollowing;
  const currentFollowersCount = followersCount !== null ? followersCount : seller.followersCount;
  const currentRating = avgRating !== null ? avgRating : seller.averageRating;
  const currentReviewsCount = reviewsCount !== null ? reviewsCount : seller.reviewsCount;

  const handleToggleFollow = async () => {
    if (!user) {
      navigate(`/connexion?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (followBusy) return;
    setFollowBusy(true);
    try {
      const res = await api<{ isFollowing: boolean; followersCount: number }>(`/sellers/${seller.id}/follow`, {
        method: "POST",
      });
      setIsFollowing(res.isFollowing);
      setFollowersCount(res.followersCount);
      push(
        res.isFollowing
          ? (lang === "ar" ? "تمت متابعة المتجر !" : "Vous êtes abonné à cette boutique !")
          : (lang === "ar" ? "تم إلغاء المتابعة" : "Abonnement retiré"),
        "success",
      );
    } catch (err) {
      push(errorMessage(err), "error");
    } finally {
      setFollowBusy(false);
    }
  };


  const handleShareStore = () => {
    setShareModalOpen(true);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate(`/connexion?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setReviewBusy(true);
    try {
      const res = await api<{ averageRating: number; reviewsCount: number }>(`/sellers/${seller.id}/reviews`, {
        method: "POST",
        body: { rating: reviewRating, comment: reviewComment.trim() || null },
      });
      setAvgRating(res.averageRating);
      setReviewsCount(res.reviewsCount);
      push(lang === "ar" ? "شكراً على تقييمك !" : "Merci pour votre évaluation !", "success");
      setReviewOpen(false);
      setReviewComment("");
    } catch (err) {
      push(errorMessage(err), "error");
    } finally {
      setReviewBusy(false);
    }
  };

  // Reordering helpers
  const currentListingList = orderedItems || listings.items;

  const moveListing = (index: number, direction: "up" | "down") => {
    const items = [...currentListingList];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const temp = items[index];
    const targetItem = items[targetIndex];
    if (!temp || !targetItem) return;
    items[index] = targetItem;
    items[targetIndex] = temp;
    setOrderedItems(items);
  };

  const handleSaveOrder = async () => {
    if (!orderedItems) return;
    setReorderBusy(true);
    try {
      await api("/sellers/my-store/reorder", {
        method: "POST",
        body: { listingIds: orderedItems.map((item) => item.id) },
      });
      push(lang === "ar" ? "تم حفظ ترتيب المنتجات بنجاح !" : "Ordre des produits enregistré !", "success");
      setReorderMode(false);
      state.reload();
    } catch (err) {
      push(errorMessage(err), "error");
    } finally {
      setReorderBusy(false);
    }
  };

  // Map coordinates (use seller lat/long or wilaya default)
  const mapLat = seller.latitude || 36.7538;
  const mapLng = seller.longitude || 3.0588;

  return (
    <div className="container page page-enter">
      {/* Store Header Card */}
      <div className="store-header-card mb-6">
        {/* Sleek, customizable slim banner for all stores (default brand green, color-customizable) */}
        <div
          className="store-slim-banner"
          style={{
            height: "74px",
            width: "100%",
            background: seller.bannerUrl && (seller.bannerUrl.startsWith("#") || seller.bannerUrl.startsWith("rgb"))
              ? `linear-gradient(135deg, ${seller.bannerUrl} 0%, ${seller.bannerUrl}dd 100%)`
              : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
            boxShadow: "inset 0 -1px 0 rgba(0, 0, 0, 0.08)",
          }}
        />

        <div className="store-profile-bar" style={{ paddingTop: "14px" }}>
          <div className="store-avatar-wrap" style={{ marginTop: "-48px", position: "relative", zIndex: 2 }}>
            <Avatar
              name={seller.storeName || seller.displayName}
              imageUrl={seller.logoUrl || seller.avatarUrl}
              size="xl"
              withGreenRing={true}
            />
          </div>

          <div className="store-info-grow">
            <div className="store-title-row">
              <h1 className="store-heading">{seller.storeName || seller.displayName}</h1>
              {seller.storeSlug ? (
                <span className="store-slug-badge">@{seller.storeSlug}</span>
              ) : null}
            </div>

            {/* Store Owner Personal Name */}
            {seller.storeName && seller.displayName ? (
              <div
                className="store-owner-badge"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 4,
                  marginBottom: 6,
                  fontSize: "0.88rem",
                  color: "var(--ink-muted)",
                  fontWeight: 600,
                }}
              >
                <Icon name="user" size={14} />
                <span>
                  {lang === "ar" ? `تسيير : ${seller.displayName}` : `Géré par : ${seller.displayName}`}
                </span>
              </div>
            ) : null}

            <div className="store-meta-row">
              <span className="store-meta-item">
                <Icon name="map-pin" size={14} />
                <span>
                  {seller.commune ? `${seller.commune}, ` : ""}
                  {lang === "ar" ? (seller.wilaya?.nameAr || "الجزائر") : (seller.wilaya?.nameFr || "Algérie")}
                </span>
              </span>
              <span className="store-dot">·</span>
              <span className="store-meta-item">
                <Icon name="users" size={14} />
                <span>{currentFollowersCount} {lang === "ar" ? "متابع" : "abonnés"}</span>
              </span>
              <span className="store-dot">·</span>
              {/* Natural Number Rating */}
              <button
                type="button"
                className="store-rating-btn"
                onClick={() => setReviewOpen(true)}
                title="Noter la boutique"
              >
                <Icon name="star" size={14} filled className="text-accent" />
                <span className="strong">{currentRating}</span>
                <span className="muted small">({currentReviewsCount} {lang === "ar" ? "تقييم" : "avis"})</span>
              </button>
            </div>

            {seller.bio ? <p className="store-bio mt-2">{seller.bio}</p> : null}
            {seller.openingHours ? (
              <p className="store-hours mt-1">
                <Icon name="clock" size={13} />
                <span>{seller.openingHours}</span>
              </p>
            ) : null}
          </div>

          {/* Action Buttons */}
          <div className="store-actions-wrap">
            {!isOwner ? (
              <Button
                variant={currentIsFollowing ? "secondary" : "primary"}
                onClick={handleToggleFollow}
                loading={followBusy}
                size="sm"
              >
                <Icon name={currentIsFollowing ? "check" : "plus"} size={15} />
                <span>{currentIsFollowing ? (lang === "ar" ? "متابع" : "Abonné") : (lang === "ar" ? "متابعة المتجر" : "S'abonner")}</span>
              </Button>
            ) : (
              <>
                <Button variant="secondary" size="sm" onClick={() => navigate("/compte?view=store")}>
                  <Icon name="edit" size={15} />
                  <span>{lang === "ar" ? "تعديل المتجر" : "Modifier la boutique"}</span>
                </Button>
                <Button
                  variant={reorderMode ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => {
                    if (reorderMode) {
                      void handleSaveOrder();
                    } else {
                      setOrderedItems(listings.items);
                      setReorderMode(true);
                    }
                  }}
                  loading={reorderBusy}
                >
                  <Icon name="list" size={15} />
                  <span>{reorderMode ? (lang === "ar" ? "حفظ الترتيب" : "Enregistrer l'ordre") : (lang === "ar" ? "ترتيب المنتجات" : "Organiser")}</span>
                </Button>
              </>
            )}

            <Button variant="ghost" size="sm" onClick={handleShareStore} title="Partager la boutique">
              <Icon name="share" size={16} />
              <span>{lang === "ar" ? "مشاركة" : "Partager"}</span>
            </Button>

            {seller.phone ? (
              <a href={`tel:${seller.phone}`} className="btn btn-secondary btn-sm">
                <Icon name="phone" size={15} />
                <span>{phoneDisplay(seller.phone)}</span>
              </a>
            ) : null}

            {seller.whatsappPublic && seller.phone ? (
              <a
                href={`https://wa.me/${seller.phone.replace(/[^0-9]/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
              >
                <Icon name="whatsapp" size={16} />
                <span>WhatsApp</span>
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {/* Map Location Section */}
      <div className="store-location-card panel mb-6">
        <div className="row-between mb-3">
          <div className="row" style={{ gap: 8 }}>
            <Icon name="map" size={18} />
            <h3 style={{ fontSize: "var(--text-md)", margin: 0 }}>
              {lang === "ar" ? "موقع المتجر على الخريطة" : "Emplacement du magasin"}
            </h3>
          </div>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${seller.storeName || seller.displayName} ${seller.commune || ""} ${seller.wilaya?.nameFr || seller.wilaya?.nameAr || "Algérie"}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
          >
            <Icon name="navigation" size={14} />
            <span>{lang === "ar" ? "فتح في خرائط Google" : "Itinéraire Maps"}</span>
          </a>
        </div>
        {seller.address ? (
          <p className="small muted mb-3">
            <Icon name="map-pin" size={13} /> {seller.address}
          </p>
        ) : null}
        <div className="store-map-embed">
          <iframe
            title="Carte OpenStreetMap du magasin"
            width="100%"
            height="220"
            style={{ border: 0, borderRadius: "var(--radius-md)" }}
            loading="lazy"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapLng - 0.04}%2C${mapLat - 0.02}%2C${mapLng + 0.04}%2C${mapLat + 0.02}&layer=mapnik&marker=${mapLat}%2C${mapLng}`}
          />
        </div>
      </div>

      {/* Products Section */}
      <div className="section-head row-between mb-4">
        <div>
          <h2>{lang === "ar" ? "منتجات ومعروضات المتجر" : "Catalogue & Produits"}</h2>
          <p className="small muted">
            {listings.total} {lang === "ar" ? "منتج متوفر" : "articles en ligne"}
          </p>
        </div>
        {reorderMode ? (
          <div className="row" style={{ gap: 8 }}>
            <Button size="sm" variant="secondary" onClick={() => setReorderMode(false)}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={handleSaveOrder} loading={reorderBusy}>
              {lang === "ar" ? "حفظ الترتيب" : "Enregistrer l'ordre"}
            </Button>
          </div>
        ) : null}
      </div>

      {currentListingList.length === 0 ? (
        <EmptyState
          icon="tag"
          title={lang === "ar" ? "لا توجد منتجات حالياً" : "Aucun article disponible"}
          text={lang === "ar" ? "هذا المتجر لم ينشر إعلانات نشطة بعد." : "Ce vendeur n'a pas d'annonce approuvée pour le moment."}
          action={
            <Link to="/annonces" className="btn btn-secondary">
              {t("nav.browse")}
            </Link>
          }
        />
      ) : (
        <>
          <div className="listing-grid">
            {currentListingList.map((listing, index) => (
              <div key={listing.id} className="card-animated-wrap" style={{ animationDelay: `${index * 40}ms` }}>
                <ListingCard
                  listing={listing}
                  ownerActions={
                    reorderMode ? (
                      <div className="row-between p-2" style={{ width: "100%", background: "var(--surface-muted)" }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={index === 0}
                          onClick={() => moveListing(index, "up")}
                          title="Monter"
                        >
                          ▲
                        </button>
                        <span className="small muted">#{index + 1}</span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={index === currentListingList.length - 1}
                          onClick={() => moveListing(index, "down")}
                          title="Descendre"
                        >
                          ▼
                        </button>
                      </div>
                    ) : undefined
                  }
                />
              </div>
            ))}
          </div>
          {!reorderMode ? (
            <Pagination page={listings.page} totalPages={listings.totalPages} onChange={setPage} />
          ) : null}
        </>
      )}

      {/* Rating & Review Dialog */}
      <Dialog
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title={lang === "ar" ? "تقييم المتجر" : "Évaluer cette boutique"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReviewOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSubmitReview} loading={reviewBusy}>
              {lang === "ar" ? "إرسال التقييم" : "Publier l'avis"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitReview} className="stack">
          <p className="small muted">
            {lang === "ar"
              ? "اختر عدد النجوم لتقييم مصداقية وجودة هذا المتجر."
              : "Attribuez une note de 1 à 5 étoiles (nombre naturel) à cette boutique."}
          </p>

          <Field label={lang === "ar" ? "التقييم (بالنجوم)" : "Note en étoiles"} htmlFor="rating-select" required>
            <div className="rating-selector-stars row" style={{ gap: 8, padding: "8px 0" }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={`star-select-btn ${reviewRating >= star ? "is-selected" : ""}`}
                  onClick={() => setReviewRating(star)}
                >
                  <Icon name="star" size={26} filled={reviewRating >= star} />
                  <span className="small">{star}★</span>
                </button>
              ))}
            </div>
          </Field>

          <Field label={lang === "ar" ? "ملاحظتك أو تعليقك (اختياري)" : "Votre avis (optionnel)"} htmlFor="review-comment">
            <Textarea
              id="review-comment"
              rows={3}
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder={lang === "ar" ? "منتجات مطابقة، بائع ثقة وسريع التجاوب..." : "Service impeccable, vendeur sérieux..."}
              maxLength={500}
            />
          </Field>
        </form>
      </Dialog>

      {/* Store Share Dialog */}
      <Dialog
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        title={lang === "ar" ? "مشاركة رابط المتجر" : "Partager le lien de la boutique"}
      >
        <div className="stack" style={{ gap: 16, padding: "8px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
            <Avatar name={seller.storeName || seller.displayName} imageUrl={seller.logoUrl || seller.avatarUrl} size="lg" withGreenRing />
            <div>
              <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>{seller.storeName || seller.displayName}</div>
              <div className="small muted">
                {seller.storeSlug ? `@${seller.storeSlug} · ` : ""}
                {lang === "ar" ? (seller.wilaya?.nameAr || "الجزائر") : (seller.wilaya?.nameFr || "Algérie")}
              </div>
            </div>
          </div>

          <p className="small muted" style={{ margin: 0 }}>
            {lang === "ar"
              ? "رابط مخصص لمتجرك ومعروضاتك، شاركه مع زبائنك لتصفح منتجاتك مباشرة :"
              : "Lien dédié à votre boutique pour permettre à vos clients de consulter directement tous vos produits :"}
          </p>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              readOnly
              value={proLink}
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--line)",
                background: "var(--surface-muted)",
                fontSize: "0.9rem",
                fontWeight: 600,
                color: "var(--brand-800)",
                direction: "ltr",
              }}
            />
            <Button
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(proLink);
                push(lang === "ar" ? "تم نسخ الرابط بنجاح !" : "Lien copié !", "success");
              }}
            >
              <Icon name="copy" size={14} />
              <span>{lang === "ar" ? "نسخ" : "Copier"}</span>
            </Button>
          </div>

          {/* Prominent Full-Width Copy Button */}
          <Button
            variant="primary"
            style={{
              width: "100%",
              justifyContent: "center",
              gap: 8,
              padding: "12px 16px",
              fontWeight: 700,
              fontSize: "0.98rem",
            }}
            onClick={async () => {
              await navigator.clipboard.writeText(proLink);
              push(lang === "ar" ? "تم نسخ رابط المتجر بنجاح !" : "Lien de la boutique copié !", "success");
            }}
          >
            <Icon name="copy" size={18} />
            <span>{lang === "ar" ? "نسخ رابط المتجر" : "Copier le lien de la boutique"}</span>
          </Button>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${seller.storeName || seller.displayName} :\n${proLink}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: "center", gap: 6, fontWeight: 700, padding: "10px" }}
            >
              <Icon name="whatsapp" size={16} />
              <span>WhatsApp</span>
            </a>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                if (navigator.share) {
                  try {
                    await navigator.share({
                      title: `${seller.storeName || seller.displayName}`,
                      text: `Boutique ${seller.storeName || seller.displayName} sur Azar Negh :`,
                      url: proLink,
                    });
                  } catch {
                    // canceled
                  }
                } else {
                  await navigator.clipboard.writeText(proLink);
                  push(lang === "ar" ? "تم نسخ الرابط !" : "Lien copié !", "success");
                }
              }}
              style={{ justifyContent: "center", gap: 6, fontWeight: 700, padding: "10px" }}
            >
              <Icon name="share" size={15} />
              <span>{lang === "ar" ? "مشاركة عبر..." : "Plus d'options"}</span>
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
