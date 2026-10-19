import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { MetaResponse, SessionUser } from "../../shared/types";
import { Avatar, Button, Field, Input, Spinner, StatusBadge, Textarea, useToast } from "../components/ui";
import { CustomSelect } from "../components/CustomSelect";
import { Icon } from "../components/Icons";
import { PwaInstallCard } from "../components/PwaInstallCard";
import { api, errorMessage, fieldErrors } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { formatPhoneForInput, formatPrice } from "../lib/format";
import { PushNotificationCard } from "./Notifications";
import { useTheme } from "../lib/theme";
import type { ListingSummary, Paginated } from "../../shared/types";

interface AccountStats {
  listingsCount: number;
  favoritesCount: number;
  followersCount: number;
  followingCount: number;
  reviewsCount: number;
  avgRating: number;
}

interface FollowUser {
  id: string;
  avatar_url: string | null;
  display_name: string | null;
  store_name: string | null;
  store_slug: string | null;
}

function PreferencesPanel({
  lang,
  setLang,
  isAr,
  theme,
  setTheme,
}: {
  lang: "fr" | "ar";
  setLang: (l: "fr" | "ar") => void;
  isAr: boolean;
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
}) {
  return (
    <div
      className="panel stack"
      style={{
        gap: 12,
        padding: "14px 18px",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--line)",
      }}
    >
      {/* Simple Language row: NO flags, NO extra text */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="globe" size={18} style={{ color: "var(--brand-600)" }} />
          <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
            {isAr ? "اللغة" : "Langue"}
          </span>
        </div>
        <div
          style={{
            display: "inline-flex",
            background: "var(--surface-muted)",
            padding: 3,
            borderRadius: "var(--radius-pill)",
            border: "1px solid var(--line)",
            gap: 4,
          }}
        >
          <button
            type="button"
            onClick={() => setLang("ar")}
            className={`btn btn-sm ${lang === "ar" ? "btn-primary" : "btn-ghost"}`}
            style={{
              borderRadius: "var(--radius-pill)",
              padding: "4px 16px",
              fontSize: "0.85rem",
              height: 32,
              fontWeight: 600,
            }}
          >
            العربية
          </button>
          <button
            type="button"
            onClick={() => setLang("fr")}
            className={`btn btn-sm ${lang === "fr" ? "btn-primary" : "btn-ghost"}`}
            style={{
              borderRadius: "var(--radius-pill)",
              padding: "4px 16px",
              fontSize: "0.85rem",
              height: 32,
              fontWeight: 600,
            }}
          >
            Français
          </button>
        </div>
      </div>

      <div className="divider" style={{ margin: "2px 0" }} />

      {/* Dark Theme row: simple & direct */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: "1.1rem" }}>{theme === "dark" ? "🌙" : "☀️"}</span>
          <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
            {isAr ? "المظهر" : "Thème"}
          </span>
        </div>
        <div
          style={{
            display: "inline-flex",
            background: "var(--surface-muted)",
            padding: 3,
            borderRadius: "var(--radius-pill)",
            border: "1px solid var(--line)",
            gap: 4,
          }}
        >
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={`btn btn-sm ${theme === "light" ? "btn-primary" : "btn-ghost"}`}
            style={{
              borderRadius: "var(--radius-pill)",
              padding: "4px 14px",
              fontSize: "0.85rem",
              height: 32,
              fontWeight: 600,
            }}
          >
            {isAr ? "فاتح" : "Clair"}
          </button>
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={`btn btn-sm ${theme === "dark" ? "btn-primary" : "btn-ghost"}`}
            style={{
              borderRadius: "var(--radius-pill)",
              padding: "4px 14px",
              fontSize: "0.85rem",
              height: 32,
              fontWeight: 600,
            }}
          >
            {isAr ? "داكن" : "Sombre"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Account() {
  const { user, loading: authLoading, updateUser, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const isAr = lang === "ar";
  useDocumentTitle(isAr ? "حسابي والإعدادات — أزار نغ" : "Mon compte & Paramètres — Azar Neɣ");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { push } = useToast();
  const meta = useAsync(() => api<MetaResponse>("/meta"), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialView = (searchParams.get("view") as "hub" | "edit" | "follows" | "store") || "hub";
  const [view, setView] = useState<"hub" | "edit" | "follows" | "store">(initialView);
  const [followsTab, setFollowsTab] = useState<"followers" | "following">("followers");

  // Store Management View States
  const [showStoreSettings, setShowStoreSettings] = useState(false);
  const [storeListings, setStoreListings] = useState<ListingSummary[]>([]);
  const [storeListingsLoading, setStoreListingsLoading] = useState(false);
  const [storeSortBy, setStoreSortBy] = useState<"pinned" | "newest" | "price_asc" | "price_desc">("pinned");
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    if (typeof window === "undefined" || !user?.id) return [];
    try {
      const raw = localStorage.getItem(`azar.store_pinned_${user.id}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Load merchant listings when entering the store management view
  const fetchStoreListings = () => {
    if (!user) return;
    setStoreListingsLoading(true);
    api<{ listings: Paginated<ListingSummary> }>("/account/listings?perPage=100")
      .then((data) => {
        setStoreListings(data.listings.items || []);
      })
      .catch(() => {})
      .finally(() => setStoreListingsLoading(false));
  };

  useEffect(() => {
    if (view === "store" && user) {
      fetchStoreListings();
    }
  }, [view, user]);

  const syncStoreOrder = async (orderedList: ListingSummary[], newPinned: string[]) => {
    if (!user) return;
    setPinnedIds(newPinned);
    try {
      localStorage.setItem(`azar.store_pinned_${user.id}`, JSON.stringify(newPinned));
    } catch {}

    try {
      await api("/sellers/my-store/reorder", {
        method: "POST",
        body: { listingIds: orderedList.map((item) => item.id) },
      });
    } catch {}
  };

  const handleTogglePin = async (listingId: string) => {
    const isCurrentlyPinned = pinnedIds.includes(listingId);
    const nextPinned = isCurrentlyPinned
      ? pinnedIds.filter((id) => id !== listingId)
      : [listingId, ...pinnedIds];

    const pinnedItems = nextPinned
      .map((id) => storeListings.find((item) => item.id === id))
      .filter((item): item is ListingSummary => Boolean(item));
    const unpinnedItems = storeListings.filter((item) => !nextPinned.includes(item.id));
    const nextListings = [...pinnedItems, ...unpinnedItems];

    setStoreListings(nextListings);
    await syncStoreOrder(nextListings, nextPinned);

    push(
      !isCurrentlyPinned
        ? (isAr ? "تم تثبيت المنتج في واجهة متجرك (Présenti) ⭐ !" : "Produit mis en vitrine (Présenti) ⭐ !")
        : (isAr ? "تم إلغاء التثبيت من الواجهة" : "Retiré de la vitrine"),
      "success",
    );
  };

  const handleMoveStoreItem = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= storeListings.length) return;
    const items = [...storeListings];
    const currentItem = items[index];
    const targetItem = items[targetIndex];
    if (!currentItem || !targetItem) return;
    items[index] = targetItem;
    items[targetIndex] = currentItem;
    setStoreListings(items);
    await syncStoreOrder(items, pinnedIds);
  };

  const sortedStoreListings = [...storeListings].sort((a, b) => {
    if (storeSortBy === "pinned") {
      const aPinned = pinnedIds.includes(a.id);
      const bPinned = pinnedIds.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      if (aPinned && bPinned) {
        return pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id);
      }
      return 0;
    }
    if (storeSortBy === "newest") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (storeSortBy === "price_asc") {
      return (a.priceDa ?? 0) - (b.priceDa ?? 0);
    }
    if (storeSortBy === "price_desc") {
      return (b.priceDa ?? 0) - (a.priceDa ?? 0);
    }
    return 0;
  });

  useEffect(() => {
    const viewParam = searchParams.get("view");
    if (viewParam === "store" || viewParam === "edit" || viewParam === "follows" || viewParam === "hub") {
      setView(viewParam);
    }
  }, [searchParams]);

  const handleSetView = (nextView: "hub" | "edit" | "follows" | "store") => {
    setView(nextView);
    if (nextView === "hub") {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ view: nextView }, { replace: true });
    }
  };

  const [stats, setStats] = useState<AccountStats | null>(null);
  const [followsData, setFollowsData] = useState<{ followers: FollowUser[]; following: FollowUser[] } | null>(null);

  const [busy, setBusy] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  const storeLogoInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [storeName, setStoreName] = useState(user?.storeName ?? "");
  const [storeSlug, setStoreSlug] = useState(user?.storeSlug ?? "");
  const [storeLogoUrl, setStoreLogoUrl] = useState(user?.logoUrl ?? "");
  const [storeBannerColor, setStoreBannerColor] = useState(user?.bannerUrl || "#10b981");
  const [commune, setCommune] = useState(user?.commune ?? "");
  const [address, setAddress] = useState(user?.address ?? "");
  const [openingHours, setOpeningHours] = useState(user?.openingHours ?? "");
  const [phone, setPhone] = useState(formatPhoneForInput(user?.phone));
  const [wilayaId, setWilayaId] = useState(String(user?.wilayaId ?? 16));
  const [bio, setBio] = useState(user?.bio ?? "");
  const [phonePublic, setPhonePublic] = useState(Boolean(user?.phonePublic));
  const [whatsappPublic, setWhatsappPublic] = useState(Boolean(user?.whatsappPublic));

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName ?? "");
    setStoreName(user.storeName ?? "");
    setStoreSlug(user.storeSlug ?? "");
    setStoreLogoUrl(user.logoUrl ?? "");
    setStoreBannerColor(user.bannerUrl || "#10b981");
    setCommune(user.commune ?? "");
    setAddress(user.address ?? "");
    setOpeningHours(user.openingHours ?? "");
    setPhone(formatPhoneForInput(user.phone));
    setWilayaId(String(user.wilayaId ?? 16));
    setBio(user.bio ?? "");
    setPhonePublic(user.phonePublic);
    setWhatsappPublic(user.whatsappPublic);
  }, [user]);

  // Load account statistics
  useEffect(() => {
    if (!user) return;
    api<AccountStats>("/account/stats")
      .then((data) => setStats(data))
      .catch(() => {});
  }, [user]);

  // Load followers/following when follows view is active
  useEffect(() => {
    if (view === "follows" && !followsData) {
      api<{ followers: FollowUser[]; following: FollowUser[] }>("/account/follows")
        .then((data) => setFollowsData(data))
        .catch(() => {});
    }
  }, [view, followsData]);

  if (authLoading) return <Spinner />;

  const handleAvatarFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      push(
        isAr ? "يرجى اختيار ملف صورة صالح (JPG أو PNG أو WebP)." : "Veuillez choisir un format d'image valide (JPG, PNG ou WebP).",
        "error",
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      push(
        isAr ? "حجم الصورة يجب ألا يتجاوز 5 ميغابايت." : "L'image ne doit pas dépasser 5 Mo.",
        "error",
      );
      return;
    }

    setUploadingAvatar(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api<{ avatarUrl: string }>("/account/avatar", {
        method: "POST",
        body: formData,
      });

      updateUser({ ...user, avatarUrl: res.avatarUrl });
      push(
        isAr ? "تم تحديث صورتك الشخصية بنجاح !" : "Photo de profil mise à jour avec succès !",
        "success",
      );
    } catch (err) {
      push(errorMessage(err), "error");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    setUploadingAvatar(true);
    try {
      await api<{ avatarUrl: null }>("/account/avatar", { method: "DELETE" });
      updateUser({ ...user, avatarUrl: null });
      push(
        isAr ? "تم حذف الصورة الشخصية بنجاح." : "Photo de profil supprimée.",
        "success",
      );
    } catch (err) {
      push(errorMessage(err), "error");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/connexion");
  };

  const handleStoreLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      push(
        isAr ? "حجم الصورة يجب ألا يتجاوز 5 ميغابايت." : "Le logo ne doit pas dépasser 5 Mo.",
        "error",
      );
      return;
    }
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api<{ image: { id: string; url: string } }>("/images", {
        method: "POST",
        body: formData,
      });
      setStoreLogoUrl(res.image.url);
      push(
        isAr ? "تم رفع صورة المتجر بنجاح ! اضغط حفظ لتثبيت التعديل." : "Photo du magasin téléversée ! Cliquez sur Enregistrer.",
        "success",
      );
    } catch (err) {
      push(errorMessage(err), "error");
    } finally {
      setUploadingLogo(false);
      if (storeLogoInputRef.current) storeLogoInputRef.current.value = "";
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFields({});
    try {
      const data = await api<{ user: SessionUser }>("/auth/store", {
        method: "PATCH",
        body: {
          displayName: displayName.trim(),
          storeName: storeName.trim() || null,
          storeSlug: storeSlug.trim() || null,
          commune: commune.trim() || null,
          address: address.trim() || null,
          openingHours: openingHours.trim() || null,
          logoUrl: storeLogoUrl.trim() || null,
          bannerUrl: storeBannerColor.trim() || null,
          phone,
          phonePublic,
          whatsappPublic,
          wilayaId: Number(wilayaId),
          bio: bio.trim() || null,
        },
      });
      updateUser(data.user);
      setShowStoreSettings(false);
      push(
        isAr ? "تم حفظ التعديلات بنجاح !" : "Modifications enregistrées avec succès !",
        "success",
      );
    } catch (error) {
      push(errorMessage(error), "error");
      setFields(fieldErrors(error));
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="container page" style={{ maxWidth: 760 }}>
        <div className="stack" style={{ gap: "var(--space-4)" }}>
          {/* Guest Greeting & Login / Register Callout */}
          <div
            className="panel stack"
            style={{
              gap: 16,
              padding: "clamp(1.25rem, 3vw, 2rem)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--line)",
              background: "linear-gradient(135deg, var(--surface) 0%, var(--surface-muted) 100%)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "rgba(16, 185, 129, 0.12)",
                  color: "var(--brand-700)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="user" size={28} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 800, margin: 0, color: "var(--ink)" }}>
                  {isAr ? "مرحباً بك في أزار نغ" : <>Bienvenue sur Azar <span className="brand-negh">Neɣ</span></>}
                </h2>
                <p className="small muted" style={{ margin: "4px 0 0 0" }}>
                  {isAr
                    ? "سجّل الدخول لنشر إعلاناتك، إنشاء متجرك، ومراسلة البائعين بكل أمان."
                    : "Connectez-vous pour publier des annonces, créer votre boutique et contacter les vendeurs."}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
              <Link
                to="/connexion"
                className="btn btn-primary"
                style={{ flex: 1, minWidth: 140, justifyContent: "center" }}
              >
                <Icon name="logout" size={17} />
                {isAr ? "تسجيل الدخول" : "Se connecter"}
              </Link>
              <Link
                to="/connexion?mode=register"
                className="btn btn-secondary"
                style={{ flex: 1, minWidth: 140, justifyContent: "center" }}
              >
                <Icon name="plus" size={17} />
                {isAr ? "إنشاء حساب جديد" : "Créer un compte"}
              </Link>
            </div>
          </div>

          {/* Preferences: Simple Language (no flags/fluff) & Dark Theme */}
          <PreferencesPanel lang={lang} setLang={setLang} isAr={isAr} theme={theme} setTheme={setTheme} />

          {/* Push Notification Card */}
          <PushNotificationCard />

          {/* Legal & App Links */}
          <div
            className="panel stack"
            style={{
              gap: 8,
              padding: "clamp(1rem, 3vw, 1.5rem)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--line)",
            }}
          >
            <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: "0 0 4px 0" }}>
              {isAr ? "الشروط والسياسات العامة" : "Informations & Politiques"}
            </h3>

            <Link
              to="/conditions"
              className="account-menu-item"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                borderRadius: "var(--radius-md)",
                color: "var(--ink)",
                textDecoration: "none",
                transition: "background 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "rgba(100, 116, 139, 0.1)",
                    color: "var(--ink-muted)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Icon name="file" size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                    {isAr ? "شروط الاستخدام" : "Conditions d'utilisation"}
                  </div>
                  <div className="small muted">
                    {isAr ? "القواعد والضوابط القانونية للمنصة" : "Règles et conditions d'usage"}
                  </div>
                </div>
              </div>
              <Icon
                name="arrow-right"
                size={16}
                style={{ color: "var(--ink-muted)", transform: isAr ? "rotate(180deg)" : "none" }}
              />
            </Link>

            <Link
              to="/confidentialite"
              className="account-menu-item"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                borderRadius: "var(--radius-md)",
                color: "var(--ink)",
                textDecoration: "none",
                transition: "background 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "rgba(100, 116, 139, 0.1)",
                    color: "var(--ink-muted)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Icon name="shield" size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                    {isAr ? "سياسة الخصوصية وحماية البيانات" : "Politique de confidentialité"}
                  </div>
                  <div className="small muted">
                    {isAr ? "حماية بياناتك وحقوقك الشخصية" : "Protection de vos données"}
                  </div>
                </div>
              </div>
              <Icon
                name="arrow-right"
                size={16}
                style={{ color: "var(--ink-muted)", transform: isAr ? "rotate(180deg)" : "none" }}
              />
            </Link>
          </div>

          {/* PWA Install Card */}
          <PwaInstallCard lang={lang} />

          <div style={{ textAlign: "center", padding: "16px 0 calc(var(--tabbar-height, 68px) + 24px) 0" }}>
            <p className="small muted" style={{ margin: 0 }}>
              Azar <span className="brand-negh">Neɣ</span> · {isAr ? "النسخة 2.0 — السوق الجزائري المحلي" : "Version 2.0 — Marketplace Algérie"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const renderRoleBadge = () => {
    if (user.role === "ADMIN") {
      return (
        <span className="badge badge-danger" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="shield" size={13} />
          {isAr ? "مسؤول النظام" : "Administrateur"}
        </span>
      );
    }
    if (user.role === "MODERATOR") {
      return (
        <span className="badge badge-warning" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="shield" size={13} />
          {isAr ? "مشرف" : "Modérateur"}
        </span>
      );
    }
    if (user.storeName || user.storeSlug) {
      return (
        <span className="badge badge-brand" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="check" size={13} />
          {isAr ? "متجر معتمد" : "Boutique"}
        </span>
      );
    }
    return (
      <span className="badge" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <Icon name="user" size={13} />
        {isAr ? "حساب شخصي" : "Particulier"}
      </span>
    );
  };

  return (
    <div className="container page" style={{ maxWidth: 760 }}>
      {/* ---------------------------------------------------------------- VIEW: EDIT PROFILE & AVATAR */}
      {view === "edit" ? (
        <div className="stack" style={{ gap: "var(--space-4)" }}>
          <div className="row-between">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleSetView("hub")}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Icon name="arrow-right" size={16} style={{ transform: isAr ? "rotate(0deg)" : "rotate(180deg)" }} />
              {isAr ? "العودة للحساب" : "Retour"}
            </button>
            <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: 0 }}>
              {isAr ? "تعديل الملف الشخصي والصورة" : "Modifier mon profil"}
            </h2>
            <div style={{ width: 60 }} />
          </div>

          {/* Photo Management Card */}
          <div className="panel" style={{ padding: "clamp(1.2rem, 3vw, 1.75rem)" }}>
            <h3 style={{ fontSize: "var(--text-base)", fontWeight: 600, marginBottom: 14 }}>
              {isAr ? "صورة الحساب الشخصي" : "Photo de profil"}
            </h3>

            <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              <div style={{ position: "relative" }}>
                <Avatar
                  name={user.displayName ?? user.email}
                  imageUrl={user.avatarUrl}
                  size="xl"
                  withGreenRing={true}
                />
                {uploadingAvatar ? (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(0,0,0,0.5)",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                    }}
                  >
                    <Spinner />
                  </div>
                ) : null}
              </div>

              <div className="stack" style={{ gap: 8, flex: 1, minWidth: 200 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: "none" }}
                  onChange={handleAvatarFile}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={uploadingAvatar}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Icon name="camera" size={14} />
                    {user.avatarUrl ? (isAr ? "تغيير الصورة" : "Modifier la photo") : (isAr ? "إضافة صورة" : "Ajouter une photo")}
                  </Button>
                  {user.avatarUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={uploadingAvatar}
                      onClick={handleRemoveAvatar}
                      style={{ color: "var(--danger)" }}
                    >
                      <Icon name="trash" size={14} />
                      {isAr ? "حذف الصورة" : "Supprimer"}
                    </Button>
                  ) : null}
                </div>
                <p className="small muted" style={{ margin: 0 }}>
                  {isAr ? "الصيغ المدعومة: JPG، PNG أو WebP (بحد أقصى 5 ميغابايت)." : "Formats acceptés : JPG, PNG ou WebP (max. 5 Mo)."}
                </p>
              </div>
            </div>
          </div>

          {/* Details Form Card */}
          <div className="panel" style={{ padding: "clamp(1.2rem, 3vw, 1.75rem)" }}>
            <h3 style={{ fontSize: "var(--text-base)", fontWeight: 600, marginBottom: 14 }}>
              {isAr ? "المعلومات الشخصية والبيانات" : "Informations personnelles & boutique"}
            </h3>
            <form onSubmit={save} className="stack" style={{ gap: "var(--space-4)" }}>
              <div className="form-grid">
                <Field
                  label={t("auth.name")}
                  htmlFor="profile-name"
                  error={fields.displayName}
                  required
                >
                  <Input
                    id="profile-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    minLength={2}
                    maxLength={60}
                    required
                  />
                </Field>

                <Field
                  label="E-mail"
                  htmlFor="profile-email"
                  hint={isAr ? "حساب Google المرتبط (غير قابل للتعديل)." : "Compte Google associé (non modifiable)."}
                >
                  <Input id="profile-email" value={user.email} disabled />
                </Field>

                <Field
                  label={t("auth.phone")}
                  htmlFor="profile-phone"
                  error={fields.phone}
                  required
                >
                  <Input
                    id="profile-phone"
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    required
                  />
                </Field>

                <Field
                  label={t("auth.wilaya")}
                  htmlFor="profile-wilaya"
                  error={fields.wilayaId}
                  required
                >
                  <CustomSelect
                    id="profile-wilaya"
                    value={wilayaId}
                    onChange={setWilayaId}
                    options={(meta.data?.wilayas ?? []).map((item) => ({
                      value: item.id,
                      label: `${item.id.toString().padStart(2, "0")} — ${isAr ? item.nameAr : item.nameFr}`,
                      sublabel: isAr ? item.nameFr : item.nameAr,
                    }))}
                    searchable
                    searchPlaceholder={isAr ? "ابحث عن الولاية..." : "Rechercher wilaya..."}
                  />
                </Field>

                <Field
                  label={isAr ? "البلدية والعنوان" : "Commune & Quartier"}
                  htmlFor="profile-commune"
                >
                  <Input
                    id="profile-commune"
                    value={commune}
                    onChange={(event) => setCommune(event.target.value)}
                    placeholder={isAr ? "مثال: باب الزوار" : "Ex. Bab Ezzouar"}
                    maxLength={80}
                  />
                </Field>

                <Field
                  label={isAr ? "عنوان المحل / المقر" : "Adresse exacte"}
                  htmlFor="profile-address"
                >
                  <Input
                    id="profile-address"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder={isAr ? "مثال: شارع 1 نوفمبر" : "Ex. Boulevard du 1er Novembre"}
                    maxLength={120}
                  />
                </Field>

                <Field
                  label={isAr ? "اسم المتجر أو الخدمة" : "Nom de la boutique / service"}
                  htmlFor="store-name"
                  error={fields.storeName}
                  hint={isAr ? "اتركه فارغاً إذا كنت فرداً عادياً" : "Laissez vide si vous êtes un particulier"}
                >
                  <Input
                    id="store-name"
                    value={storeName}
                    onChange={(event) => setStoreName(event.target.value)}
                    placeholder={isAr ? "مثال: متجر الإلكترونيات الحديثة" : "Ex. Électro Express"}
                    maxLength={80}
                  />
                </Field>

                <Field
                  label={isAr ? "رابط المتجر (Slug)" : "Lien de la boutique (Slug)"}
                  htmlFor="store-slug"
                  error={fields.storeSlug}
                  hint={storeSlug ? `${window.location.origin}/vendeurs/${storeSlug}` : undefined}
                >
                  <Input
                    id="store-slug"
                    value={storeSlug}
                    onChange={(event) => setStoreSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="ex: electro-express"
                    maxLength={60}
                  />
                </Field>

                <Field
                  label={isAr ? "أوقات العمل" : "Horaires d'ouverture"}
                  htmlFor="profile-hours"
                >
                  <Input
                    id="profile-hours"
                    value={openingHours}
                    onChange={(event) => setOpeningHours(event.target.value)}
                    placeholder={isAr ? "مثال: 09:00 - 18:00 (السبت - الخميس)" : "Ex. 09:00 - 18:00 (Sam - Jeu)"}
                    maxLength={120}
                  />
                </Field>

                <Field
                  label={t("account.bio")}
                  htmlFor="profile-bio"
                  error={fields.bio}
                  hint={isAr ? "500 حرف كحد أقصى." : "500 caractères maximum."}
                  className="full"
                >
                  <Textarea
                    id="profile-bio"
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    maxLength={500}
                    placeholder={isAr ? "عرّف بنشاطك، السلع المتوفرة، والخدمات المقدمة…" : "Présentez vos produits et services…"}
                  />
                </Field>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={phonePublic}
                    onChange={(event) => setPhonePublic(event.target.checked)}
                  />
                  <span>{t("account.phonePublic")}</span>
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={whatsappPublic}
                    onChange={(event) => setWhatsappPublic(event.target.checked)}
                  />
                  <span>{t("account.whatsappPublic")}</span>
                </label>
              </div>

              <div className="form-actions" style={{ marginTop: "var(--space-2)", paddingBottom: "calc(var(--tabbar-height, 68px) + 32px)" }}>
                <Button type="submit" loading={busy}>
                  {t("account.saveProfile")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleSetView("hub")}
                >
                  {isAr ? "إلغاء" : "Annuler"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- VIEW: FOLLOWS (ABONNÉS / ABONNEMENTS) */}
      {view === "follows" ? (
        <div className="stack" style={{ gap: "var(--space-4)" }}>
          <div className="row-between">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleSetView("hub")}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Icon name="arrow-right" size={16} style={{ transform: isAr ? "rotate(0deg)" : "rotate(180deg)" }} />
              {isAr ? "العودة للحساب" : "Retour"}
            </button>
            <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: 0 }}>
              {isAr ? "المتابعون والاشتراكات" : "Abonnés & Abonnements"}
            </h2>
            <div style={{ width: 60 }} />
          </div>

          <div className="panel" style={{ padding: "clamp(1rem, 2.5vw, 1.5rem)" }}>
            {/* Tab switch */}
            <div
              style={{
                display: "flex",
                gap: 8,
                background: "var(--surface-muted)",
                padding: 4,
                borderRadius: "var(--radius-md)",
                marginBottom: 16,
              }}
            >
              <button
                type="button"
                className={`btn btn-sm ${followsTab === "followers" ? "btn-primary" : "btn-ghost"}`}
                style={{ flex: 1 }}
                onClick={() => setFollowsTab("followers")}
              >
                {isAr ? `المتابعون (${stats?.followersCount ?? 0})` : `Abonnés (${stats?.followersCount ?? 0})`}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${followsTab === "following" ? "btn-primary" : "btn-ghost"}`}
                style={{ flex: 1 }}
                onClick={() => setFollowsTab("following")}
              >
                {isAr ? `الاشتراكات (${stats?.followingCount ?? 0})` : `Abonnements (${stats?.followingCount ?? 0})`}
              </button>
            </div>

            {/* List */}
            {followsTab === "followers" ? (
              <div className="stack" style={{ gap: 10 }}>
                {followsData?.followers.length ? (
                  followsData.followers.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 14px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--surface)",
                        border: "1px solid var(--line)",
                      }}
                    >
                      <Avatar name={f.display_name} imageUrl={f.avatar_url} size="lg" withGreenRing={true} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
                          {f.store_name || f.display_name || (isAr ? "مستخدم" : "Utilisateur")}
                        </div>
                        {f.store_slug ? (
                          <div className="small muted">@{f.store_slug}</div>
                        ) : null}
                      </div>
                      {f.store_slug ? (
                        <Link to={`/vendeurs/${f.store_slug}`} className="btn btn-sm btn-outline">
                          {isAr ? "عرض المتجر" : "Voir"}
                        </Link>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="empty" style={{ padding: "30px 10px", textAlign: "center" }}>
                    <p className="muted small">
                      {isAr ? "لا يوجد متابعون لمتجرك حتى الآن." : "Aucun abonné pour le moment."}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {followsData?.following.length ? (
                  followsData.following.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 14px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--surface)",
                        border: "1px solid var(--line)",
                      }}
                    >
                      <Avatar name={f.display_name} imageUrl={f.avatar_url} size="lg" withGreenRing={true} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
                          {f.store_name || f.display_name || (isAr ? "متجر" : "Boutique")}
                        </div>
                        {f.store_slug ? (
                          <div className="small muted">@{f.store_slug}</div>
                        ) : null}
                      </div>
                      {f.store_slug ? (
                        <Link to={`/vendeurs/${f.store_slug}`} className="btn btn-sm btn-outline">
                          {isAr ? "زيارة المتجر" : "Visiter"}
                        </Link>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="empty" style={{ padding: "30px 10px", textAlign: "center" }}>
                    <p className="muted small">
                      {isAr ? "أنت لا تتابع أي متجر حالياً." : "Vous ne suivez aucune boutique pour le moment."}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- VIEW: STORE MANAGEMENT (MODIFIER LA BOUTIQUE) */}
      {view === "store" ? (
        <div className="stack" style={{ gap: "var(--space-4)", paddingBottom: "140px" }}>
          {/* Header & Back Button */}
          <div className="row-between" style={{ alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                if (showStoreSettings) {
                  setShowStoreSettings(false);
                } else {
                  handleSetView("hub");
                }
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Icon name="arrow-right" size={16} style={{ transform: isAr ? "rotate(0deg)" : "rotate(180deg)" }} />
              {showStoreSettings
                ? (isAr ? "العودة للمنتجات" : "Retour aux produits")
                : (isAr ? "العودة للحساب" : "Retour")}
            </button>
            <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <span>🏪</span>
              <span>{isAr ? "إدارة ومعروضات متجري" : "Gestion & Vitrine de ma boutique"}</span>
            </h2>
            {storeSlug ? (
              <Link
                to={`/vendeurs/${storeSlug}`}
                className="btn btn-sm btn-outline"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Icon name="eye" size={15} />
                <span>{isAr ? "المتجر العام" : "Vitrine"}</span>
              </Link>
            ) : (
              <div style={{ width: 60 }} />
            )}
          </div>

          {showStoreSettings ? (
            /* ----------------- SUB-VIEW: STORE PROFILE SETTINGS FORM ----------------- */
            <form onSubmit={save} className="stack" style={{ gap: "var(--space-4)" }}>
              {/* Back to shelf banner button */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "var(--surface-muted)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--line)",
                }}
              >
                <span className="small muted">
                  {isAr ? "تعديل إعدادات وبيانات المتجر" : "Modification des informations du magasin"}
                </span>
                <button
                  type="button"
                  onClick={() => setShowStoreSettings(false)}
                  className="btn btn-sm btn-ghost"
                  style={{ fontWeight: 600, color: "var(--brand-700)" }}
                >
                  {isAr ? "← العودة لمعروضات المتجر" : "← Retour aux produits"}
                </button>
              </div>
            {/* Visual Branding Card (Photo de la boutique) */}
            <div
              className="panel stack"
              style={{
                gap: 16,
                padding: "clamp(1rem, 3vw, 1.75rem)",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
                border: "1px solid var(--line)",
              }}
            >
              <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: 0 }}>
                {isAr ? "صورة أو شعار المتجر" : "Photo / Logo de la boutique"}
              </h3>

              {/* Logo Area */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <input
                  ref={storeLogoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: "none" }}
                  onChange={handleStoreLogoUpload}
                />
                <div style={{ position: "relative" }}>
                  <Avatar
                    name={storeName || displayName}
                    imageUrl={storeLogoUrl || user.avatarUrl}
                    size="xl"
                    withGreenRing={true}
                  />
                </div>
                <div className="stack" style={{ gap: 6, flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
                    {isAr ? "الصورة المعتمدة للمتجر" : "Photo officielle du magasin"}
                  </div>
                  <p className="small muted" style={{ margin: 0 }}>
                    {isAr
                      ? "تظهر كصورة رئيسية لمتجرك وعلى جميع بطاقات منتجاتك بعلامة التوثيق الخضراء."
                      : "S'affiche comme visuel principal de votre vitrine et sur toutes vos annonces."}
                  </p>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => storeLogoInputRef.current?.click()}
                      disabled={uploadingLogo}
                    >
                      {uploadingLogo ? <Spinner /> : <Icon name="camera" size={14} />}
                      <span>{isAr ? "تغيير صورة المتجر" : "Changer la photo"}</span>
                    </button>
                    {storeLogoUrl ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => setStoreLogoUrl("")}
                        style={{ color: "var(--danger)" }}
                      >
                        {isAr ? "إزالة" : "Supprimer"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {/* Store Slim Banner Color Picker Panel */}
            <div
              className="panel stack"
              style={{
                gap: 12,
                padding: "clamp(1rem, 3vw, 1.5rem)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--line)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: 0 }}>
                    {isAr ? "لون شريط البانير للمتجر" : "Couleur de la bannière du magasin"}
                  </h3>
                  <p className="small muted" style={{ margin: "2px 0 0 0" }}>
                    {isAr
                      ? "شريط أنيق وصغير يظهر أعلى واجهة متجرك باللون الذي تختاره (الافتراضي هو الأخضر المميز لـ Azar Neɣ)."
                      : "Une fine bannière élégante s'affiche en haut de votre boutique avec la couleur de votre choix."}
                  </p>
                </div>
              </div>

              {/* Live Mini Preview of Store Header with selected color */}
              <div
                style={{
                  height: "56px",
                  borderRadius: "var(--radius-md)",
                  background: storeBannerColor && storeBannerColor.startsWith("#")
                    ? `linear-gradient(135deg, ${storeBannerColor} 0%, ${storeBannerColor}dd 100%)`
                    : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 8px rgba(0,0,0,0.06)",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 16px",
                  gap: 12,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "var(--surface)",
                    border: "2px solid rgba(255,255,255,0.85)",
                    display: "grid",
                    placeItems: "center",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                  }}
                >
                  <Icon name="store" size={16} />
                </div>
                <span style={{ color: "#ffffff", fontWeight: 700, fontSize: "0.9rem", textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}>
                  {storeName || displayName || (isAr ? "معاينة شريط المتجر" : "Aperçu de la bannière")}
                </span>
              </div>

              {/* Preset Palette + Custom Color Picker */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                {[
                  { hex: "#10b981", label: isAr ? "أخضر آزار نغ (افتراضي)" : "Émeraude Azar (défaut)" },
                  { hex: "#059669", label: isAr ? "أخضر غابي" : "Vert forêt" },
                  { hex: "#0284c7", label: isAr ? "أزرق محيطي" : "Bleu océan" },
                  { hex: "#6366f1", label: isAr ? "نيلي عصري" : "Indigo moderne" },
                  { hex: "#8b5cf6", label: isAr ? "بنفسجي ملكي" : "Violet royal" },
                  { hex: "#e11d48", label: isAr ? "أحمر ياقوتي" : "Rose rubis" },
                  { hex: "#ea580c", label: isAr ? "برتقالي دافئ" : "Ambre chaud" },
                  { hex: "#1e293b", label: isAr ? "كلاسيكي داكن" : "Ardoise sombre" },
                ].map((color) => {
                  const isSelected = storeBannerColor.toLowerCase() === color.hex.toLowerCase();
                  return (
                    <button
                      key={color.hex}
                      type="button"
                      title={color.label}
                      onClick={() => setStoreBannerColor(color.hex)}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: "50%",
                        background: color.hex,
                        border: isSelected ? "3px solid var(--ink)" : "2px solid #ffffff",
                        boxShadow: isSelected ? "0 0 0 2px var(--brand-500)" : "0 1px 4px rgba(0,0,0,0.15)",
                        cursor: "pointer",
                        display: "grid",
                        placeItems: "center",
                        transition: "transform 0.15s ease",
                        transform: isSelected ? "scale(1.12)" : "scale(1)",
                      }}
                    >
                      {isSelected ? <span style={{ color: "#fff", fontSize: 13, fontWeight: "bold" }}>✓</span> : null}
                    </button>
                  );
                })}

                {/* Custom Color Input */}
                <label
                  title={isAr ? "اختيار لون مخصص" : "Couleur personnalisée"}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 10px",
                    borderRadius: "var(--radius-pill)",
                    border: "1px solid var(--line)",
                    background: "var(--surface-muted)",
                    cursor: "pointer",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                  }}
                >
                  <input
                    type="color"
                    value={storeBannerColor && storeBannerColor.startsWith("#") ? storeBannerColor : "#10b981"}
                    onChange={(e) => setStoreBannerColor(e.target.value)}
                    style={{
                      width: 22,
                      height: 22,
                      border: "none",
                      borderRadius: "50%",
                      padding: 0,
                      cursor: "pointer",
                      background: "none",
                    }}
                  />
                  <span>{isAr ? "لون مخصص" : "Personnaliser"}</span>
                </label>
              </div>
            </div>

            {/* Store Details Panel */}
            <div
              className="panel stack"
              style={{
                gap: 14,
                padding: "clamp(1rem, 3vw, 1.75rem)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--line)",
              }}
            >
              <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: 0 }}>
                {isAr ? "بيانات ومعلومات المتجر" : "Informations & Coordonnées de la boutique"}
              </h3>

              <div className="form-grid">
                <Field
                  label={isAr ? "اسم المتجر" : "Nom commercial de la boutique"}
                  htmlFor="store-name-input"
                  error={fields.storeName}
                  required
                >
                  <Input
                    id="store-name-input"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder={isAr ? "مثال: متجر الإلكترونيات العصرية" : "Ex. Électro Express Alger"}
                    maxLength={80}
                  />
                </Field>

                <Field
                  label={isAr ? "رابط المتجر المخصص (Slug)" : "Lien public personnalisé (Slug)"}
                  htmlFor="store-slug-input"
                  error={fields.storeSlug}
                  hint={storeSlug ? `${window.location.origin}/vendeurs/${storeSlug}` : undefined}
                >
                  <Input
                    id="store-slug-input"
                    value={storeSlug}
                    onChange={(e) => setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="ex. electro-express"
                    maxLength={60}
                  />
                </Field>

                <Field
                  label={t("auth.wilaya")}
                  htmlFor="store-wilaya-input"
                  error={fields.wilayaId}
                  required
                >
                  <CustomSelect
                    id="store-wilaya-input"
                    value={wilayaId}
                    onChange={setWilayaId}
                    options={(meta.data?.wilayas ?? []).map((item) => ({
                      value: item.id,
                      label: `${item.id.toString().padStart(2, "0")} — ${isAr ? item.nameAr : item.nameFr}`,
                      sublabel: isAr ? item.nameFr : item.nameAr,
                    }))}
                    searchable
                    searchPlaceholder={isAr ? "ابحث عن الولاية..." : "Rechercher wilaya..."}
                  />
                </Field>

                <Field
                  label={isAr ? "البلدية أو الحي" : "Commune ou quartier"}
                  htmlFor="store-commune-input"
                >
                  <Input
                    id="store-commune-input"
                    value={commune}
                    onChange={(e) => setCommune(e.target.value)}
                    placeholder={isAr ? "مثال: سيدي يحيى، حيدرة" : "Ex. Sidi Yahia, Hydra"}
                    maxLength={80}
                  />
                </Field>
              </div>

              <Field
                label={isAr ? "العنوان الدقيق للمحل أو المقر" : "Adresse physique précise"}
                htmlFor="store-address-input"
              >
                <Input
                  id="store-address-input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={isAr ? "مثال: 14 شارع ديدوش مراد" : "Ex. 14 Rue Didouche Mourad"}
                  maxLength={160}
                />
              </Field>

              <Field
                label={isAr ? "أوقات وساعات العمل" : "Horaires d'ouverture"}
                htmlFor="store-hours-input"
                hint={isAr ? "مثال: من السبت إلى الخميس: 09:00 - 19:00" : "Ex. Sam - Jeu : 09h00 - 19h00 (Fermé le Vendredi)"}
              >
                <Input
                  id="store-hours-input"
                  value={openingHours}
                  onChange={(e) => setOpeningHours(e.target.value)}
                  placeholder="Ex. 09:00 - 19:00"
                  maxLength={120}
                />
              </Field>

              <Field
                label={isAr ? "نبذة تعريفية عن المتجر والخدمات" : "À propos / Bio de la boutique"}
                htmlFor="store-bio-input"
                hint="500 caractères max."
              >
                <Textarea
                  id="store-bio-input"
                  rows={4}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={500}
                  placeholder={
                    isAr
                      ? "اكتب نبذة مميزة عن متجرك، المنتجات التي توفرها، وضمانات الجودة والتوصيل..."
                      : "Présentez votre boutique, vos spécialités, garanties et modes de livraison..."
                  }
                />
              </Field>

              <div className="divider" />
              <h4 style={{ fontSize: "var(--text-sm)", fontWeight: 700, margin: 0 }}>
                {isAr ? "أرقام التواصل العامة" : "Contact & Messagerie"}
              </h4>

              <div className="form-grid">
                <Field
                  label={t("auth.phone")}
                  htmlFor="store-phone-input"
                  error={fields.phone}
                  required
                >
                  <Input
                    id="store-phone-input"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </Field>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, justifyContent: "center" }}>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={phonePublic}
                      onChange={(e) => setPhonePublic(e.target.checked)}
                    />
                    <span>{isAr ? "إظهار رقم الهاتف للمشترين" : "Afficher le téléphone publiquement"}</span>
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={whatsappPublic}
                      onChange={(e) => setWhatsappPublic(e.target.checked)}
                    />
                    <span>{isAr ? "تفعيل زر الطلب والتواصل عبر WhatsApp" : "Activer la commande par WhatsApp"}</span>
                  </label>
                </div>
              </div>
            </div>

            {/* RESPONSIVE ACTION BUTTONS - Prevents mobile viewport stretching & horizontal overflow */}
            <div className="store-form-actions">
              <Button type="submit" loading={busy} className="store-save-btn">
                <Icon name="check" size={18} />
                <span>{isAr ? "حفظ وتثبيت معلومات المتجر" : "Enregistrer la boutique"}</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowStoreSettings(false)}
                className="store-cancel-btn"
              >
                {isAr ? "إلغاء والعودة للمنتجات" : "Annuler et retourner"}
              </Button>
            </div>
          </form>
        ) : (
          /* ----------------- SUB-VIEW: STORE PRODUCTS SHELF & VITRINE MANAGER (DEFAULT) ----------------- */
          <div className="stack" style={{ gap: 16 }}>
            {/* Quick Store Summary Header Card */}
            <div
              className="panel stack"
              style={{
                gap: 16,
                padding: "clamp(1.25rem, 3vw, 1.75rem)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--line)",
                background: "linear-gradient(135deg, var(--surface) 0%, var(--surface-muted) 100%)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ position: "relative" }}>
                  <Avatar
                    name={storeName || displayName}
                    imageUrl={storeLogoUrl || user.avatarUrl}
                    size="xl"
                    withGreenRing={true}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                    <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 800, margin: 0, color: "var(--ink)" }}>
                      {storeName || displayName}
                    </h3>
                  </div>
                  {storeSlug ? (
                    <p className="small muted" style={{ margin: "0 0 6px 0" }}>
                      azar-neg.com/vendeurs/<strong>{storeSlug}</strong>
                    </p>
                  ) : null}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <span className="small muted" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Icon name="map-pin" size={14} />
                      {wilayaId ? (meta.data?.wilayas.find((w) => String(w.id) === String(wilayaId))?.[isAr ? "nameAr" : "nameFr"] || `Wilaya ${wilayaId}`) : "Algérie"}
                    </span>
                    <span className="small" style={{ fontWeight: 600, color: "var(--brand-700)" }}>
                      {storeListings.length} {isAr ? "منتج في المتجر" : "produits en rayon"}
                    </span>
                    {pinnedIds.length > 0 ? (
                      <span className="badge" style={{ background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a", fontWeight: 700, fontSize: "0.75rem" }}>
                        ⭐ {pinnedIds.length} {isAr ? "في الصدارة (Présenti)" : "en vitrine"}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Button to open Store Settings */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setShowStoreSettings(true)}
                    className="btn btn-outline"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      fontWeight: 600,
                      padding: "10px 16px",
                    }}
                  >
                    <Icon name="settings" size={16} />
                    <span>{isAr ? "تعديل بيانات المتجر" : "Modifier les infos du magasin"}</span>
                  </button>
                  {storeSlug ? (
                    <Link
                      to={`/vendeurs/${storeSlug}`}
                      className="btn btn-secondary"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 600,
                        padding: "10px 16px",
                      }}
                    >
                      <Icon name="share" size={15} />
                      <span>{isAr ? "زيارة المتجر" : "Voir ma vitrine"}</span>
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Shelf Manager Controls: Title, Sort Options, Add Product */}
            <div
              className="panel"
              style={{
                padding: "14px 18px",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--line)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: "1.2rem" }}>📦</span>
                <div>
                  <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: 0 }}>
                    {isAr ? "معروضات وكتالوج المتجر" : "Catalogue & Vitrine de produits"}
                  </h3>
                  <p className="small muted" style={{ margin: 0 }}>
                    {isAr
                      ? "رتّب منتجاتك وحدد السلع التي تظهر في الصدارة (Présenti) أمام الزبائن."
                      : "Organisez vos articles et mettez en avant vos meilleurs produits en vitrine."}
                  </p>
                </div>
              </div>

              <Link
                to="/vendre"
                className="btn btn-primary btn-sm"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}
              >
                <Icon name="plus" size={16} />
                <span>{isAr ? "إضافة منتج جديد" : "Ajouter un produit"}</span>
              </Link>
            </div>

            {/* Sort Selector Bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
                padding: "8px 12px",
                background: "var(--surface)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--line)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="small muted" style={{ fontWeight: 600 }}>
                  {isAr ? "الترتيب حسب:" : "Trier par :"}
                </span>
                <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setStoreSortBy("pinned")}
                    className={`btn btn-sm ${storeSortBy === "pinned" ? "btn-primary" : "btn-ghost"}`}
                    style={{ borderRadius: "var(--radius-pill)", height: 32, fontSize: "0.8rem", fontWeight: 600 }}
                  >
                    ⭐ {isAr ? "في الصدارة (Présenti)" : "En vitrine (Présenti)"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStoreSortBy("newest")}
                    className={`btn btn-sm ${storeSortBy === "newest" ? "btn-primary" : "btn-ghost"}`}
                    style={{ borderRadius: "var(--radius-pill)", height: 32, fontSize: "0.8rem", fontWeight: 600 }}
                  >
                    {isAr ? "الأحدث" : "Plus récents"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStoreSortBy("price_asc")}
                    className={`btn btn-sm ${storeSortBy === "price_asc" ? "btn-primary" : "btn-ghost"}`}
                    style={{ borderRadius: "var(--radius-pill)", height: 32, fontSize: "0.8rem", fontWeight: 600 }}
                  >
                    {isAr ? "الأقل سعراً" : "Prix croissant"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStoreSortBy("price_desc")}
                    className={`btn btn-sm ${storeSortBy === "price_desc" ? "btn-primary" : "btn-ghost"}`}
                    style={{ borderRadius: "var(--radius-pill)", height: 32, fontSize: "0.8rem", fontWeight: 600 }}
                  >
                    {isAr ? "الأعلى سعراً" : "Prix décroissant"}
                  </button>
                </div>
              </div>

              <span className="small muted">
                {sortedStoreListings.length} {isAr ? "معروضة" : "affichés"}
              </span>
            </div>

            {/* Products Shelf Listing */}
            {storeListingsLoading ? (
              <div style={{ display: "grid", placeItems: "center", padding: "40px 0" }}>
                <Spinner />
              </div>
            ) : sortedStoreListings.length === 0 ? (
              <div
                className="panel stack"
                style={{
                  alignItems: "center",
                  textAlign: "center",
                  padding: "48px 24px",
                  borderRadius: "var(--radius-lg)",
                  border: "1px dashed var(--line)",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: "rgba(16, 185, 129, 0.1)",
                    color: "var(--brand-700)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Icon name="store" size={32} />
                </div>
                <h4 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: 0 }}>
                  {isAr ? "لا توجد منتجات معروضة بعد" : "Aucun produit dans votre catalogue"}
                </h4>
                <p className="small muted" style={{ margin: 0, maxWidth: 440 }}>
                  {isAr
                    ? "ابدأ بنشر منتجاتك وسلعك لتظهر في واجهة متجرك الإلكتروني للزبائن في كامل ولايات الجزائر."
                    : "Publiez vos premiers articles pour alimenter la vitrine de votre boutique et recevoir des commandes."}
                </p>
                <Link to="/vendre" className="btn btn-primary" style={{ marginTop: 8 }}>
                  <Icon name="plus" size={17} />
                  <span>{isAr ? "نشر أول منتج في المتجر" : "Publier mon premier produit"}</span>
                </Link>
              </div>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {sortedStoreListings.map((item, index) => {
                  const isPinned = pinnedIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      className="panel"
                      style={{
                        padding: "12px 16px",
                        borderRadius: "var(--radius-md)",
                        border: isPinned ? "1.5px solid #f59e0b" : "1px solid var(--line)",
                        background: isPinned ? "linear-gradient(135deg, var(--surface) 0%, rgba(245, 158, 11, 0.04) 100%)" : "var(--surface)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 14,
                        flexWrap: "wrap",
                        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                      }}
                    >
                      {/* Thumbnail & Product Details */}
                      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 220, flex: 1 }}>
                        <div
                          style={{
                            width: 68,
                            height: 68,
                            borderRadius: "var(--radius-sm)",
                            overflow: "hidden",
                            background: "var(--surface-muted)",
                            border: "1px solid var(--line)",
                            flexShrink: 0,
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          {item.coverImage ? (
                            <img
                              src={item.coverImage}
                              alt={item.title}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              loading="lazy"
                            />
                          ) : (
                            <Icon name="image" size={24} style={{ color: "var(--ink-muted)" }} />
                          )}
                        </div>

                        <div className="stack" style={{ gap: 4, minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <Link
                              to={`/annonces/${item.id}`}
                              style={{
                                fontWeight: 700,
                                fontSize: "0.95rem",
                                color: "var(--ink)",
                                textDecoration: "none",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: "280px",
                              }}
                            >
                              {item.title}
                            </Link>
                            {isPinned ? (
                              <span
                                className="badge"
                                style={{
                                  background: "#fef3c7",
                                  color: "#b45309",
                                  border: "1px solid #fde68a",
                                  fontWeight: 700,
                                  fontSize: "0.72rem",
                                  padding: "2px 8px",
                                }}
                              >
                                ⭐ {isAr ? "في الصدارة (Présenti)" : "Présenti"}
                              </span>
                            ) : null}
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 800, color: "var(--brand-700)", fontSize: "0.95rem" }}>
                              {formatPrice(item.priceDa, lang)}
                            </span>
                            <StatusBadge status={item.status} />
                            <span className="small muted">
                              {isAr ? item.wilaya.nameAr : item.wilaya.nameFr}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions: Pin / Présenti Button, Reorder Up/Down, Edit, View */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {/* Pin / Présenti button */}
                        <button
                          type="button"
                          onClick={() => handleTogglePin(item.id)}
                          className="btn btn-sm"
                          style={{
                            background: isPinned ? "#fef3c7" : "transparent",
                            color: isPinned ? "#92400e" : "var(--ink)",
                            borderColor: isPinned ? "#fde68a" : "var(--line)",
                            fontWeight: 700,
                            fontSize: "0.8rem",
                            height: 32,
                            padding: "4px 12px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                          title={isAr ? "تثبيت المنتج في صدارة واجهة المتجر" : "Mettre en avant au début de la boutique"}
                        >
                          <span>⭐</span>
                          <span>{isPinned ? (isAr ? "في الصدارة" : "Présenti") : (isAr ? "تثبيت (Présenti)" : "Mettre en vitrine")}</span>
                        </button>

                        {/* Up & Down Arrows (only active when in pinned sort mode) */}
                        {storeSortBy === "pinned" ? (
                          <div style={{ display: "inline-flex", gap: 2 }}>
                            <button
                              type="button"
                              onClick={() => handleMoveStoreItem(index, "up")}
                              disabled={index === 0}
                              className="btn btn-sm btn-ghost"
                              style={{ height: 32, width: 32, padding: 0, justifyContent: "center" }}
                              title={isAr ? "تقديم للأعلى" : "Monter"}
                            >
                              <Icon name="chevron-down" size={16} style={{ transform: "rotate(180deg)" }} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveStoreItem(index, "down")}
                              disabled={index === sortedStoreListings.length - 1}
                              className="btn btn-sm btn-ghost"
                              style={{ height: 32, width: 32, padding: 0, justifyContent: "center" }}
                              title={isAr ? "تأخير للأسفل" : "Descendre"}
                            >
                              <Icon name="chevron-down" size={16} />
                            </button>
                          </div>
                        ) : null}

                        {/* Edit Listing */}
                        <Link
                          to={`/vendre?edit=${item.id}`}
                          className="btn btn-sm btn-ghost"
                          style={{ height: 32, width: 32, padding: 0, justifyContent: "center" }}
                          title={isAr ? "تعديل المنتج" : "Modifier"}
                        >
                          <Icon name="edit" size={15} />
                        </Link>

                        {/* View Listing */}
                        <Link
                          to={`/annonces/${item.id}`}
                          className="btn btn-sm btn-ghost"
                          style={{ height: 32, width: 32, padding: 0, justifyContent: "center" }}
                          title={isAr ? "معاينة المنتج" : "Voir"}
                        >
                          <Icon name="arrow-right" size={15} style={{ transform: isAr ? "rotate(180deg)" : "none" }} />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    ) : null}

      {/* ---------------------------------------------------------------- VIEW: MAIN ACCOUNT HUB */}
      {view === "hub" ? (
        <div className="stack" style={{ gap: "var(--space-4)" }}>
          {/* Profile Header Card */}
          <div
            className="panel"
            style={{
              padding: "clamp(1.25rem, 3.5vw, 2rem)",
              background: "linear-gradient(180deg, var(--surface) 0%, var(--surface-muted) 100%)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginBottom: 16 }}>
              {/* Profile Picture with Emerald Green Ring */}
              <div style={{ position: "relative" }}>
                <Avatar
                  name={user.displayName ?? user.email}
                  imageUrl={user.avatarUrl}
                  size="xl"
                  withGreenRing={true}
                />
              </div>

              {/* Name, Email, Role */}
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 700, margin: 0, color: "var(--ink)" }}>
                    {user.displayName || (isAr ? "حسابي الشخصي" : "Mon compte")}
                  </h1>
                  {renderRoleBadge()}
                </div>
                <p className="small muted" style={{ margin: "0 0 8px", wordBreak: "break-all" }}>
                  {user.email}
                </p>

                {/* Rating & Location Tag */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span
                    className="small"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      color: "#f59e0b",
                      fontWeight: 600,
                    }}
                  >
                    ★ {stats?.avgRating ?? 5}.0
                    <span className="muted" style={{ fontWeight: 400 }}>
                      ({stats?.reviewsCount ?? 0})
                    </span>
                  </span>
                  {user.storeSlug ? (
                    <span className="small muted" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Icon name="check" size={13} />
                      @{user.storeSlug}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Edit Profile & Photo Button */}
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => handleSetView("edit")}
              style={{
                width: "100%",
                justifyContent: "center",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                paddingBlock: "10px",
                fontWeight: 600,
                borderRadius: "var(--radius-md)",
              }}
            >
              <Icon name="user" size={16} />
              {isAr ? "تعديل معلوماتي وصورتي الشخصية" : "Modifier mes informations & ma photo"}
            </button>
          </div>

          {/* Action List / Menu Tiles */}
          <div className="panel" style={{ padding: "8px", borderRadius: "var(--radius-lg)" }}>
            <div className="stack" style={{ gap: 4 }}>
              {/* Mes Annonces */}
              <Link
                to="/compte/annonces"
                className="account-menu-item"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: "var(--radius-md)",
                  color: "var(--ink)",
                  textDecoration: "none",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "10px",
                      background: "rgba(37, 99, 235, 0.1)",
                      color: "#2563eb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="list" size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "var(--text-base)" }}>
                      {t("account.myListings")}
                    </div>
                    <div className="small muted">
                      {isAr ? "إدارة وتعديل الإعلانات المنشورة" : "Gérer et modifier mes annonces publiées"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {stats ? (
                    <span className="badge" style={{ fontWeight: 600 }}>
                      {stats.listingsCount}
                    </span>
                  ) : null}
                  <Icon name="arrow-right" size={16} style={{ color: "var(--ink-muted)", transform: isAr ? "rotate(180deg)" : "none" }} />
                </div>
              </Link>

              {/* Mes Favoris */}
              <Link
                to="/compte/favoris"
                className="account-menu-item"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: "var(--radius-md)",
                  color: "var(--ink)",
                  textDecoration: "none",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "10px",
                      background: "rgba(239, 68, 68, 0.1)",
                      color: "#ef4444",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="heart" size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "var(--text-base)" }}>
                      {t("account.favorites")}
                    </div>
                    <div className="small muted">
                      {isAr ? "الإعلانات المحفوظة في قائمتك" : "Articles sauvegardés"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {stats ? (
                    <span className="badge" style={{ fontWeight: 600 }}>
                      {stats.favoritesCount}
                    </span>
                  ) : null}
                  <Icon name="arrow-right" size={16} style={{ color: "var(--ink-muted)", transform: isAr ? "rotate(180deg)" : "none" }} />
                </div>
              </Link>

              {/* Mes Abonnés & Abonnements */}
              <button
                type="button"
                onClick={() => handleSetView("follows")}
                className="account-menu-item"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: "var(--radius-md)",
                  color: "var(--ink)",
                  background: "none",
                  border: 0,
                  cursor: "pointer",
                  textAlign: "start",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "10px",
                      background: "rgba(16, 185, 129, 0.1)",
                      color: "#10b981",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="user" size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "var(--text-base)" }}>
                      {isAr ? "المتابعون والاشتراكات" : "Mes abonnés & abonnements"}
                    </div>
                    <div className="small muted">
                      {isAr
                        ? `${stats?.followersCount ?? 0} متابع • ${stats?.followingCount ?? 0} اشتراك`
                        : `${stats?.followersCount ?? 0} abonnés • ${stats?.followingCount ?? 0} abonnements`}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Icon name="arrow-right" size={16} style={{ color: "var(--ink-muted)", transform: isAr ? "rotate(180deg)" : "none" }} />
                </div>
              </button>

              {/* Configurer / Gérer ma boutique (Spacious Store Editor) */}
              <button
                type="button"
                onClick={() => handleSetView("store")}
                className="account-menu-item"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: "var(--radius-md)",
                  color: "var(--ink)",
                  background: "rgba(16, 185, 129, 0.05)",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                  cursor: "pointer",
                  textAlign: "start",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "10px",
                      background: "rgba(16, 185, 129, 0.15)",
                      color: "var(--brand-700)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="store" size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "var(--text-base)", color: "var(--brand-800)" }}>
                      {isAr ? "تهيئة وتعديل متجري" : "Configurer & modifier ma boutique"}
                    </div>
                    <div className="small muted">
                      {isAr
                        ? "الشعار، الغلاف، العنوان، أوقات العمل، ونبذة المتجر"
                        : "Logo officiel, bannière, horaires, coordonnées et bio"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Icon name="arrow-right" size={16} style={{ color: "var(--brand-700)", transform: isAr ? "rotate(180deg)" : "none" }} />
                </div>
              </button>

              {/* Ma Boutique (if seller has store) */}
              {user.storeSlug ? (
                <Link
                  to={`/vendeurs/${user.storeSlug}`}
                  className="account-menu-item"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 16px",
                    borderRadius: "var(--radius-md)",
                    color: "var(--ink)",
                    textDecoration: "none",
                    transition: "background 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "10px",
                        background: "rgba(245, 158, 11, 0.1)",
                        color: "#f59e0b",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name="check" size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "var(--text-base)" }}>
                        {isAr ? "متجري العام" : "Ma boutique publique"}
                      </div>
                      <div className="small muted">
                        {isAr ? "عرض واجهة المتجر كما يراها المشترون" : "Voir ma vitrine commerçante en ligne"}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Icon name="arrow-right" size={16} style={{ color: "var(--ink-muted)", transform: isAr ? "rotate(180deg)" : "none" }} />
                  </div>
                </Link>
              ) : null}

              {/* Publier une annonce */}
              <Link
                to="/vendre"
                className="account-menu-item"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: "var(--radius-md)",
                  color: "var(--ink)",
                  textDecoration: "none",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "10px",
                      background: "rgba(139, 92, 246, 0.1)",
                      color: "#8b5cf6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="plus" size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "var(--text-base)" }}>
                      {t("nav.sell")}
                    </div>
                    <div className="small muted">
                      {isAr ? "نشر منتج، خدمة أو سلعة رقمية جديدة" : "Publier un produit, service ou contenu"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Icon name="arrow-right" size={16} style={{ color: "var(--ink-muted)", transform: isAr ? "rotate(180deg)" : "none" }} />
                </div>
              </Link>

              {/* Notifications */}
              <Link
                to="/compte/notifications"
                className="account-menu-item"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: "var(--radius-md)",
                  color: "var(--ink)",
                  textDecoration: "none",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "10px",
                      background: "rgba(6, 182, 212, 0.1)",
                      color: "#06b6d4",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="bell" size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "var(--text-base)" }}>
                      {t("nav.notifications")}
                    </div>
                    <div className="small muted">
                      {isAr ? "التنبيهات والمستجدات الخاصة بحسابك" : "Alertes et messages importants"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Icon name="arrow-right" size={16} style={{ color: "var(--ink-muted)", transform: isAr ? "rotate(180deg)" : "none" }} />
                </div>
              </Link>


              {/* Conditions d'utilisation */}
              <Link
                to="/conditions"
                className="account-menu-item"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: "var(--radius-md)",
                  color: "var(--ink)",
                  textDecoration: "none",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "10px",
                      background: "rgba(100, 116, 139, 0.1)",
                      color: "var(--ink-muted)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="file" size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "var(--text-base)" }}>
                      {isAr ? "شروط الاستخدام" : "Conditions d'utilisation"}
                    </div>
                    <div className="small muted">
                      {isAr ? "القواعد والضوابط القانونية" : "Règles et conditions d'usage"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Icon name="arrow-right" size={16} style={{ color: "var(--ink-muted)", transform: isAr ? "rotate(180deg)" : "none" }} />
                </div>
              </Link>

              {/* Politique de confidentialité */}
              <Link
                to="/confidentialite"
                className="account-menu-item"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: "var(--radius-md)",
                  color: "var(--ink)",
                  textDecoration: "none",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "10px",
                      background: "rgba(100, 116, 139, 0.1)",
                      color: "var(--ink-muted)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="shield" size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "var(--text-base)" }}>
                      {isAr ? "سياسة الخصوصية" : "Politique de confidentialité"}
                    </div>
                    <div className="small muted">
                      {isAr ? "حماية وتأمين بياناتك الشخصية" : "Protection de vos données"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Icon name="arrow-right" size={16} style={{ color: "var(--ink-muted)", transform: isAr ? "rotate(180deg)" : "none" }} />
                </div>
              </Link>
            </div>
          </div>

          {/* Preferences: Simple Language (no flags/fluff) & Dark Theme */}
          <PreferencesPanel lang={lang} setLang={setLang} isAr={isAr} theme={theme} setTheme={setTheme} />

          {/* Device Push Notifications Card */}
          <PushNotificationCard />

          {/* PWA App Installation Card (Android & iOS) */}
          <PwaInstallCard lang={lang} />

          {/* Logout Button (At the very bottom as requested) */}
          <div style={{ paddingTop: 14, paddingBottom: "calc(var(--tabbar-height, 68px) + 32px)" }}>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                width: "100%",
                padding: "14px 20px",
                borderRadius: "var(--radius-md)",
                background: "rgba(239, 68, 68, 0.08)",
                color: "var(--danger)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                fontWeight: 600,
                fontSize: "var(--text-base)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <Icon name="x" size={18} />
              {isAr ? "تسجيل الخروج من الحساب" : "Se déconnecter"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
