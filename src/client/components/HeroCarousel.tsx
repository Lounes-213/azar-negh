import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useI18n } from "../lib/i18n";

interface BannerSlide {
  id: string;
  titleFr: string;
  titleAr: string;
  subFr: string;
  subAr: string;
  btnFr: string;
  btnAr: string;
  link: string;
  image: string;
  gradient: string;
  isBot?: boolean;
}

const BANNERS: BannerSlide[] = [
  {
    id: "banner-commission",
    titleFr: "0% Commission",
    titleAr: "0% عمولة",
    subFr: "Vendez directement sans frais",
    subAr: "بيع مجاناً بدون أي وسيط",
    btnFr: "Commencer",
    btnAr: "ابدأ الآن",
    link: "/vendre",
    image: "/brand/banner_1.jpg",
    gradient: "linear-gradient(135deg, #094726 0%, #15803d 100%)",
  },
  {
    id: "banner-tech",
    titleFr: "Promos & Tech Neuf",
    titleAr: "عروض الهواتف والإلكترونيات",
    subFr: "Smartphones au meilleur prix",
    subAr: "أحدث الأجهزة بأفضل الأسعار",
    btnFr: "Découvrir",
    btnAr: "تصفح العروض",
    link: "/annonces?condition=NEW",
    image: "/brand/banner_2.jpg",
    gradient: "linear-gradient(135deg, #064e3b 0%, #0d9488 100%)",
  },
  {
    id: "banner-stores",
    titleFr: "Boutiques 69 Wilayas",
    titleAr: "متاجر في 69 ولاية",
    subFr: "Magasins certifiés partout en Algérie",
    subAr: "محلات موثوقة في جميع أنحاء الجزائر",
    btnFr: "Explorer",
    btnAr: "استكشف المتاجر",
    link: "/annonces?itemType=PRODUCT",
    image: "/brand/banner_3.jpg",
    gradient: "linear-gradient(135deg, #084c2e 0%, #16a34a 100%)",
  },
  {
    id: "banner-bot",
    titleFr: "Azar Bot - Assistant IA",
    titleAr: "آزار بوت - المساعد الذكي",
    subFr: "Recherche par texte, voix ou photo",
    subAr: "ابحث عن أي سلعة بالصوت أو الصورة",
    btnFr: "Discuter",
    btnAr: "تحدث مع البوت",
    link: "#azar-bot",
    isBot: true,
    image: "/brand/banner_4.jpg",
    gradient: "linear-gradient(135deg, #065f46 0%, #10b981 100%)",
  },
];

const AUTO_INTERVAL = 4000;

export function HeroCarousel() {
  const { lang } = useI18n();
  const [activeIdx, setActiveIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const mouseStartX = useRef<number | null>(null);

  const goToNext = () => {
    setActiveIdx((prev) => (prev + 1) % BANNERS.length);
  };

  const goToPrev = () => {
    setActiveIdx((prev) => (prev - 1 + BANNERS.length) % BANNERS.length);
  };

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      goToNext();
    }, AUTO_INTERVAL);
    return () => clearInterval(timer);
  }, [isPaused]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    touchStartX.current = e.touches[0]?.clientX ?? null;
    touchStartY.current = e.touches[0]?.clientY ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsPaused(false);
    if (touchStartX.current === null || touchStartY.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const endY = e.changedTouches[0]?.clientY ?? touchStartY.current;
    const deltaX = endX - touchStartX.current;
    const deltaY = endY - touchStartY.current;

    // Detect horizontal swipe if deltaX is sufficiently larger than vertical movement
    if (Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (lang === "ar") {
        if (deltaX < 0) goToPrev();
        else goToNext();
      } else {
        if (deltaX < 0) goToNext();
        else goToPrev();
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    mouseStartX.current = e.clientX;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (mouseStartX.current === null) return;
    const deltaX = e.clientX - mouseStartX.current;
    if (Math.abs(deltaX) > 40) {
      if (lang === "ar") {
        if (deltaX < 0) goToPrev();
        else goToNext();
      } else {
        if (deltaX < 0) goToNext();
        else goToPrev();
      }
    }
    mouseStartX.current = null;
  };

  const triggerBot = () => {
    window.dispatchEvent(new CustomEvent("azar:open-bot"));
  };

  return (
    <div
      className="hero-carousel-wrap"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => {
        setIsPaused(false);
        mouseStartX.current = null;
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      aria-roledescription="carousel"
      aria-label={lang === "ar" ? "إعلانات وعروض" : "Bannières et offres"}
    >
      {BANNERS.map((banner, index) => {
        const isActive = index === activeIdx;
        return (
          <div
            key={banner.id}
            className={`hero-banner-item ${isActive ? "is-active" : ""}`}
            style={{
              background: banner.gradient,
              cursor: banner.isBot ? "pointer" : "default",
            }}
            onClick={(e) => {
              if (banner.isBot) {
                // If clicked outside of the button, still trigger the bot
                const target = e.target as HTMLElement;
                if (!target.closest("button") && !target.closest("a")) {
                  triggerBot();
                }
              }
            }}
            aria-hidden={!isActive}
          >
            {/* Text side */}
            <div className="hero-banner-copy">
              <h3 className="hero-banner-title">
                {lang === "ar" ? banner.titleAr : banner.titleFr}
              </h3>
              <p className="hero-banner-sub">
                {lang === "ar" ? banner.subAr : banner.subFr}
              </p>
              <div className="hero-banner-actions">
                {banner.isBot ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerBot();
                    }}
                    className="hero-banner-btn"
                    tabIndex={isActive ? 0 : -1}
                  >
                    {lang === "ar" ? banner.btnAr : banner.btnFr}
                  </button>
                ) : (
                  <Link
                    to={banner.link}
                    className="hero-banner-btn"
                    tabIndex={isActive ? 0 : -1}
                  >
                    {lang === "ar" ? banner.btnAr : banner.btnFr}
                  </Link>
                )}
              </div>
            </div>

            {/* Clear visible image side */}
            <div className="hero-banner-media" aria-hidden="true">
              <img
                src={banner.image}
                alt=""
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
                className="hero-banner-img"
              />
            </div>
          </div>
        );
      })}

      {/* Thin animated white progress bar showing time left for current banner */}
      <div
        key={`prog-${activeIdx}`}
        className="hero-banner-progress"
        style={{
          animationPlayState: isPaused ? "paused" : "running",
        }}
        aria-hidden="true"
      />

      {/* Discrete bottom dots */}
      <div className="hero-banner-dots" role="tablist">
        {BANNERS.map((banner, idx) => (
          <button
            key={banner.id}
            type="button"
            role="tab"
            aria-selected={idx === activeIdx}
            aria-label={`Banner ${idx + 1}`}
            className={`hero-banner-dot ${idx === activeIdx ? "is-active" : ""}`}
            onClick={() => setActiveIdx(idx)}
          />
        ))}
      </div>
    </div>
  );
}
