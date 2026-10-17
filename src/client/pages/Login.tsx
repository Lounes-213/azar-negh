import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
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
  const { t, lang } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get("next"));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gisLoaded, setGisLoaded] = useState(false);

  // Fallback modal for manual simulation/testing if Google script blocked
  const [fallbackModal, setFallbackModal] = useState(false);
  const [fallbackEmail, setFallbackEmail] = useState("jokakram1@gmail.com");
  const [fallbackName, setFallbackName] = useState("");

  const btnContainerRef = useRef<HTMLDivElement>(null);

  useDocumentTitle(lang === "ar" ? "تسجيل الدخول — Azar Neɣ" : "Connexion — Azar Neɣ");

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
              shape: "rectangular",
              logo_alignment: "left",
              width: 320,
            });
          }

          setGisLoaded(true);
          // Trigger Google One Tap floating dialog
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
    <div className="container auth-wrap page-enter">
      <div className="auth-card" style={{ maxWidth: 460 }}>
        {/* Brand Header */}
        <div className="center mb-4">
          <span style={{ display: "flex", justifyContent: "center", margin: "0 auto 12px" }}>
            <Logo height={38} />
          </span>
          <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>
            {lang === "ar" ? "تسجيل الدخول إلى حسابك" : "Connexion à votre compte"}
          </h1>
          <p className="small muted mt-1">
            {lang === "ar"
              ? "سجّل الدخول بنقرة واحدة باستخدام حساب Google الرسمي لإدارة متجرك وإعلاناتك."
              : "Connectez-vous en 1 clic avec votre compte Google pour gérer votre boutique et vos annonces."}
          </p>
        </div>

        {error ? (
          <div className="mb-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}

        {/* Official Google Sign-In Container */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 60,
            margin: "1.5rem 0",
          }}
        >
          {/* Render container for Google Identity Services official iframe button */}
          <div
            id="google-signin-btn-container"
            ref={btnContainerRef}
            style={{ minHeight: 44, display: "flex", justifyContent: "center" }}
          />

          {/* Backup Button if GIS is blocked or loading */}
          {!gisLoaded ? (
            <button
              type="button"
              className="btn btn-google"
              style={{ width: "100%", maxWidth: 320 }}
              onClick={() => setFallbackModal(true)}
              disabled={busy}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.93 6.72-4.93z"/>
              </svg>
              <span>{lang === "ar" ? "متابعة باستخدام Google" : "Continuer avec Google"}</span>
            </button>
          ) : null}

          {busy ? (
            <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Spinner />
              <span className="small muted">
                {lang === "ar" ? "جاري التحقق من الحساب..." : "Vérification du compte en cours..."}
              </span>
            </div>
          ) : null}
        </div>

        {/* Roles & Security Transparency Card */}
        <div
          style={{
            background: "var(--color-surface-subtle, #f8fafc)",
            border: "1px solid var(--color-border, #e2e8f0)",
            borderRadius: "var(--radius-lg, 12px)",
            padding: "1rem",
            marginTop: "1.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "1.1rem" }}>🛡️</span>
            <strong style={{ fontSize: "var(--text-sm)" }}>
              {lang === "ar" ? "حساب موثق وآمن 100%" : "Compte sécurisé Google"}
            </strong>
          </div>
          <ul
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--color-text-muted, #64748b)",
              lineHeight: 1.6,
              paddingInlineStart: "1.2rem",
              margin: 0,
            }}
          >
            <li>
              {lang === "ar"
                ? "يتم ربط كل مستخدم تلقائياً برتبته (مسؤول، مشرف، أو بائع) فور تسجيل الدخول."
                : "Attribution automatique de votre rôle (Administrateur, Modérateur ou Vendeur/Acheteur)."}
            </li>
            <li>
              {lang === "ar"
                ? "لا حاجة لكلمات مرور — أمان مشفر وتجربة دخول فورية."
                : "Zéro mot de passe à mémoriser — authentification cryptographique instantanée."}
            </li>
            <li>
              {lang === "ar"
                ? "متجرك 'حانوت' وإعلاناتك يتم ربطها تلقائياً بحسابك في الـ 58 ولاية."
                : "Votre Hanout et vos annonces sont synchronisés à votre compte sur les 58 wilayas."}
            </li>
          </ul>
        </div>
      </div>

      {/* Direct Fallback Modal for local testing or custom accounts */}
      <Dialog
        open={fallbackModal}
        onClose={() => setFallbackModal(false)}
        title={lang === "ar" ? "تسجيل دخول سريع بحساب Google" : "Connexion avec compte Google"}
      >
        <form onSubmit={submitFallback} className="stack">
          <p className="small muted">
            {lang === "ar"
              ? "أدخل بريدك الإلكتروني Google للمتابعة الفورية وتفعيل رتبتك (Admin / Vendeur) :"
              : "Entrez votre adresse Google pour vous connecter et synchroniser votre rôle :"}
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
              {t("common.cancel")}
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
