import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { ListingSummary, Paginated, StoreProfile } from "../../shared/types";
import { Avatar, Button, Dialog, EmptyState, Field, Input, Pagination, Spinner, Textarea, useToast } from "../components/ui";
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

export function Seller() {
  const { id } = useParams();
  const { user, updateUser } = useAuth();
  const { t, lang } = useI18n();
  const { push } = useToast();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const state = useAsync(
    () => api<SellerResponse>(`/sellers/${id}?page=${page}&perPage=24`),
    [id, page],
  );

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

  // Store edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [commune, setCommune] = useState("");
  const [address, setAddress] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [bio, setBio] = useState("");

  // Reordering mode for store owner
  const [reorderMode, setReorderMode] = useState(false);
  const [orderedItems, setOrderedItems] = useState<ListingSummary[] | null>(null);
  const [reorderBusy, setReorderBusy] = useState(false);

  useDocumentTitle(state.data?.seller.storeName || state.data?.seller.displayName || "Boutique");

  if (state.loading) return <Spinner />;
  if (state.error || !state.data) {
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

  const { seller, listings } = state.data;
  const isOwner = user?.id === seller.id;

  const currentIsFollowing = isFollowing !== null ? isFollowing : seller.isFollowing;
  const currentFollowersCount = followersCount !== null ? followersCount : seller.followersCount;
  const currentRating = avgRating !== null ? avgRating : seller.averageRating;
  const currentReviewsCount = reviewsCount !== null ? reviewsCount : seller.reviewsCount;

  // Initialize store edit fields when opening dialog
  const openEditModal = () => {
    setStoreName(seller.storeName || "");
    setStoreSlug(seller.storeSlug || "");
    setCommune(seller.commune || "");
    setAddress(seller.address || "");
    setOpeningHours(seller.openingHours || "");
    setBio(seller.bio || "");
    setEditOpen(true);
  };

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditBusy(true);
    try {
      const res = await api<{ user: any }>("/auth/store", {
        method: "PATCH",
        body: {
          displayName: seller.displayName,
          storeName: storeName.trim() || null,
          storeSlug: storeSlug.trim() || null,
          commune: commune.trim() || null,
          address: address.trim() || null,
          openingHours: openingHours.trim() || null,
          bio: bio.trim() || null,
          phone: seller.phone || "+213550000000",
          phonePublic: Boolean(seller.phone),
          whatsappPublic: seller.whatsappPublic,
          wilayaId: seller.wilaya.id,
        },
      });
      updateUser(res.user);
      push(lang === "ar" ? "تم تحديث معلومات المتجر بنجاح !" : "Boutique mise à jour avec succès !", "success");
      setEditOpen(false);
      state.reload();
    } catch (err) {
      push(errorMessage(err), "error");
    } finally {
      setEditBusy(false);
    }
  };

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

  const handleShareStore = async () => {
    const storeLink = `${window.location.origin}/vendeurs/${seller.storeSlug || seller.id}`;
    const title = seller.storeName || seller.displayName;
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: `Découvrez la boutique ${title} sur Azar Neɣ :`,
          url: storeLink,
        });
        return;
      } catch {
        // Fallback
      }
    }
    await navigator.clipboard.writeText(storeLink);
    push(lang === "ar" ? "تم نسخ رابط المتجر !" : "Lien de la boutique copié !", "success");
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
      {/* Store Header Banner */}
      <div className="store-header-card mb-6">
        <div className="store-banner-bg">
          <div className="store-banner-overlay" />
        </div>

        <div className="store-profile-bar">
          <div className="store-avatar-wrap">
            <Avatar name={seller.storeName || seller.displayName} size="xl" />
          </div>

          <div className="store-info-grow">
            <div className="store-title-row">
              <h1 className="store-heading">{seller.storeName || seller.displayName}</h1>
              {seller.storeSlug ? (
                <span className="store-slug-badge">@{seller.storeSlug}</span>
              ) : null}
            </div>

            <div className="store-meta-row">
              <span className="store-meta-item">
                <Icon name="map-pin" size={14} />
                <span>
                  {seller.commune ? `${seller.commune}, ` : ""}
                  {lang === "ar" ? seller.wilaya.nameAr : seller.wilaya.nameFr}
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
                <Button variant="secondary" size="sm" onClick={openEditModal}>
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
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${seller.storeName || seller.displayName} ${seller.commune || ""} ${seller.wilaya.nameFr}`)}`}
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

      {/* Edit Store Dialog for Merchant */}
      {isOwner ? (
        <Dialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title={lang === "ar" ? "تعديل معلومات المتجر والخدمة" : "Personnaliser ma boutique"}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleSaveStore} loading={editBusy}>
                {lang === "ar" ? "حفظ التغييرات" : "Enregistrer"}
              </Button>
            </>
          }
        >
          <form onSubmit={handleSaveStore} className="stack">
            <Field label={lang === "ar" ? "اسم المتجر أو الخدمة" : "Nom du magasin ou service"} htmlFor="store-name" required>
              <Input
                id="store-name"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Ex. Boutique Tech Alger"
                maxLength={80}
                required
              />
            </Field>

            <Field label={lang === "ar" ? "رابط المتجر الخاص (Slug)" : "Lien personnalisé (Slug)"} htmlFor="store-slug">
              <Input
                id="store-slug"
                value={storeSlug}
                onChange={(e) => setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="ex: tech-alger"
                maxLength={60}
              />
              <span className="small muted">
                {window.location.origin}/vendeurs/{storeSlug || "votre-boutique"}
              </span>
            </Field>

            <div className="row" style={{ gap: 12 }}>
              <Field label={lang === "ar" ? "البلدية" : "Commune"} htmlFor="store-commune">
                <Input
                  id="store-commune"
                  value={commune}
                  onChange={(e) => setCommune(e.target.value)}
                  placeholder="Ex. Bab Ezzouar"
                  maxLength={80}
                />
              </Field>
              <Field label={lang === "ar" ? "العنوان أو الحي" : "Adresse physique"} htmlFor="store-address">
                <Input
                  id="store-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ex. Boulevard Central N° 12"
                  maxLength={160}
                />
              </Field>
            </div>

            <Field label={lang === "ar" ? "أوقات العمل" : "Horaires d'ouverture"} htmlFor="store-hours">
              <Input
                id="store-hours"
                value={openingHours}
                onChange={(e) => setOpeningHours(e.target.value)}
                placeholder="Ex. 09:00 - 19:00 (Sam - Jeu)"
                maxLength={120}
              />
            </Field>

            <Field label={lang === "ar" ? "نبذة عن المتجر" : "Présentation / Bio"} htmlFor="store-bio">
              <Textarea
                id="store-bio"
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Spécialiste de la vente de matériel informatique..."
                maxLength={500}
              />
            </Field>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}
