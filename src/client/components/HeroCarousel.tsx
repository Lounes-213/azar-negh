import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Icon } from "./Icons";
import { useI18n } from "../lib/i18n";

interface CarouselSlide {
  id: string;
  tagFr: string;
  tagAr: string;
  titleFr: string;
  titleAr: string;
  descFr: string;
  descAr: string;
  btnFr: string;
  btnAr: string;
  link: string;
  image: string;
  gradient: string;
}

const SLIDES: CarouselSlide[] = [
  {
    id: "commission-free",
    tagFr: "Vente 100% Gratuite",
    tagAr: "بيع مجاني 100%",
    titleFr: "0% de commission sur vos ventes",
    titleAr: "0% عمولة على جميع مبيعاتك",
    descFr: "Vendez directement entre particuliers ou commerçants sans frais ni intermédiaire.",
    descAr: "انشر إعلاناتك مجاناً وبع مباشرة بدون وسيط ولا رسوم خفية في الجزائر.",
    btnFr: "Publier une annonce",
    btnAr: "انشر إعلانك الآن",
    link: "/vendre",
    image: "/brand/banner_1.jpg",
    gradient: "linear-gradient(135deg, #083c21 0%, #0d5f35 48%, #15803d 100%)",
  },
  {
    id: "deals-tech",
    tagFr: "Promos & Nouveautés",
    tagAr: "عروض حصرية وجديدة",
    titleFr: "Smartphones & Tech au meilleur prix",
    titleAr: "هواتف وحواسيب بأفضل الأسعار",
    descFr: "Profitez d'offres exceptionnelles sur les grandes marques certifiées neuves.",
    descAr: "اكتشف أحدث العروض على الهواتف الذكية والإلكترونيات بأسعار لا تقاوم.",
    btnFr: "Voir les nouveautés",
    btnAr: "تصفح العروض",
    link: "/annonces?condition=NEW",
    image: "/brand/banner_2.jpg",
    gradient: "linear-gradient(135deg, #053b2d 0%, #065f46 48%, #0d9488 100%)",
  },
  {
    id: "stores-dz",
    tagFr: "Commerces Vérifiés",
    tagAr: "محلات ومتاجر محلية",
    titleFr: "Boutiques locales dans 58 wilayas",
    titleAr: "متاجر موثوقة في 58 ولاية",
    descFr: "Trouvez des commerces de confiance et des articles disponibles près de chez vous.",
    descAr: "تسوق من أفضل المتاجر المحلية المعتمدة في ولايتك مع توفر فوري.",
    btnFr: "Explorer les boutiques",
    btnAr: "استكشف المتاجر",
    link: "/annonces?itemType=PRODUCT",
    image: "/brand/banner_3.jpg",
    gradient: "linear-gradient(135deg, #064e3b 0%, #047857 48%, #16a34a 100%)",
  },
  {
    id: "all-categories",
    tagFr: "Guide & Shopping",
    tagAr: "دليل التسوق الشامل",
    titleFr: "Tout ce que vous cherchez en un clic",
    titleAr: "اعثر على كل ما تحتاجه بضغطة زر",
    descFr: "Auto, immobilier, téléphonie, maison et artisanat réunis sur Azar Negh.",
    descAr: "سيارات، عقارات، هواتف، أثاث وحرف تقليدية بكل سهولة.",
    btnFr: "Toutes les catégories",
    btnAr: "تصفح الأقسام",
    link: "/categories",
    image: "/brand/banner_4.jpg",
    gradient: "linear-gradient(135deg, #0b4a2e 0%, #0f6c42 48%, #22c55e 100%)",
  },
];

const AUTO_INTERVAL = 4000; // 4 seconds auto scroll

export function HeroCarousel() {
  const { lang } = useI18n();
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const isRtl = lang === "ar";

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % SLIDES.length);
    }, AUTO_INTERVAL);
    return () => clearInterval(timer);
  }, [isPaused, current]);

  const goToNext = () => {
    setCurrent((prev) => (prev + 1) % SLIDES.length);
  };

  const goToPrev = () => {
    setCurrent((prev) => (prev - 1 + SLIDES.length) % SLIDES.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    const touch = e.touches[0];
    touchStartX.current = touch ? touch.clientX : null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsPaused(false);
    const touch = e.changedTouches[0];
    if (touchStartX.current === null || !touch) return;
    const diff = touch.clientX - touchStartX.current;
    if (Math.abs(diff) > 40) {
      if (diff < 0) {
        // Swiped towards left
        if (isRtl) goToPrev();
        else goToNext();
      } else {
        // Swiped towards right
        if (isRtl) goToNext();
        else goToPrev();
      }
    }
    touchStartX.current = null;
  };

  return (
    <div
      className="hero-carousel"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      aria-roledescription="carousel"
      aria-label={lang === "ar" ? "عروض وإعلانات آزار نغ" : "Bannières et offres Azar Negh"}
    >
      <div
        className="hero-carousel-track"
        style={{
          transform: isRtl
            ? `translateX(${current * 100}%)`
            : `translateX(-${current * 100}%)`,
        }}
      >
        {SLIDES.map((slide, index) => {
          const isActive = index === current;
          return (
            <div
              key={slide.id}
              className={`hero-carousel-slide ${isActive ? "is-active" : ""}`}
              style={{ background: slide.gradient }}
              aria-hidden={!isActive}
            >
              {/* Background ambient decorative shapes */}
              <div className="hero-slide-glow" aria-hidden="true" />

              <div className="hero-slide-inner">
                {/* Text Content */}
                <div className="hero-slide-text">
                  <span className="hero-slide-tag">
                    {lang === "ar" ? slide.tagAr : slide.tagFr}
                  </span>
                  <h3 className="hero-slide-title">
                    {lang === "ar" ? slide.titleAr : slide.titleFr}
                  </h3>
                  <p className="hero-slide-desc">
                    {lang === "ar" ? slide.descAr : slide.descFr}
                  </p>
                  <div className="hero-slide-actions">
                    <Link
                      to={slide.link}
                      className="hero-slide-btn"
                      tabIndex={isActive ? 0 : -1}
                    >
                      <span>{lang === "ar" ? slide.btnAr : slide.btnFr}</span>
                      <Icon
                        name={isRtl ? "chevron-left" : "arrow-right"}
                        size={15}
                      />
                    </Link>
                  </div>
                </div>

                {/* 3D Illustration Image */}
                <div className="hero-slide-media" aria-hidden="true">
                  <div className="hero-slide-img-wrap">
                    <img
                      src={slide.image}
                      alt=""
                      loading={index === 0 ? "eager" : "lazy"}
                      decoding="async"
                      className="hero-slide-img"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Manual Arrow Controls */}
      <button
        type="button"
        className="hero-carousel-arrow hero-carousel-arrow-prev"
        onClick={goToPrev}
        aria-label={lang === "ar" ? "السابق" : "Précédent"}
      >
        <Icon name={isRtl ? "chevron-right" : "chevron-left"} size={16} />
      </button>

      <button
        type="button"
        className="hero-carousel-arrow hero-carousel-arrow-next"
        onClick={goToNext}
        aria-label={lang === "ar" ? "التالي" : "Suivant"}
      >
        <Icon name={isRtl ? "chevron-left" : "chevron-right"} size={16} />
      </button>

      {/* Dot Indicators with 4-second animated progress */}
      <div className="hero-carousel-dots" role="tablist">
        {SLIDES.map((slide, idx) => {
          const isActive = idx === current;
          return (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`${lang === "ar" ? "إعلان" : "Bannière"} ${idx + 1}`}
              className={`hero-carousel-dot ${isActive ? "is-active" : ""}`}
              onClick={() => setCurrent(idx)}
            >
              {isActive && !isPaused ? (
                <span
                  key={`progress-${current}`}
                  className="hero-carousel-dot-fill"
                  style={{ animationDuration: `${AUTO_INTERVAL}ms` }}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
