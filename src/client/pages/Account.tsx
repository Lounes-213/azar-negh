import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { MetaResponse, SessionUser } from "../../shared/types";
import { Alert, Avatar, Button, Field, Input, Select, Spinner, Textarea } from "../components/ui";
import { Icon } from "../components/Icons";
import { api, errorMessage, fieldErrors } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { formatPhoneForInput } from "../lib/format";

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

export function Account() {
  const { user, updateUser, logout } = useAuth();
  const { t, lang } = useI18n();
  const isAr = lang === "ar";
  useDocumentTitle(isAr ? "حسابي الشخصي — أزار نغ" : "Mon compte — Azar Neɣ");
  const navigate = useNavigate();
  const meta = useAsync(() => api<MetaResponse>("/meta"), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sub-views: "hub" (main menu), "edit" (edit profile & avatar), "follows" (followers & following)
  const [view, setView] = useState<"hub" | "edit" | "follows">("hub");
  const [followsTab, setFollowsTab] = useState<"followers" | "following">("followers");

  const [stats, setStats] = useState<AccountStats | null>(null);
  const [followsData, setFollowsData] = useState<{ followers: FollowUser[]; following: FollowUser[] } | null>(null);

  const [busy, setBusy] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [storeName, setStoreName] = useState(user?.storeName ?? "");
  const [storeSlug, setStoreSlug] = useState(user?.storeSlug ?? "");
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

  if (!user) return <Spinner />;

  const handleAvatarFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setNotice({
        tone: "danger",
        text: isAr ? "يرجى اختيار ملف صورة صالح (JPG أو PNG أو WebP)." : "Veuillez choisir un format d'image valide (JPG, PNG ou WebP).",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setNotice({
        tone: "danger",
        text: isAr ? "حجم الصورة يجب ألا يتجاوز 5 ميغابايت." : "L'image ne doit pas dépasser 5 Mo.",
      });
      return;
    }

    setUploadingAvatar(true);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api<{ avatarUrl: string }>("/account/avatar", {
        method: "POST",
        body: formData,
      });

      updateUser({ ...user, avatarUrl: res.avatarUrl });
      setNotice({
        tone: "success",
        text: isAr
          ? "تم تحديث صورتك الشخصية بنجاح."
          : "Photo de profil mise à jour avec succès.",
      });
    } catch (err) {
      setNotice({ tone: "danger", text: errorMessage(err) });
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true);
    setNotice(null);
    try {
      await api<{ avatarUrl: null }>("/account/avatar", { method: "DELETE" });
      updateUser({ ...user, avatarUrl: null });
      setNotice({
        tone: "success",
        text: isAr
          ? "تم حذف الصورة الشخصية بنجاح."
          : "Photo de profil supprimée.",
      });
    } catch (err) {
      setNotice({ tone: "danger", text: errorMessage(err) });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/connexion");
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
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
          phone,
          phonePublic,
          whatsappPublic,
          wilayaId: Number(wilayaId),
          bio: bio.trim() || null,
        },
      });
      updateUser(data.user);
      setNotice({
        tone: "success",
        text: isAr ? "تم حفظ التعديلات بنجاح." : "Modifications enregistrées avec succès.",
      });
    } catch (error) {
      setNotice({ tone: "danger", text: errorMessage(error) });
      setFields(fieldErrors(error));
    } finally {
      setBusy(false);
    }
  };

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
              onClick={() => {
                setNotice(null);
                setView("hub");
              }}
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

            {notice ? (
              <div className="mb-4">
                <Alert tone={notice.tone}>{notice.text}</Alert>
              </div>
            ) : null}

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
                  <Select
                    id="profile-wilaya"
                    value={wilayaId}
                    onChange={(event) => setWilayaId(event.target.value)}
                  >
                    {meta.data?.wilayas.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.id.toString().padStart(2, "0")} —{" "}
                        {isAr ? item.nameAr : item.nameFr}
                      </option>
                    ))}
                  </Select>
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

              <div className="form-actions" style={{ marginTop: "var(--space-2)" }}>
                <Button type="submit" loading={busy}>
                  {t("account.saveProfile")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setView("hub")}
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
              onClick={() => setView("hub")}
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
              onClick={() => {
                setNotice(null);
                setView("edit");
              }}
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
                onClick={() => setView("follows")}
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

              {/* Espace Admin (if applicable) */}
              {user.role === "ADMIN" || user.role === "MODERATOR" ? (
                <Link
                  to="/admin"
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
                        background: "rgba(220, 38, 38, 0.1)",
                        color: "var(--danger)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name="shield" size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "var(--text-base)" }}>
                        {isAr ? "لوحة الإدارة والإشراف" : "Administration & Modération"}
                      </div>
                      <div className="small muted">
                        {isAr ? "مراقبة الإعلانات والتقارير" : "Supervision de la plateforme"}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Icon name="arrow-right" size={16} style={{ color: "var(--ink-muted)", transform: isAr ? "rotate(180deg)" : "none" }} />
                  </div>
                </Link>
              ) : null}

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

          {/* Logout Button (At the very bottom as requested) */}
          <div style={{ paddingTop: 8, paddingBottom: 24 }}>
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
