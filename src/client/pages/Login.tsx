import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { Alert, Button, Dialog, Spinner } from "../components/ui";
import { Logo } from "../components/Logo";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { useDocumentTitle } from "../lib/hooks";
import { errorMessage } from "../lib/api";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (res: { credential?: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              logo_alignment?: "left" | "center";
              width?: number | string;
            },
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = "212127731962-a293tlj87fojunsjt9h2rlhd3285n1fg.apps.googleusercontent.com";

function safeNext(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export function Login() {
  const { user, loading, loginWithGoogle } = useAuth();
  const { lang } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get("next"));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gisLoaded, setGisLoaded] = useState(false);

  // Fallback modal for manual simulation or if Google script is ad-blocked
  const [fallbackModal, setFallbackModal] = useState(false);
  const [fallbackEmail, setFallbackEmail] = useState("jokakram1@gmail.com");
  const [fallbackName, setFallbackName] = useState("");

  const btnContainerRef = useRef<HTMLDivElement>(null);

  useDocumentTitle(lang === "ar" ? "تسجيل الدخول — Aẓar Neɣ" : "Connexion — Aẓar Neɣ");

  if (!loading && user) {
    const target = !next || next === "/connexion" ? "/compte" : next;
    return <Navigate to={target} replace />;
  }

  useEffect(() => {
    if (user) return;

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (typeof window !== "undefined" && window.google?.accounts?.id && btnContainerRef.current) {
        clearInterval(interval);
        try {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: async (res) => {
              if (!res.credential) return;
              setBusy(true);
              setError(null);
              try {
                await loginWithGoogle({ credential: res.credential });
                navigate(next, { replace: true });
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            },
            auto_select: false,
            cancel_on_tap_outside: true,
          });

          if (btnContainerRef.current) {
            btnContainerRef.current.innerHTML = "";
            window.google.accounts.id.renderButton(btnContainerRef.current, {
              type: "standard",
              theme: "outline",
              size: "large",
              text: "continue_with",
              shape: "pill",
              logo_alignment: "left",
              width: 320,
            });
          }

          setGisLoaded(true);
          window.google.accounts.id.prompt();
        } catch (e) {
          console.warn("GIS initialization error:", e);
        }
      } else if (attempts > 15) {
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [user, loginWithGoogle, navigate, next]);

  if (loading) return <Spinner />;
  if (user) return <Navigate to={next} replace />;

  const submitFallback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fallbackEmail.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await loginWithGoogle({
        email: fallbackEmail.trim(),
        name: fallbackName.trim() || undefined,
      });
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setFallbackModal(false);
    }
  };

  return (
    <div className="auth-mobile-container page-enter">
      <div className="auth-mobile-card">
        {/* Brand & Welcoming Header */}
        <div className="auth-brand-head">
          <Link to="/" className="auth-logo-link" aria-label="Azar Neɣ">
            <Logo height={44} />
          </Link>
          <h1 className="auth-title">
            {lang === "ar" ? "تسجيل الدخول السريع" : "Connexion à votre compte"}
          </h1>
          <p className="auth-subtitle">
            {lang === "ar"
              ? "سجّل الدخول بنقرة واحدة باستخدام حساب Google لإدارة متجرك وإعلاناتك."
              : "Connectez-vous en 1 clic avec votre compte Google pour accéder à votre Hanout et gérer vos annonces."}
          </p>
        </div>

        {error ? (
          <div className="mb-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}

        {/* Google 1-Click Action Zone */}
        <div className="auth-action-box">
          {/* Official Google Identity Services SDK Render Target */}
          <div
            id="google-signin-btn-container"
            ref={btnContainerRef}
            className="google-sdk-target"
          />

          {/* Fallback button if GIS script blocked or taking time */}
          {!gisLoaded ? (
            <button
              type="button"
              className="google-native-btn"
              onClick={() => setFallbackModal(true)}
              disabled={busy}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.93 6.72-4.93z"/>
              </svg>
              <span>{lang === "ar" ? "متابعة باستخدام Google" : "Continuer avec Google"}</span>
            </button>
          ) : null}

          {busy ? (
            <div className="auth-loading-state">
              <Spinner />
              <span>
                {lang === "ar" ? "جاري التحقق من الحساب..." : "Connexion sécurisée en cours..."}
              </span>
            </div>
          ) : null}
        </div>

        {/* Terms & Privacy Acceptance (Chourout El Khousoussiya wal Qouboul) */}
        <div className="auth-legal-notice">
          <p>
            {lang === "ar" ? (
              <>
                بالمتابعة، فإنك توافق على{" "}
                <Link to="/conditions" className="legal-link">
                  شروط الاستخدام
                </Link>{" "}
                و{" "}
                <Link to="/confidentialite" className="legal-link">
                  سياسة الخصوصية
                </Link>{" "}
                الخاصة بمنصة Aẓar <span className="brand-negh">Neɣ</span>.
              </>
            ) : (
              <>
                En continuant, vous acceptez les{" "}
                <Link to="/conditions" className="legal-link">
                  Conditions d'utilisation
                </Link>{" "}
                et la{" "}
                <Link to="/confidentialite" className="legal-link">
                  Politique de confidentialité
                </Link>{" "}
                d'Aẓar <span className="brand-negh">Neɣ</span>.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Fallback Direct Modal for Instant Google Login */}
      <Dialog
        open={fallbackModal}
        onClose={() => setFallbackModal(false)}
        title={lang === "ar" ? "تسجيل دخول بحساب Google" : "Connexion avec compte Google"}
      >
        <form onSubmit={submitFallback} className="stack">
          <p className="small muted">
            {lang === "ar"
              ? "أدخل عنوان Google الخاص بك للدخول وتفعيل حسابك التجاري :"
              : "Entrez votre adresse Google pour vous connecter et activer votre compte :"}
          </p>

          <label className="field">
            <span className="field-label">{lang === "ar" ? "بريد Google" : "Adresse Google"}</span>
            <input
              type="email"
              className="input"
              value={fallbackEmail}
              onChange={(e) => setFallbackEmail(e.target.value)}
              placeholder="votre.email@gmail.com"
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field-label">{lang === "ar" ? "الاسم الكامل (اختياري)" : "Nom complet (optionnel)"}</span>
            <input
              type="text"
              className="input"
              value={fallbackName}
              onChange={(e) => setFallbackName(e.target.value)}
              placeholder="Ex: Akram DZ"
            />
          </label>

          <div className="row end gap-2 mt-4">
            <Button type="button" variant="ghost" onClick={() => setFallbackModal(false)}>
              {lang === "ar" ? "إلغاء" : "Annuler"}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? <Spinner /> : lang === "ar" ? "دخول فوري" : "Continuer"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
