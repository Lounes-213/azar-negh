import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { Alert, Button, Dialog, Field, Input, Select, Spinner } from "../components/ui";
import { Logo } from "../components/Logo";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { api, errorMessage, fieldErrors } from "../lib/api";
import type { MetaResponse } from "../../shared/types";
import { normalizeAlgerianPhone } from "../../shared/phone";

function safeNext(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export function Login() {
  const { user, loading, login, loginWithGoogle, register } = useAuth();
  const { t, lang } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<"login" | "register">(
    params.get("mode") === "register" ? "register" : "login",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  // Google modal state
  const [googleModal, setGoogleModal] = useState(false);
  const [googleEmail, setGoogleEmail] = useState("jokakram1@gmail.com");
  const [googleName, setGoogleName] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [wilayaId, setWilayaId] = useState("16");
  const [phonePublic, setPhonePublic] = useState(false);
  const [whatsappPublic, setWhatsappPublic] = useState(false);

  const meta = useAsync(() => api<MetaResponse>("/meta"), []);
  useDocumentTitle(mode === "login" ? t("auth.login") : t("auth.register"));

  if (loading) return <Spinner />;
  if (user) return <Navigate to={next} replace />;

  const submitGoogle = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!googleEmail.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await loginWithGoogle({
        email: googleEmail.trim(),
        name: googleName.trim() || undefined,
      });
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setGoogleModal(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFields({});
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        const normalized = normalizeAlgerianPhone(phone);
        if (!normalized) {
          setFields({ phone: "Numéro algérien invalide (ex. 0551 23 45 67)." });
          setBusy(false);
          return;
        }
        await register({
          email: email.trim(),
          password,
          displayName: displayName.trim(),
          phone: normalized,
          wilayaId: Number(wilayaId),
          phonePublic,
          whatsappPublic,
        });
      }
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrors(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container auth-wrap page-enter">
      <div className="auth-card">
        <div className="center mb-4">
          <span style={{ display: "flex", justifyContent: "center", margin: "0 auto 12px" }}>
            <Logo height={34} />
          </span>
          <h1>{mode === "login" ? t("auth.login") : t("auth.register")}</h1>
          <p className="small muted mt-1">
            {mode === "login"
              ? (lang === "ar" ? "سجّل الدخول لمتابعة إعلاناتك والتواصل مع المتاجر." : "Retrouvez vos annonces, boutiques favorites et notifications.")
              : (lang === "ar" ? "أنشئ حسابك وتجارتك في أقل من دقيقة." : "Créez votre compte vendeur en moins d'une minute.")}
          </p>
        </div>

        {error ? (
          <div className="mb-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}

        {/* Primary 1-Click Google Sign-In */}
        <div className="google-auth-section mb-4">
          <button
            type="button"
            className="btn btn-google"
            onClick={() => setGoogleModal(true)}
            disabled={busy}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.93 6.72-4.93z"/>
            </svg>
            <span>{lang === "ar" ? "متابعة سريعة باستخدام Google" : "Continuer avec Google"}</span>
          </button>
          <div className="auth-separator">
            <span>{lang === "ar" ? "أو باستخدام البريد" : "ou avec mot de passe"}</span>
          </div>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Authentification">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            {t("auth.login")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            {t("auth.register")}
          </button>
        </div>

        <form onSubmit={submit} className="stack">
          {mode === "register" ? (
            <Field label={t("auth.name")} htmlFor="name" error={fields.displayName} required>
              <Input
                id="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="name"
                minLength={2}
                maxLength={60}
                required
              />
            </Field>
          ) : null}

          <Field label={t("auth.email")} htmlFor="email" error={fields.email} required>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </Field>

          <Field
            label={t("auth.password")}
            htmlFor="password"
            error={fields.password}
            hint={mode === "register" ? t("auth.passwordHint") : undefined}
            required
          >
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "register" ? 10 : 1}
              required
            />
          </Field>

          {mode === "register" ? (
            <>
              <Field
                label={t("auth.phone")}
                htmlFor="phone"
                error={fields.phone}
                required
                hint="Ex. 0551 23 45 67"
              >
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                  required
                />
              </Field>
              <Field label={t("auth.wilaya")} htmlFor="wilaya" error={fields.wilayaId} required>
                <Select
                  id="wilaya"
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
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={phonePublic}
                  onChange={(event) => setPhonePublic(event.target.checked)}
                />
                <span>Afficher mon numéro de téléphone sur mes annonces</span>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={whatsappPublic}
                  onChange={(event) => setWhatsappPublic(event.target.checked)}
                />
                <span>Autoriser le contact via WhatsApp</span>
              </label>
            </>
          ) : null}

          <Button type="submit" block size="lg" loading={busy}>
            {mode === "login" ? t("auth.login") : t("auth.register")}
          </Button>
        </form>

        <p className="small muted center mt-4">{t("auth.sessionNote")}</p>
        <p className="small center mt-3">
          {mode === "login" ? (
            <>
              {t("auth.noAccount")}{" "}
              <button type="button" className="btn-link" onClick={() => setMode("register")}>
                {t("auth.register")}
              </button>
            </>
          ) : (
            <>
              {t("auth.haveAccount")}{" "}
              <button type="button" className="btn-link" onClick={() => setMode("login")}>
                {t("auth.login")}
              </button>
            </>
          )}
        </p>
        <p className="small center mt-3">
          <Link to="/annonces" className="muted">
            Continuer sans compte
          </Link>
        </p>
      </div>

      {/* Google Quick Sign-In Modal */}
      <Dialog
        open={googleModal}
        onClose={() => setGoogleModal(false)}
        title={lang === "ar" ? "تسجيل الدخول بـ Google" : "Connexion avec Google"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setGoogleModal(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => submitGoogle()} loading={busy}>
              {lang === "ar" ? "دخول فوري" : "Continuer"}
            </Button>
          </>
        }
      >
        <form onSubmit={submitGoogle} className="stack">
          <p className="small muted">
            {lang === "ar"
              ? "أدخل بريدك الإلكتروني لتسجيل الدخول الفوري دون الحاجة لكلمة مرور."
              : "Connexion directe avec votre compte Google sans mot de passe requis."}
          </p>
          <Field label={lang === "ar" ? "بريد Google" : "Compte Google"} htmlFor="google-email" required>
            <Input
              id="google-email"
              type="email"
              value={googleEmail}
              onChange={(e) => setGoogleEmail(e.target.value)}
              placeholder="votre.compte@gmail.com"
              required
              autoFocus
            />
          </Field>
          <Field label={lang === "ar" ? "الاسم المستعار (اختياري)" : "Nom / Pseudo (optionnel)"} htmlFor="google-name">
            <Input
              id="google-name"
              type="text"
              value={googleName}
              onChange={(e) => setGoogleName(e.target.value)}
              placeholder="Ex. Akram"
            />
          </Field>
        </form>
      </Dialog>
    </div>
  );
}
