import { useState, type CSSProperties } from "react";
import { Icon, type IconName } from "./Icons";

/** Slugs that have artwork in `public/categories/`. Mirrors the seeded category list. */
const ARTWORK = new Set([
  "electronique",
  "telephones",
  "informatique",
  "vehicules",
  "immobilier",
  "maison-meubles",
  "mode",
  "sport-loisirs",
  "equipement-pro",
  "autre",
  "smartphones",
  "accessoires-telephone",
  "ordinateurs-portables",
  "composants",
  "voitures",
  "motos",
  "pieces-auto",
  "appartements",
  "maisons-villas",
  "terrains",
  "electromenager",
  "meubles",
  "vetements",
  "chaussures",
]);

/** Artwork URL for a slug, or null when the category has no image and must fall back to its icon. */
export function categoryArtwork(slug: string | undefined): string | null {
  return slug && ARTWORK.has(slug) ? `/categories/${slug}.png` : null;
}

interface CategoryAvatarProps {
  slug: string;
  /** Icon shown while the artwork loads, and permanently for categories without artwork. */
  icon?: string;
  /** Fixed pixel size. Omit it to fill the parent chip, which then owns the box. */
  size?: number;
  className?: string;
}

/**
 * Category artwork. The PNG is a full-bleed disc, so the image *is* the circle — the chip
 * around it only supplies the hairline frame. The icon fallback keeps a newly created
 * category (no artwork yet) looking intentional instead of showing a broken image.
 */
export function CategoryAvatar({ slug, icon, size, className = "" }: CategoryAvatarProps) {
  const [failed, setFailed] = useState(false);
  const box: CSSProperties | undefined = size ? { width: size, height: size } : undefined;

  if (!ARTWORK.has(slug) || failed) {
    return (
      <span className={`cat-avatar-fallback ${className}`.trim()} style={box}>
        <Icon name={(icon as IconName) ?? "tag"} size={size ? Math.round(size * 0.55) : undefined} />
      </span>
    );
  }

  return (
    <img
      className={`cat-avatar ${className}`.trim()}
      style={box}
      src={`/categories/${slug}.png`}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      alt=""
      aria-hidden="true"
      onError={() => setFailed(true)}
    />
  );
}
