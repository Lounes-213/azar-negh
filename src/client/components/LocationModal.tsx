import { useState, useEffect } from "react";
import { Link } from "react-router";
import { Dialog, Spinner } from "./ui";
import { Icon } from "./Icons";
import { useI18n } from "../lib/i18n";

// Coordinates of the 69 Algerian wilayas
const ALGERIA_WILAYAS: { id: number; fr: string; ar: string; lat: number; lng: number }[] = [
  { id: 1, fr: "Adrar", ar: "أدرار", lat: 27.87, lng: -0.29 },
  { id: 2, fr: "Chlef", ar: "الشلف", lat: 36.16, lng: 1.33 },
  { id: 3, fr: "Laghouat", ar: "الأغواط", lat: 33.80, lng: 2.86 },
  { id: 4, fr: "Oum El Bouaghi", ar: "أم البواقي", lat: 35.87, lng: 7.11 },
  { id: 5, fr: "Batna", ar: "باتنة", lat: 35.55, lng: 6.17 },
  { id: 6, fr: "Béjaïa", ar: "بجاية", lat: 36.75, lng: 5.08 },
  { id: 7, fr: "Biskra", ar: "بسكرة", lat: 34.85, lng: 5.73 },
  { id: 8, fr: "Béchar", ar: "بشار", lat: 31.62, lng: -2.22 },
  { id: 9, fr: "Blida", ar: "البليدة", lat: 36.47, lng: 2.83 },
  { id: 10, fr: "Bouira", ar: "البويرة", lat: 36.37, lng: 3.90 },
  { id: 11, fr: "Tamanrasset", ar: "تمنراست", lat: 22.78, lng: 5.52 },
  { id: 12, fr: "Tébessa", ar: "تبسة", lat: 35.40, lng: 8.12 },
  { id: 13, fr: "Tlemcen", ar: "تلمسان", lat: 34.88, lng: -1.31 },
  { id: 14, fr: "Tiaret", ar: "تيارت", lat: 35.37, lng: 1.32 },
  { id: 15, fr: "Tizi Ouzou", ar: "تيزي وزو", lat: 36.71, lng: 4.05 },
  { id: 16, fr: "Alger", ar: "الجزائر", lat: 36.75, lng: 3.06 },
  { id: 17, fr: "Djelfa", ar: "الجلفة", lat: 34.67, lng: 3.25 },
  { id: 18, fr: "Jijel", ar: "جيجل", lat: 36.82, lng: 5.76 },
  { id: 19, fr: "Sétif", ar: "سطيف", lat: 36.19, lng: 5.41 },
  { id: 20, fr: "Saïda", ar: "سعيدة", lat: 34.83, lng: 0.15 },
  { id: 21, fr: "Skikda", ar: "سكيكدة", lat: 36.87, lng: 6.90 },
  { id: 22, fr: "Sidi Bel Abbès", ar: "سيدي بلعباس", lat: 35.19, lng: -0.63 },
  { id: 23, fr: "Annaba", ar: "عنابة", lat: 36.90, lng: 7.76 },
  { id: 24, fr: "Guelma", ar: "قالمة", lat: 36.46, lng: 7.43 },
  { id: 25, fr: "Constantine", ar: "قسنطينة", lat: 36.36, lng: 6.61 },
  { id: 26, fr: "Médéa", ar: "المدية", lat: 36.26, lng: 2.75 },
  { id: 27, fr: "Mostaganem", ar: "مستغانم", lat: 35.93, lng: 0.09 },
  { id: 28, fr: "M'Sila", ar: "المسيلة", lat: 35.70, lng: 4.54 },
  { id: 29, fr: "Mascara", ar: "معسكر", lat: 35.39, lng: 0.14 },
  { id: 30, fr: "Ouargla", ar: "ورقلة", lat: 31.95, lng: 5.32 },
  { id: 31, fr: "Oran", ar: "وهران", lat: 35.69, lng: -0.63 },
  { id: 32, fr: "El Bayadh", ar: "البيض", lat: 33.68, lng: 1.02 },
  { id: 33, fr: "Illizi", ar: "إليزي", lat: 26.48, lng: 8.48 },
  { id: 34, fr: "Bordj Bou Arreridj", ar: "برج بوعريريج", lat: 36.07, lng: 4.76 },
  { id: 35, fr: "Boumerdès", ar: "بومرداس", lat: 36.76, lng: 3.47 },
  { id: 36, fr: "El Tarf", ar: "الطارف", lat: 36.76, lng: 8.31 },
  { id: 37, fr: "Tindouf", ar: "تندوف", lat: 27.67, lng: -8.13 },
  { id: 38, fr: "Tissemsilt", ar: "تيسمسيلت", lat: 35.60, lng: 1.81 },
  { id: 39, fr: "El Oued", ar: "الوادي", lat: 33.36, lng: 6.86 },
  { id: 40, fr: "Khenchela", ar: "خنشلة", lat: 35.43, lng: 7.14 },
  { id: 41, fr: "Souk Ahras", ar: "سوق أهراس", lat: 36.28, lng: 7.95 },
  { id: 42, fr: "Tipaza", ar: "تيبازة", lat: 36.59, lng: 2.44 },
  { id: 43, fr: "Mila", ar: "ميلة", lat: 36.45, lng: 6.26 },
  { id: 44, fr: "Aïn Defla", ar: "عين الدفلى", lat: 36.26, lng: 1.97 },
  { id: 45, fr: "Naâma", ar: "النعامة", lat: 33.26, lng: -0.31 },
  { id: 46, fr: "Aïn Témouchent", ar: "عين تموشنت", lat: 35.30, lng: -1.14 },
  { id: 47, fr: "Ghardaïa", ar: "غرداية", lat: 32.49, lng: 3.67 },
  { id: 48, fr: "Relizane", ar: "غليزان", lat: 35.74, lng: 0.55 },
  { id: 49, fr: "Timimoun", ar: "تيميمون", lat: 29.26, lng: 0.23 },
  { id: 50, fr: "Bordj Badji Mokhtar", ar: "برج باجي مختار", lat: 21.33, lng: 0.95 },
  { id: 51, fr: "Ouled Djellal", ar: "أولاد جلال", lat: 34.43, lng: 5.06 },
  { id: 52, fr: "Béni Abbès", ar: "بني عباس", lat: 30.13, lng: -2.17 },
  { id: 53, fr: "In Salah", ar: "عين صالح", lat: 27.19, lng: 2.46 },
  { id: 54, fr: "In Guezzam", ar: "عين قزام", lat: 19.57, lng: 5.77 },
  { id: 55, fr: "Touggourt", ar: "تقرت", lat: 33.10, lng: 6.06 },
  { id: 56, fr: "Djanet", ar: "جانت", lat: 24.55, lng: 9.48 },
  { id: 57, fr: "El M'Ghair", ar: "المغير", lat: 33.95, lng: 5.92 },
  { id: 58, fr: "El Meniaa", ar: "المنيعة", lat: 30.58, lng: 2.88 },
  { id: 59, fr: "Aflou", ar: "أفلو", lat: 34.11, lng: 2.10 },
  { id: 60, fr: "Barika", ar: "بريكة", lat: 35.39, lng: 5.36 },
  { id: 61, fr: "Ksar Chellala", ar: "قصر الشلالة", lat: 35.21, lng: 2.31 },
  { id: 62, fr: "Messaâd", ar: "مسعد", lat: 34.16, lng: 3.50 },
  { id: 63, fr: "Aïn Oussara", ar: "عين وسارة", lat: 35.45, lng: 2.91 },
  { id: 64, fr: "Bou Saâda", ar: "بوسعادة", lat: 35.28, lng: 4.18 },
  { id: 65, fr: "El Abiodh Sidi Cheikh", ar: "الأبيض سيدي الشيخ", lat: 32.89, lng: 0.54 },
  { id: 66, fr: "El Kantara", ar: "القنطرة", lat: 35.22, lng: 5.70 },
  { id: 67, fr: "Bir El Ater", ar: "بئر العاتر", lat: 34.75, lng: 8.05 },
  { id: 68, fr: "Ksar El Boukhari", ar: "قصر البخاري", lat: 35.88, lng: 2.75 },
  { id: 69, fr: "El Aricha", ar: "العريشة", lat: 34.22, lng: -1.41 },
];

function getClosestWilaya(lat: number, lng: number): { id: number; fr: string; ar: string; lat: number; lng: number } {
  let closest = ALGERIA_WILAYAS[15]!; // Default Alger
  let minDistance = Infinity;

  for (const w of ALGERIA_WILAYAS) {
    const dLat = ((w.lat - lat) * Math.PI) / 180;
    const dLng = ((w.lng - lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat * Math.PI) / 180) *
        Math.cos((w.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const d = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (d < minDistance) {
      minDistance = d;
      closest = w;
    }
  }

  return closest;
}

export function LocationModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedPlace, setDetectedPlace] = useState<{
    name: string;
    wilayaId: number;
  } | null>(() => {
    try {
      const saved = localStorage.getItem("azar:detected_location");
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return null;
  });

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setError(isAr ? "متصفحك لا يدعم تحديد الموقع الجغرافي." : "La géolocalisation n'est pas supportée.");
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const closest = getClosestWilaya(latitude, longitude);

        let placeName = isAr ? closest.ar : closest.fr;

        // Try reverse geocoding for more specific locality if possible
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 4000);
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=${lang}`,
            { signal: controller.signal }
          );
          clearTimeout(timeout);
          if (res.ok) {
            const data = await res.json();
            const city = data?.address?.city || data?.address?.town || data?.address?.village || data?.address?.state;
            if (city) {
              placeName = `${city}, ${isAr ? closest.ar : closest.fr}`;
            }
          }
        } catch {
          // fallback to closest wilaya name
        }

        const result = { name: placeName, wilayaId: closest.id };
        setDetectedPlace(result);
        try {
          localStorage.setItem("azar:detected_location", JSON.stringify(result));
          window.dispatchEvent(new CustomEvent("azar:location-updated", { detail: result }));
        } catch {
          // ignore
        }
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        if (err.code === 1) {
          setError(
            isAr
              ? "تم رفض الإذن بالوصول للموقع. يرجى تفعيله من إعدادات المتصفح."
              : "Permission de géolocalisation refusée. Veuillez l'activer dans votre navigateur."
          );
        } else {
          setError(
            isAr
              ? "تعذر تحديد الموقع بدقة حالياً. يرجى المحاولة مرة أخرى."
              : "Impossible de déterminer votre position. Veuillez réessayer."
          );
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  useEffect(() => {
    if (open && !detectedPlace && !loading && !error) {
      detectLocation();
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} title={isAr ? "موقعي" : "Ma localisation"}>
      <div style={{ textAlign: "center", padding: "16px 8px 10px" }}>
        {loading ? (
          <div style={{ padding: "30px 0" }}>
            <Spinner label={isAr ? "جاري تحديد موقعك بدقة..." : "Détection de votre position..."} />
          </div>
        ) : detectedPlace ? (
          <div>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>📍</div>
            <div
              style={{
                fontSize: "1.35rem",
                fontWeight: 700,
                color: "var(--ink)",
                lineHeight: 1.3,
                marginBottom: 6,
              }}
            >
              {detectedPlace.name}
            </div>
            <p className="small muted" style={{ margin: "0 0 24px" }}>
              {isAr ? "تم تحديد منطقتك بنجاح" : "Votre localisation actuelle"}
            </p>

            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                to={`/annonces?wilaya=${detectedPlace.wilayaId}`}
                className="btn btn-primary"
                onClick={onClose}
              >
                <Icon name="search" size={16} />
                <span>{isAr ? "تصفح إعلانات هذه الولاية" : "Voir les annonces ici"}</span>
              </Link>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={detectLocation}
              >
                <span>{isAr ? "تحديث" : "Actualiser"}</span>
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>📍</div>
            <p className="muted small" style={{ marginBottom: 20 }}>
              {isAr
                ? "انقر على الزر لتحديد موقعك الجغرافي واستكشاف العروض الأقرب إليك."
                : "Cliquez ci-dessous pour détecter votre position et explorer les offres proches."}
            </p>

            {error ? (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  color: "var(--danger)",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md)",
                  fontSize: "0.85rem",
                  marginBottom: 18,
                }}
              >
                {error}
              </div>
            ) : null}

            <button
              type="button"
              className="btn btn-primary"
              onClick={detectLocation}
              style={{ minWidth: 160 }}
            >
              <span>{isAr ? "تحديد موقعي الآن" : "Détecter ma position"}</span>
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
