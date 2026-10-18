/**
 * High-resolution, optimized fallback product photography for Algerian marketplace items.
 * Guaranteed to match keywords or category so no product card ever looks empty.
 */
export function getListingFallbackImage(title?: string, categorySlug?: string): string {
  const t = (title || "").toLowerCase();
  const c = (categorySlug || "").toLowerCase();

  // Specific high-value products
  if (t.includes("iphone") || t.includes("apple") || t.includes("15 pro")) {
    return "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("samsung") || t.includes("galaxy") || t.includes("s24")) {
    return "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("macbook") || t.includes("pc portable") || t.includes("laptop") || t.includes("ordinateur")) {
    return "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("airpods") || t.includes("ecouteur") || t.includes("écouteur") || t.includes("casque")) {
    return "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("ps5") || t.includes("playstation") || t.includes("console") || t.includes("gaming")) {
    return "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("tv") || t.includes("téléviseur") || t.includes("iris") || t.includes("condor") || t.includes("écran")) {
    return "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("clio") || t.includes("golf") || t.includes("phares") || t.includes("jantes") || t.includes("distribution") || c.includes("pieces-auto")) {
    if (t.includes("jantes")) return "https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=600&auto=format&fit=crop&q=80";
    if (t.includes("phares")) return "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=600&auto=format&fit=crop&q=80";
    return "https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("vase") || t.includes("poterie") || t.includes("kabyle") || t.includes("artisanat")) {
    return "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("bracelet") || t.includes("argent") || t.includes("bijou") || t.includes("béni yenni") || t.includes("collier")) {
    return "https://images.unsplash.com/photo-1611591475871-33e50742f534?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("tapis") || t.includes("laine") || t.includes("berbère") || t.includes("berbere")) {
    return "https://images.unsplash.com/photo-1600121848594-d8644e57abab?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("salon") || t.includes("canapé") || t.includes("canape") || t.includes("fauteuil")) {
    return "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("table") || t.includes("chaises") || t.includes("meuble")) {
    return "https://images.unsplash.com/photo-1615066390971-03e4e1c36ddf?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("huile") || t.includes("olive") || t.includes("dattes") || t.includes("deglet")) {
    if (t.includes("dattes")) return "https://images.unsplash.com/photo-1584473457406-6240486418e9?w=600&auto=format&fit=crop&q=80";
    return "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("robe") || t.includes("caftan") || t.includes("vetement") || t.includes("vêtement") || c.includes("mode") || c.includes("vetements")) {
    return "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("montre") || t.includes("watch")) {
    return "https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("velo") || t.includes("vélo") || t.includes("vtt") || c.includes("sport")) {
    return "https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("perceuse") || t.includes("bricolage") || t.includes("bosch") || c.includes("equipement-pro")) {
    return "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("ballon") || t.includes("foot") || t.includes("football")) {
    return "https://images.unsplash.com/photo-1511886929837-354d827aae26?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("café") || t.includes("cafe") || t.includes("espresso") || t.includes("delonghi")) {
    return "https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("trottinette") || t.includes("scooter")) {
    return "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("cuir") || t.includes("veste") || t.includes("manteau")) {
    return "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600&auto=format&fit=crop&q=80";
  }
  if (t.includes("parfum") || t.includes("beauté") || t.includes("beaute")) {
    return "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=600&auto=format&fit=crop&q=80";
  }

  // Category defaults
  if (c.includes("telephone") || c.includes("smartphone")) {
    return "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80";
  }
  if (c.includes("informatique") || c.includes("laptop")) {
    return "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600&auto=format&fit=crop&q=80";
  }
  if (c.includes("vehicule") || c.includes("voiture")) {
    return "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=600&auto=format&fit=crop&q=80";
  }
  if (c.includes("meuble") || c.includes("maison")) {
    return "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600&auto=format&fit=crop&q=80";
  }
  if (c.includes("mode") || c.includes("chaussure")) {
    return "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600&auto=format&fit=crop&q=80";
  }

  return "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&auto=format&fit=crop&q=80";
}
