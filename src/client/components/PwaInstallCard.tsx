import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import { Dialog } from "./ui";

interface PwaInstallCardProps {
  lang: "ar" | "fr";
}

export function PwaInstallCard({ lang }: PwaInstallCardProps) {
  const isAr = lang === "ar";
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [iosModalOpen, setIosModalOpen] = useState(false);
  const [installedSuccessfully, setInstalledSuccessfully] = useState(false);

  useEffect(() => {
    // Check if already in standalone display mode
    const standaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((window.navigator as unknown as { standalone?: boolean }).standalone) ||
      document.referrer.includes("android-app://");

    if (standaloneMode) {
      setIsStandalone(true);
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    setIsIos(isAppleDevice);

    // Listen for Android / Chromium PWA install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setInstalledSuccessfully(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // If already installed or launched from homescreen, do not display the card
  if (isStandalone || installedSuccessfully) {
    return null;
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setInstalledSuccessfully(true);
        }
      } catch {
        // Fallback
      } finally {
        setDeferredPrompt(null);
      }
    } else if (isIos) {
      setIosModalOpen(true);
    } else {
      // General instructions modal/prompt for other desktop or mobile browsers
      setIosModalOpen(true);
    }
  };

  return (
    <>
      <div
        className="pwa-install-banner"
        style={{
          marginTop: 20,
          background: "linear-gradient(135deg, rgba(22, 163, 74, 0.08) 0%, rgba(21, 128, 61, 0.16) 100%)",
          border: "1.5px solid rgba(22, 163, 74, 0.3)",
          borderRadius: "var(--radius-lg)",
          padding: "clamp(1.1rem, 3vw, 1.6rem)",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 6px 20px rgba(22, 163, 74, 0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {/* App Logo Icon with subtle shine */}
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: "16px",
              background: "linear-gradient(135deg, #22c55e, #15803d)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 6px 16px rgba(22, 163, 74, 0.35)",
              flexShrink: 0,
              padding: 6,
            }}
          >
            <img
              src="/brand/icon.svg"
              alt="Azar Neɣ App"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>

          {/* Texts & Badges */}
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <h3 style={{ fontSize: "var(--text-base)", fontWeight: 800, margin: 0, color: "var(--ink)" }}>
                {isAr ? "ثبّت تطبيق أزار نغ على هاتفك" : <>Installer l'application Azar <span className="brand-negh">Neɣ</span></>}
              </h3>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  background: "var(--brand-700)",
                  color: "#fff",
                  padding: "2px 8px",
                  borderRadius: 12,
                }}
              >
                Android & iOS
              </span>
            </div>

            <p style={{ margin: 0, fontSize: "0.86rem", color: "var(--ink-muted)", lineHeight: 1.45 }}>
              {isAr
                ? "تصفح أسرع، وصول فوري لمتجرك وإعلاناتك بضغطة زر واحدة من شاشة هاتفك الرئيسية وبدون استهلاك للذاكرة."
                : "Accès instantané à vos annonces et boutiques sans passer par le navigateur, léger et ultra-rapide."}
            </p>
          </div>

          {/* Action button */}
          <button
            type="button"
            onClick={handleInstallClick}
            className="btn btn-primary"
            style={{
              padding: "12px 20px",
              fontWeight: 700,
              borderRadius: "var(--radius-md)",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 4px 12px rgba(22, 163, 74, 0.3)",
              whiteSpace: "nowrap",
            }}
          >
            <Icon name="arrow-right" size={16} style={{ transform: isAr ? "rotate(90deg)" : "rotate(90deg)" }} />
            <span>{isAr ? "تثبيت التطبيق الآن" : "Installer l'application"}</span>
          </button>
        </div>
      </div>

      {/* iOS & Browser Installation Modal */}
      <Dialog
        open={iosModalOpen}
        onClose={() => setIosModalOpen(false)}
        title={isAr ? "كيفية تثبيت التطبيق على جهازك" : "Comment installer l'application"}
      >
        <div className="stack" style={{ gap: 18, padding: "10px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>
            <img src="/brand/icon.svg" alt="" style={{ width: 44, height: 44, borderRadius: 12 }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: "1rem" }}>Azar <span className="brand-negh">Neɣ</span></div>
              <div className="small muted">
                {isIos ? (isAr ? "لأجهزة iPhone و iPad (متصفح Safari)" : "Pour iPhone & iPad (Safari)") : (isAr ? "للهواتف الذكية" : "Sur votre smartphone")}
              </div>
            </div>
          </div>

          {isIos ? (
            <div className="stack" style={{ gap: 14 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "var(--brand-100)",
                    color: "var(--brand-800)",
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  1
                </div>
                <div style={{ fontSize: "0.92rem", lineHeight: 1.45 }}>
                  {isAr ? (
                    <>
                      اضغط على زر <strong>المشاركة</strong> (Share <span style={{ fontSize: "1.1rem" }}>📤</span>) في شريط أدوات Safari في أسفل الشاشة.
                    </>
                  ) : (
                    <>
                      Appuyez sur le bouton de <strong>partage</strong> (<span style={{ fontSize: "1.1rem" }}>📤</span>) dans la barre Safari en bas.
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "var(--brand-100)",
                    color: "var(--brand-800)",
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  2
                </div>
                <div style={{ fontSize: "0.92rem", lineHeight: 1.45 }}>
                  {isAr ? (
                    <>
                      مرر للأسفل في القائمة واضغط على <strong>« إضافة إلى الشاشة الرئيسية »</strong> (Sur l'écran d'accueil <span style={{ fontSize: "1.1rem" }}>➕</span>).
                    </>
                  ) : (
                    <>
                      Faites défiler le menu et sélectionnez <strong>« Sur l'écran d'accueil »</strong> (<span style={{ fontSize: "1.1rem" }}>➕</span>).
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "var(--brand-100)",
                    color: "var(--brand-800)",
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  3
                </div>
                <div style={{ fontSize: "0.92rem", lineHeight: 1.45 }}>
                  {isAr ? (
                    <>
                      اضغط على <strong>« إضافة »</strong> (Ajouter) في أعلى الزاوية. سيظهر أيقونة التطبيق مباشرة على شاشة هاتفك!
                    </>
                  ) : (
                    <>
                      Appuyez sur <strong>« Ajouter »</strong> en haut à droite. L'icône de l'application apparaîtra directement sur votre écran d'accueil !
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="stack" style={{ gap: 12, fontSize: "0.92rem", lineHeight: 1.5 }}>
              <p>
                {isAr
                  ? "لتثبيت التطبيق على جهازك:"
                  : "Pour installer l'application sur votre appareil :"}
              </p>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: "1.2rem" }}>⋮</span>
                <span>
                  {isAr
                    ? "اضغط على قائمة المتصفح (النقاط الثلاث في الأعلى أو الأسفل)."
                    : "Ouvrez le menu du navigateur (les 3 points en haut ou en bas)."}
                </span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: "1.2rem" }}>📲</span>
                <span>
                  {isAr
                    ? "اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»."
                    : "Sélectionnez « Installer l'application » ou « Ajouter à l'écran d'accueil »."}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "100%", marginTop: 8 }}
            onClick={() => setIosModalOpen(false)}
          >
            {isAr ? "فهمت" : "J'ai compris"}
          </button>
        </div>
      </Dialog>
    </>
  );
}
