import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Avatar, Dialog, Spinner } from "./ui";
import { Icon } from "./Icons";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";

export interface NearbyStore {
  id: string;
  displayName: string;
  storeName: string | null;
  storeSlug: string | null;
  logoUrl: string | null;
  commune: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  bannerUrl: string | null;
  wilaya: {
    id: number;
    nameFr: string;
    nameAr: string;
  };
  listingsCount: number;
  distanceKm: number | null;
}

interface NearbyStoresModalProps {
  open: boolean;
  onClose: () => void;
}

export function NearbyStoresModal({ open, onClose }: NearbyStoresModalProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = sessionStorage.getItem("azar.user_coords");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [locError, setLocError] = useState<string | null>(null);
  const [stores, setStores] = useState<NearbyStore[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);

  // Request GPS position
  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocError(isAr ? "متصفحك لا يدعم تحديد الموقع الجغرافي." : "Géolocalisation non supportée par votre navigateur.");
      return;
    }

    setLocating(true);
    setLocError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextCoords = {
          lat: Math.round(pos.coords.latitude * 10000) / 10000,
          lng: Math.round(pos.coords.longitude * 10000) / 10000,
        };
        setCoords(nextCoords);
        try {
          sessionStorage.setItem("azar.user_coords", JSON.stringify(nextCoords));
        } catch {}
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        if (err.code === 1) {
          setLocError(isAr ? "يرجى السماح بالوصول إلى الموقع في متصفحك أو هاتفك." : "Veuillez autoriser l'accès à votre position.");
        } else {
          setLocError(isAr ? "تعذر تحديد الموقع بدقة، يرجى إعادة المحاولة." : "Impossible d'obtenir la position.");
        }
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  // Fetch nearby registered stores
  useEffect(() => {
    if (!open) return;

    setLoadingStores(true);
    const query = coords ? `?lat=${coords.lat}&lng=${coords.lng}` : "";

    api<{ stores: NearbyStore[] }>(`/sellers${query}`)
      .then((res) => setStores(res.stores || []))
      .catch(() => setStores([]))
      .finally(() => setLoadingStores(false));
  }, [open, coords]);

  // Automatically trigger location prompt if opened and no coords yet
  useEffect(() => {
    if (open && !coords && !locating && !locError) {
      requestLocation();
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} title={isAr ? "الموقع والمحلات القريبة" : "Position & Magasins proches"}>
      <div className="stack" style={{ gap: 16 }}>
        {/* Header explanation */}
        <p className="small muted" style={{ margin: 0 }}>
          {isAr
            ? "اكتشف موقعك الجغرافي والمحلات والمتاجر المسجلة في منصة Aẓar Neɣ القريبة منك."
            : "Découvrez votre emplacement et les boutiques enregistrées à proximité sur Aẓar Neɣ."}
        </p>

        {/* Location Status / Request Button */}
        {coords ? (
          <div
            style={{
              padding: "10px 14px",
              background: "rgba(16, 185, 129, 0.1)",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "1.2rem" }}>📍</span>
              <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--brand-800)" }}>
                {isAr ? "تم تحديد موقعك بنجاح" : "Position GPS détectée"}
                <small className="muted" style={{ display: "block", fontWeight: 400 }}>
                  {coords.lat.toFixed(4)}°, {coords.lng.toFixed(4)}°
                </small>
              </span>
            </div>

            <button
              type="button"
              onClick={requestLocation}
              disabled={locating}
              className="btn btn-sm btn-ghost"
              style={{ fontSize: "0.8rem", color: "var(--brand-700)", fontWeight: 600 }}
            >
              {locating ? <Spinner /> : isAr ? "تحديث الموقع 🔄" : "Actualiser 🔄"}
            </button>
          </div>
        ) : (
          <div
            style={{
              padding: "14px",
              background: "var(--surface-muted)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--line)",
              textAlign: "center",
            }}
          >
            {locError ? (
              <p className="small" style={{ color: "var(--danger)", margin: "0 0 10px 0", fontWeight: 600 }}>
                {locError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={requestLocation}
              disabled={locating}
              className="btn btn-primary btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}
            >
              {locating ? <Spinner /> : <Icon name="map-pin" size={16} />}
              <span>{isAr ? "تفعيل وتحديد موقعي الجغرافي" : "Activer ma position GPS"}</span>
            </button>
          </div>
        )}

        {/* Google Maps Tag / Iframe Embed */}
        {coords ? (
          <div
            style={{
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
              border: "1px solid var(--line)",
              background: "var(--surface-muted)",
            }}
          >
            <iframe
              title="Google Maps"
              width="100%"
              height="180"
              style={{ border: 0, display: "block" }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://maps.google.com/maps?q=${coords.lat},${coords.lng}&hl=${isAr ? "ar" : "fr"}&z=14&output=embed`}
            />
            <div
              style={{
                padding: "8px 12px",
                background: "var(--surface)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "1px solid var(--line)",
              }}
            >
              <span className="small muted" style={{ fontWeight: 600 }}>
                🗺️ Google Maps
              </span>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="small"
                style={{
                  color: "var(--brand-700)",
                  fontWeight: 600,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span>{isAr ? "فتح الخريطة الكاملة" : "Ouvrir l'application"}</span>
                <Icon name="share" size={12} />
              </a>
            </div>
          </div>
        ) : null}

        {/* Nearby Registered Stores Shelf */}
        <div className="stack" style={{ gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h4 style={{ fontSize: "var(--text-sm)", fontWeight: 700, margin: 0 }}>
              {isAr ? "المحلات والمتاجر المسجلة القريبة" : "Magasins enregistrés à proximité"}
            </h4>
            <span className="small muted" style={{ fontWeight: 600 }}>
              {stores.length} {isAr ? "متجر" : "boutiques"}
            </span>
          </div>

          {loadingStores ? (
            <div style={{ display: "grid", placeItems: "center", padding: "24px 0" }}>
              <Spinner />
            </div>
          ) : stores.length === 0 ? (
            <div
              style={{
                padding: "24px 16px",
                textAlign: "center",
                background: "var(--surface-muted)",
                borderRadius: "var(--radius-md)",
                border: "1px dashed var(--line)",
              }}
            >
              <p className="small muted" style={{ margin: 0 }}>
                {isAr
                  ? "لا توجد متاجر قريبة جداً حالياً، تصفح جميع المتاجر عبر البحث."
                  : "Aucune boutique proche pour l'instant. Explorez toutes les annonces via la recherche."}
              </p>
            </div>
          ) : (
            <div
              className="stack"
              style={{
                gap: 8,
                maxHeight: "260px",
                overflowY: "auto",
                paddingInlineEnd: 4,
              }}
            >
              {stores.map((store) => (
                <Link
                  key={store.id}
                  to={`/vendeurs/${store.storeSlug || store.id}`}
                  onClick={onClose}
                  className="panel"
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    textDecoration: "none",
                    color: "var(--ink)",
                    transition: "background 0.15s ease, transform 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <Avatar
                      name={store.storeName || store.displayName}
                      imageUrl={store.logoUrl}
                      withGreenRing={true}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "0.9rem",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {store.storeName || store.displayName}
                      </div>
                      <div className="small muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{isAr ? store.wilaya.nameAr : store.wilaya.nameFr}</span>
                        {store.commune ? <span>• {store.commune}</span> : null}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {store.distanceKm !== null ? (
                      <span
                        className="badge"
                        style={{
                          background: "rgba(16, 185, 129, 0.12)",
                          color: "var(--brand-700)",
                          border: "1px solid rgba(16, 185, 129, 0.25)",
                          fontWeight: 700,
                          fontSize: "0.75rem",
                        }}
                      >
                        📍 {store.distanceKm} {isAr ? "كم" : "km"}
                      </span>
                    ) : null}
                    <span className="badge" style={{ fontSize: "0.72rem" }}>
                      {store.listingsCount} {isAr ? "منتج" : "prod."}
                    </span>
                    <Icon
                      name="arrow-right"
                      size={14}
                      style={{ color: "var(--ink-muted)", transform: isAr ? "rotate(180deg)" : "none" }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
