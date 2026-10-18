import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n";

export function SplashScreen({ onFinish }: { onFinish?: () => void }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [fadingOut, setFadingOut] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Show splash for 750ms, then start 350ms smooth fadeout
    const timer = setTimeout(() => {
      setFadingOut(true);
      const hideTimer = setTimeout(() => {
        setVisible(false);
        if (onFinish) onFinish();
      }, 350);
      return () => clearTimeout(hideTimer);
    }, 750);

    return () => clearTimeout(timer);
  }, [onFinish]);

  if (!visible) return null;

  return (
    <div
      className={`app-splash-screen ${fadingOut ? "is-fading-out" : ""}`}
      aria-hidden="true"
    >
      <div className="app-splash-content">
        {/* Glowing Logo Container */}
        <div className="app-splash-logo-wrap">
          <div className="app-splash-glow" />
          <img
            src="/brand/icon.svg"
            alt="Azar Neɣ"
            className="app-splash-logo"
            width={84}
            height={84}
            onError={(e) => {
              // Fallback to PNG if SVG fails
              (e.currentTarget as HTMLImageElement).src = "/brand/icon-192.png";
            }}
          />
        </div>

        {/* Brand Name & Tagline */}
        <div className="app-splash-brand">
          <h1 className="app-splash-title">Aẓar <span className="brand-negh">Negh</span></h1>
          <p className="app-splash-subtitle">
            {isAr ? "سوق الجزائر الذكي" : "Le marché digital en Algérie"}
          </p>
        </div>

        {/* 3 Animated Entry Dots */}
        <div className="app-splash-dots" aria-label="Chargement">
          <span className="app-splash-dot" />
          <span className="app-splash-dot" />
          <span className="app-splash-dot" />
        </div>
      </div>
    </div>
  );
}
