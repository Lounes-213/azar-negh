import { useEffect, useState } from "react";
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
    titleFr: "Boutiques 58 Wilayas",
    titleAr: "متاجر في 58 ولاية",
    subFr: "Magasins certifiés près de chez vous",
    subAr: "محلات موثوقة مع توفر فوري",
    btnFr: "Explorer",
    btnAr: "استكشف المتاجر",
    link: "/annonces?itemType=PRODUCT",
    image: "/brand/banner_3.jpg",
    gradient: "linear-gradient(135deg, #084c2e 0%, #16a34a 100%)",
  },
  {
    id: "banner-categories",
    titleFr: "Toutes les Catégories",
    titleAr: "تصفح جميع الأقسام",
    subFr: "Auto, téléphones, maison & mode",
    subAr: "سيارات، هواتف، أثاث وملابس",
    btnFr: "Voir tout",
    btnAr: "تصفح الأقسام",
    link: "/categories",
    image: "/brand/banner_4.jpg",
    gradient: "linear-gradient(135deg, #065f46 0%, #22c55e 100%)",
  },
];

const AUTO_INTERVAL = 4000;

export function HeroCarousel() {
  const { lang } = useI18n();
  const [activeIdx, setActiveIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % BANNERS.length);
    }, AUTO_INTERVAL);
    return () => clearInterval(timer);
  }, [isPaused]);

  return (
    <div
      className="hero-carousel-wrap"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
      aria-roledescription="carousel"
      aria-label={lang === "ar" ? "إعلانات وعروض" : "Bannières et offres"}
    >
      {BANNERS.map((banner, index) => {
        const isActive = index === activeIdx;
        return (
          <div
            key={banner.id}
            className={`hero-banner-item ${isActive ? "is-active" : ""}`}
            style={{ background: banner.gradient }}
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
                <Link
                  to={banner.link}
                  className="hero-banner-btn"
                  tabIndex={isActive ? 0 : -1}
                >
                  {lang === "ar" ? banner.btnAr : banner.btnFr}
                </Link>
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
