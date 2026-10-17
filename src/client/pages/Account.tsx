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

export function Account() {
  const { user, updateUser, logout } = useAuth();
  const { t, lang } = useI18n();
  const isAr = lang === "ar";
  useDocumentTitle(t("account.title"));
  const navigate = useNavigate();
  const meta = useAsync(() => api<MetaResponse>("/meta"), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          ? "تم تحديث صورتك الشخصية بنجاح وتنظيف مساحة التخزين السحابي."
          : "Photo de profil mise à jour avec succès (stockage R2 nettoyé).",
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
          ? "تم حذف الصورة الشخصية وتفريغ مساحة التخزين السحابي."
          : "Photo de profil supprimée et stockage R2 libéré.",
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
        text: isAr ? "تم تحديث الملف التجاري والمعلومات بنجاح." : "Profil et boutique mis à jour avec succès.",
      });
    } catch (error) {
      setNotice({ tone: "danger", text: errorMessage(error) });
      setFields(fieldErrors(error));
    } finally {
      setBusy(false);
    }
  };

  const roleBadge = () => {
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
          {isAr ? "متجر / بائع محلي" : "Boutique locale"}
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
    <div className="container page">
      <div className="account-layout">
        {/* Navigation tabs */}
        <nav className="account-nav" aria-label="Navigation du compte">
          <Link to="/compte" className="active">
            <Icon name="user" size={17} /> {t("account.profile")}
          </Link>
          <Link to="/compte/annonces">
            <Icon name="list" size={17} /> {t("account.myListings")}
          </Link>
          <Link to="/compte/favoris">
            <Icon name="heart" size={17} /> {t("account.favorites")}
          </Link>
          <Link to="/compte/notifications">
            <Icon name="bell" size={17} /> {t("nav.notifications")}
          </Link>
          {user.storeSlug ? (
            <Link to={`/vendeurs/${user.storeSlug}`}>
              <Icon name="arrow-right" size={17} /> {isAr ? "متجري" : "Ma boutique"}
            </Link>
          ) : null}
          {user.role === "ADMIN" || user.role === "MODERATOR" ? (
            <Link to="/admin">
              <Icon name="shield" size={17} /> {isAr ? "لوحة الإدارة" : "Administration"}
            </Link>
          ) : null}
        </nav>

        <div className="stack" style={{ gap: "var(--space-5)" }}>
          {/* Profile Header & Avatar Card */}
          <div className="panel" style={{ padding: "clamp(1.2rem, 3vw, 1.75rem)" }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 18,
                alignItems: "center",
                justifyContent: "space-between",
                paddingBottom: 18,
                borderBottom: "1px solid var(--line)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ position: "relative" }}>
                  <Avatar name={user.displayName ?? user.email} imageUrl={user.avatarUrl} size="xl" />
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

                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                    <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 700, margin: 0 }}>
                      {user.displayName || (isAr ? "حسابي الشخصي" : "Mon compte")}
                    </h1>
                    {roleBadge()}
                  </div>
                  <p className="small muted" style={{ margin: 0, wordBreak: "break-all" }}>
                    {user.email}
                  </p>
                </div>
              </div>

              {/* Avatar management actions */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: "none" }}
                  onChange={handleAvatarFile}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={uploadingAvatar}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Icon name="camera" size={14} />
                  {user.avatarUrl ? (isAr ? "تغيير الصورة" : "Modifier photo") : (isAr ? "إضافة صورة" : "Ajouter photo")}
                </Button>
                {user.avatarUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    loading={uploadingAvatar}
                    onClick={handleRemoveAvatar}
                  >
                    <Icon name="trash" size={14} />
                    {isAr ? "حذف" : "Supprimer"}
                  </Button>
                ) : null}
                <Link to="/vendre" className="btn btn-sm">
                  <Icon name="plus" size={14} /> {t("nav.sell")}
                </Link>
              </div>
            </div>

            {/* Quick role / store direct access bar */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "center",
                paddingTop: 14,
              }}
            >
              {user.storeSlug ? (
                <Link to={`/vendeurs/${user.storeSlug}`} className="btn btn-sm btn-outline">
                  <Icon name="arrow-right" size={14} /> {isAr ? "زيارة متجري العام" : "Voir ma vitrine boutique"}
                </Link>
              ) : null}
              {user.role === "ADMIN" ? (
                <Link to="/admin" className="btn btn-sm btn-outline">
                  <Icon name="shield" size={14} /> {isAr ? "إدارة المنصة" : "Espace Admin"}
                </Link>
              ) : null}
              <Link to="/compte/annonces" className="btn btn-sm btn-secondary">
                <Icon name="list" size={14} /> {t("account.myListings")}
              </Link>
              <Link to="/compte/favoris" className="btn btn-sm btn-secondary">
                <Icon name="heart" size={14} /> {t("account.favorites")}
              </Link>
              <div style={{ marginInlineStart: "auto" }}>
                <Button variant="ghost" size="sm" onClick={handleLogout} style={{ color: "var(--danger)" }}>
                  <Icon name="x" size={14} /> {isAr ? "تسجيل الخروج" : "Déconnexion"}
                </Button>
              </div>
            </div>
          </div>

          {/* Edit Profile & Store Panel */}
          <div className="panel" style={{ padding: "clamp(1.2rem, 3vw, 1.75rem)" }}>
            <h2 className="panel-title" style={{ marginBottom: "var(--space-4)" }}>
              {isAr ? "بيانات الحساب والمتجر المحلي" : "Coordonnées du compte & Boutique locale"}
            </h2>

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
                  hint={isAr ? "البريد الإلكتروني مرتبط بحساب Google ولا يمكن تغييره." : "Associé à votre compte Google (non modifiable)."}
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
                    placeholder={isAr ? "مثال: باب الزوار، الجزائر" : "Ex. Bab Ezzouar"}
                    maxLength={80}
                  />
                </Field>

                <Field
                  label={isAr ? "عنوان المحل أو النشاط" : "Adresse physique exacte"}
                  htmlFor="profile-address"
                >
                  <Input
                    id="profile-address"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder={isAr ? "مثال: حي النور، شارع 1" : "Ex. Boulevard du 1er Novembre"}
                    maxLength={120}
                  />
                </Field>

                <Field
                  label={isAr ? "اسم المتجر أو الخدمة" : "Nom commercial / Boutique"}
                  htmlFor="store-name"
                  error={fields.storeName}
                  hint={isAr ? "اسم علامتك أو المحل التجاري ليظهر للمشترين" : "Nom public de votre commerce ou atelier"}
                >
                  <Input
                    id="store-name"
                    value={storeName}
                    onChange={(event) => setStoreName(event.target.value)}
                    placeholder={isAr ? "مثال: متجر الهواتف الذكية" : "Ex. Tech Shop Bab Ezzouar"}
                    maxLength={80}
                  />
                </Field>

                <Field
                  label={isAr ? "رابط المتجر المخصص (Slug)" : "Lien de la boutique (Slug)"}
                  htmlFor="store-slug"
                  error={fields.storeSlug}
                  hint={storeSlug ? `${window.location.origin}/vendeurs/${storeSlug}` : (isAr ? "رابط فريد لصفحة متجرك" : "Lien personnalisé pour votre vitrine")}
                >
                  <Input
                    id="store-slug"
                    value={storeSlug}
                    onChange={(event) => setStoreSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="ex: tech-shop"
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
                    placeholder={isAr ? "عرّف بنشاطك التجاري، السلع المتوفرة، والخدمات المحلية المقدمة…" : "Présentez vos produits, services et spécificités de votre activité locale…"}
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
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
