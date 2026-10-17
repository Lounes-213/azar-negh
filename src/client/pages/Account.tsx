import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { MetaResponse, SessionUser } from "../../shared/types";
import { Alert, Avatar, Button, Field, Input, Select, Spinner, Textarea } from "../components/ui";
import { Icon } from "../components/Icons";
import { api, errorMessage, fieldErrors } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { formatDateTime, formatPhoneForInput } from "../lib/format";

interface SessionItem {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
  current: boolean;
}

export function Account() {
  const { user, updateUser } = useAuth();
  const { t, lang } = useI18n();
  useDocumentTitle(t("account.title"));
  const meta = useAsync(() => api<MetaResponse>("/meta"), []);
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [busy, setBusy] = useState(false);
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

  const loadSessions = async () => {
    try {
      const data = await api<{ sessions: SessionItem[] }>("/auth/sessions");
      setSessions(data.sessions);
    } catch {
      setSessions([]);
    }
  };

  useEffect(() => {
    void loadSessions();
  }, []);

  if (!user) return <Spinner />;

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
      setNotice({ tone: "success", text: lang === "ar" ? "تم تحديث الملف التجاري بنجاح." : "Profil et boutique mis à jour avec succès." });
    } catch (error) {
      setNotice({ tone: "danger", text: errorMessage(error) });
      setFields(fieldErrors(error));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await api(`/auth/sessions/${id}`, { method: "DELETE" });
      await loadSessions();
    } catch (error) {
      setNotice({ tone: "danger", text: errorMessage(error) });
    }
  };

  const revokeOthers = async () => {
    try {
      await api("/auth/sessions/revoke-others", { method: "POST" });
      await loadSessions();
      setNotice({ tone: "success", text: "Les autres sessions ont été déconnectées." });
    } catch (error) {
      setNotice({ tone: "danger", text: errorMessage(error) });
    }
  };

  return (
    <div className="container page">
      <div className="account-layout">
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
        </nav>

        <div className="stack">
          <div className="panel">
            <div className="row mb-4">
              <Avatar name={user.displayName ?? user.email} size="lg" />
              <div className="grow">
                <h1 style={{ fontSize: "var(--text-xl)" }}>{user.displayName ?? "Mon compte"}</h1>
                <p className="small muted">{user.email}</p>
                <span
                  className={`badge ${user.role === "ADMIN" ? "badge-danger" : user.role === "MODERATOR" ? "badge-warning" : "badge-brand"}`}
                >
                  {user.role}
                </span>
              </div>
              <Link to="/vendre" className="btn btn-sm">
                <Icon name="plus" size={15} /> {t("nav.sell")}
              </Link>
            </div>

            {notice ? (
              <div className="mb-4">
                <Alert tone={notice.tone}>{notice.text}</Alert>
              </div>
            ) : null}

            <form onSubmit={save} className="stack">
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
                  label={lang === "ar" ? "اسم المتجر أو الخدمة" : "Nom de la boutique / service"}
                  htmlFor="store-name"
                  error={fields.storeName}
                  hint={lang === "ar" ? "اسم علامتك أو المحل التجاري" : "Visible sur vos annonces et votre profil"}
                >
                  <Input
                    id="store-name"
                    value={storeName}
                    onChange={(event) => setStoreName(event.target.value)}
                    placeholder="Ex. Boutique Tech Alger"
                    maxLength={80}
                  />
                </Field>
                <Field
                  label={lang === "ar" ? "رابط المتجر (Slug)" : "Lien boutique (Slug)"}
                  htmlFor="store-slug"
                  error={fields.storeSlug}
                  hint={storeSlug ? `${window.location.origin}/vendeurs/${storeSlug}` : undefined}
                >
                  <Input
                    id="store-slug"
                    value={storeSlug}
                    onChange={(event) => setStoreSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="ex: tech-alger"
                    maxLength={60}
                  />
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
                        {lang === "ar" ? item.nameAr : item.nameFr}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label={lang === "ar" ? "البلدية والعنوان" : "Commune & Adresse"}
                  htmlFor="profile-commune"
                >
                  <Input
                    id="profile-commune"
                    value={commune}
                    onChange={(event) => setCommune(event.target.value)}
                    placeholder="Ex. Bab Ezzouar, Alger"
                    maxLength={80}
                  />
                </Field>
                <Field
                  label={lang === "ar" ? "أوقات العمل" : "Horaires d'ouverture"}
                  htmlFor="profile-hours"
                >
                  <Input
                    id="profile-hours"
                    value={openingHours}
                    onChange={(event) => setOpeningHours(event.target.value)}
                    placeholder="Ex. 09:00 - 18:00 (Sam - Jeu)"
                    maxLength={120}
                  />
                </Field>
                <Field
                  label="E-mail"
                  htmlFor="profile-email"
                  hint="L'adresse e-mail ne peut pas être modifiée."
                >
                  <Input id="profile-email" value={user.email} disabled />
                </Field>
                <Field
                  label={t("account.bio")}
                  htmlFor="profile-bio"
                  error={fields.bio}
                  hint="500 caractères maximum."
                  className="full"
                >
                  <Textarea
                    id="profile-bio"
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    maxLength={500}
                    placeholder="Présentez votre activité, vos horaires, votre zone…"
                  />
                </Field>
              </div>

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

              <div className="form-actions">
                <Button type="submit" loading={busy}>
                  {t("account.saveProfile")}
                </Button>
              </div>
            </form>
          </div>

          <div className="panel">
            <div className="row-between mb-4">
              <div>
                <h2 className="panel-title">{t("account.sessions")}</h2>
                <p className="small muted">
                  Appareils connectés à votre compte. Expiration après 14 jours d'activité.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={revokeOthers}>
                {t("account.logoutAll")}
              </Button>
            </div>
            {sessions === null ? (
              <p className="small muted">{t("common.loading")}</p>
            ) : (
              <div className="stack">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="row-between"
                    style={{ borderBottom: "1px solid var(--line)", paddingBottom: 10 }}
                  >
                    <div>
                      <div className="small strong">
                        {session.userAgent?.slice(0, 70) ?? "Appareil inconnu"}{" "}
                        {session.current ? (
                          <span className="badge badge-success">{t("account.currentSession")}</span>
                        ) : null}
                      </div>
                      <div className="small muted">
                        Dernière activité : {formatDateTime(session.lastSeenAt, lang)}
                      </div>
                    </div>
                    {!session.current ? (
                      <Button variant="ghost" size="sm" onClick={() => revoke(session.id)}>
                        {t("account.revoke")}
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
