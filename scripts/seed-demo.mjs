#!/usr/bin/env node
/**
 * LOCAL DEMO DATA — every listing title starts with "[Démo]" and every account
 * uses the @azar.local domain. Nothing here is presented as real marketplace
 * activity. Run against a local API only:
 *
 *   npm run dev            # terminal 1
 *   DEMO_ADMIN_EMAIL=admin@example.dz DEMO_ADMIN_PASSWORD=... npm run demo:seed
 *
 * Requires an existing administrator (see `npm run admin:bootstrap`).
 */
import { gradientPng } from "./lib/png.mjs";

const BASE = (process.env.API_BASE ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL ?? "admin@example.dz";
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? "";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "DemoPass1234";

if (!ADMIN_PASSWORD) {
  console.error(
    "\n✖ DEMO_ADMIN_PASSWORD est requis (mot de passe de l'administrateur local).\n" +
      "  Exemple : DEMO_ADMIN_PASSWORD=... npm run demo:seed\n",
  );
  process.exit(1);
}

class ApiClient {
  cookie = "";
  csrf = "";

  async request(path, { method = "GET", body } = {}) {
    const headers = {};
    if (this.cookie) headers.cookie = this.cookie;
    if (method !== "GET" && this.csrf) headers["x-csrf-token"] = this.csrf;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const response = await fetch(`${BASE}/api${path}`, { method, headers, body: payload });
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      if (cookie.startsWith("azar_session=")) this.cookie = cookie.split(";")[0];
    }
    const text = await response.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (data?.user?.csrfToken) this.csrf = data.user.csrfToken;
    if (!response.ok) {
      const error = new Error(data?.error?.message ?? `HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }
}

async function ensureAccount({ email, displayName, phone, wilayaId }) {
  const client = new ApiClient();
  try {
    const data = await client.request("/auth/register", {
      method: "POST",
      body: {
        email,
        password: DEMO_PASSWORD,
        displayName,
        phone,
        wilayaId,
        phonePublic: true,
        whatsappPublic: true,
      },
    });
    console.log(`  + compte créé : ${email}`);
    return { client, id: data.user.id };
  } catch (error) {
    if (error.status !== 409) throw error;
    const data = await client.request("/auth/login", {
      method: "POST",
      body: { email, password: DEMO_PASSWORD },
    });
    console.log(`  = compte existant : ${email}`);
    return { client, id: data.user.id };
  }
}

async function uploadPhoto(client, index) {
  const png = gradientPng(index, 1200, 900);
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), `demo-${index}.png`);
  const data = await client.request("/images", { method: "POST", body: form });
  return data.image.id;
}

const LISTINGS = [
  {
    title: "[Démo] iPhone 14 Pro 128 Go — Noir sidéral",
    description:
      "iPhone 14 Pro en excellent état, batterie à 91 %, facture et boîte d'origine incluses. Écran sans rayure, toujours utilisé avec coque et verre trempé. Remise en main propre à Alger centre.",
    categoryId: 11,
    wilayaId: 16,
    priceDa: 148000,
    condition: "LIKE_NEW",
    negotiable: true,
    seller: 0,
    images: 2,
    moderation: "approve",
  },
  {
    title: '[Démo] MacBook Air M2 13" — 8/256 Go',
    description:
      "MacBook Air M2 acheté en 2023, 84 cycles de batterie, clavier et écran impeccables. Vendu avec chargeur d'origine et housse. Idéal pour les études et le travail nomade. Disponible à Oran.",
    categoryId: 13,
    wilayaId: 31,
    priceDa: 172000,
    condition: "LIKE_NEW",
    negotiable: true,
    seller: 0,
    images: 1,
    moderation: "approve",
  },
  {
    title: "[Démo] Peugeot 208 1.2 PureTech 2019",
    description:
      "Peugeot 208 essence, 68 000 km, entretien suivi chez le concessionnaire, pneus récents. Carte grise et carnet disponibles. Petite rayure sur le pare-chocs arrière, visible sur la photo. Sétif.",
    categoryId: 15,
    wilayaId: 19,
    priceDa: 2650000,
    condition: "GOOD",
    negotiable: true,
    seller: 1,
    images: 2,
    moderation: "approve",
  },
  {
    title: "[Démo] Appartement F3 85 m² — Hydra, Alger",
    description:
      "Appartement F3 de 85 m² au 3e étage avec ascenseur, deux chambres, salon lumineux, cuisine équipée et balcon. Proche des commerces et des transports. Dossier complet exigé.",
    categoryId: 18,
    wilayaId: 16,
    priceDa: 19500000,
    condition: "GOOD",
    negotiable: true,
    seller: 1,
    images: 1,
    moderation: "approve",
  },
  {
    title: "[Démo] Canapé d'angle 5 places en tissu",
    description:
      "Canapé d'angle convertible, tissu gris anthracite, très confortable. Acheté il y a deux ans, aucune tache ni déchirure. À récupérer sur place à Constantine, aide au chargement possible.",
    categoryId: 22,
    wilayaId: 25,
    priceDa: 52000,
    condition: "GOOD",
    negotiable: true,
    seller: 2,
    images: 1,
    moderation: "approve",
  },
  {
    title: '[Démo] Vélo VTT 27,5" — 21 vitesses',
    description:
      "VTT tout-terrain avec cadre aluminium, freins à disque, 21 vitesses. Révisé ce mois-ci, chaîne et plaquettes neuves. Convient à une personne de 1,65 m à 1,85 m. Annaba.",
    categoryId: 8,
    wilayaId: 23,
    priceDa: 34000,
    condition: "LIKE_NEW",
    negotiable: false,
    seller: 2,
    images: 1,
    moderation: "approve",
  },
  {
    title: "[Démo] Réfrigérateur Samsung 400 L",
    description:
      "Réfrigérateur combiné Samsung, 400 litres, classe A+, fonctionnel et silencieux. Vendu pour cause de déménagement. Quelques marques d'usage sur la porte, aucun problème technique. Blida.",
    categoryId: 21,
    wilayaId: 9,
    priceDa: 68000,
    condition: "GOOD",
    negotiable: true,
    seller: 0,
    images: 1,
    moderation: "approve",
  },
  {
    title: "[Démo] Perceuse à percussion Bosch 800 W",
    description:
      "Perceuse à percussion professionnelle Bosch, 800 W, mandrin 13 mm, livrée avec coffret et trois forets. Très peu utilisée sur chantier. Facture d'achat disponible. Oran.",
    categoryId: 9,
    wilayaId: 31,
    priceDa: 21500,
    condition: "NEW",
    negotiable: false,
    seller: 1,
    images: 1,
    moderation: "approve",
  },
  {
    title: "[Démo] Robe kabyle brodée main",
    description:
      "Robe traditionnelle kabyle brodée à la main, taille M, portée une seule fois pour un mariage. Tissu léger et broderies colorées en excellent état. Retrait à Tlemcen ou envoi possible.",
    categoryId: 23,
    wilayaId: 13,
    priceDa: 24000,
    condition: "NEW",
    negotiable: true,
    seller: 2,
    images: 1,
    moderation: "approve",
  },
  {
    title: "[Démo] PlayStation 5 Slim + 2 manettes",
    description:
      "Console PS5 Slim avec lecteur de disque, deux manettes DualSense et trois jeux. Achetée il y a six mois, facture fournie, aucun bruit anormal. Alger, remise en main propre.",
    categoryId: 1,
    wilayaId: 16,
    priceDa: 82000,
    condition: "LIKE_NEW",
    negotiable: true,
    seller: 0,
    images: 2,
    moderation: "approve",
  },
  {
    title: "[Démo] Toyota Hilux 2.4 D-4D 2017",
    description:
      "Pick-up Toyota Hilux double cabine, diesel, 145 000 km, 4x4. Véhicule de société entretenu régulièrement, pneus tout-terrain récents. Contrôle technique valide. Ouargla.",
    categoryId: 15,
    wilayaId: 30,
    priceDa: 4300000,
    condition: "GOOD",
    negotiable: true,
    seller: 1,
    images: 1,
    moderation: "pending",
  },
  {
    title: "[Démo] Terrain agricole 2 ha — Adrar",
    description:
      "Terrain agricole de 2 hectares avec accès à l'eau, situé à 12 km du centre d'Adrar. Acte de propriété disponible. Idéal pour un projet de palmiers dattiers ou de maraîchage.",
    categoryId: 20,
    wilayaId: 1,
    priceDa: 1500000,
    condition: "GOOD",
    negotiable: true,
    seller: 2,
    images: 1,
    moderation: "pending",
  },
  {
    title: "[Démo] Chaussures de running taille 42",
    description:
      "Chaussures de running taille 42, utilisées quelques sorties seulement. Semelles encore très bonnes, légères traces d'usure. Modèle homme, coloris bleu et blanc. Béjaïa.",
    categoryId: 24,
    wilayaId: 6,
    priceDa: 7500,
    condition: "FAIR",
    negotiable: true,
    seller: 0,
    images: 1,
    moderation: "reject",
    rejectionReason:
      "Photos insuffisamment nettes : montrez les semelles et l'étiquette de taille.",
  },
];

async function main() {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`\n✖ API locale injoignable sur ${BASE}. Lancez \`npm run dev\` d'abord.\n`);
    process.exit(1);
  }

  console.log("\nAzar Neɣ — données de démonstration locales\n");

  const admin = new ApiClient();
  await admin.request("/auth/login", {
    method: "POST",
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  console.log(`  = administrateur : ${ADMIN_EMAIL}`);

  const sellers = [];
  for (const [index, seller] of [
    { email: "demo.vendeur1@azar.local", name: "Yacine B.", phone: "0551000101", wilaya: 16, storeName: "Tech & Mobile Alger", storeSlug: "tech-alger", commune: "Bab Ezzouar", address: "14 Rue Didouche Mourad" },
    { email: "demo.vendeur2@azar.local", name: "Nadia M.", phone: "0662000202", wilaya: 31, storeName: "Boutique Mode Oran", storeSlug: "mode-oran", commune: "Oran Centre", address: "Avenue Larbi Ben M'hidi" },
    { email: "demo.vendeur3@azar.local", name: "Sofiane K.", phone: "0770000303", wilaya: 25, storeName: "Auto Pièces Constantine", storeSlug: "auto-constantine", commune: "Ali Mendjeli", address: "Zone Industrielle" },
  ].entries()) {
    const acc = await ensureAccount({
      email: seller.email,
      displayName: seller.name,
      phone: seller.phone,
      wilayaId: seller.wilaya,
      index,
    });
    try {
      await acc.client.request("/auth/store", {
        method: "PATCH",
        body: {
          displayName: seller.name,
          storeName: seller.storeName,
          storeSlug: seller.storeSlug,
          commune: seller.commune,
          address: seller.address,
          openingHours: "09:00 - 18:30 (Sam - Jeu)",
          phone: seller.phone,
          phonePublic: true,
          whatsappPublic: true,
          wilayaId: seller.wilaya,
          bio: `Bienvenue chez ${seller.storeName}. Retrouvez nos meilleurs produits avec livraison et garantie directe.`,
        },
      });
    } catch {
      // Store info already set
    }
    sellers.push(acc);
  }

  const buyer = await ensureAccount({
    email: "demo.acheteur@azar.local",
    displayName: "Amina A.",
    phone: "0555000505",
    wilayaId: 31,
  });

  const moderator = await ensureAccount({
    email: "demo.moderateur@azar.local",
    displayName: "Karim Modération",
    phone: "0666000606",
    wilayaId: 16,
  });
  await admin.request(`/admin/users/${moderator.id}`, {
    method: "PATCH",
    body: { role: "MODERATOR" },
  });

  const existing = new Set();
  for (const seller of sellers) {
    const data = await seller.client.request("/account/listings?perPage=50");
    for (const listing of data.listings.items) existing.add(listing.title);
  }

  let approvedFirst = null;
  let created = 0;

  for (const item of LISTINGS) {
    if (existing.has(item.title)) continue;
    const seller = sellers[item.seller];
    const imageIds = [];
    for (let i = 0; i < item.images; i += 1) {
      imageIds.push(await uploadPhoto(seller.client, created + i));
    }
    const payload = {
      title: item.title,
      description: item.description,
      categoryId: item.categoryId,
      wilayaId: item.wilayaId,
      priceDa: item.priceDa,
      negotiable: item.negotiable,
      condition: item.condition,
      contactPhonePublic: true,
      contactWhatsapp: true,
      imageIds,
    };
    const draft = await seller.client.request("/listings", { method: "POST", body: payload });
    const id = draft.listing.id;
    await seller.client.request(`/listings/${id}/submit`, { method: "POST" });

    if (item.moderation === "approve") {
      await admin.request(`/moderation/listings/${id}/decision`, {
        method: "POST",
        body: { action: "APPROVE" },
      });
      if (!approvedFirst) approvedFirst = id;
    } else if (item.moderation === "reject") {
      await admin.request(`/moderation/listings/${id}/decision`, {
        method: "POST",
        body: { action: "REJECT", reason: item.rejectionReason },
      });
    }
    created += 1;
    console.log(`  + annonce : ${item.title}`);
  }

  if (approvedFirst) {
    await buyer.client.request(`/favorites/${approvedFirst}`, { method: "POST" });
  }

  console.log(`\n✔ ${created} annonce(s) créée(s), ${existing.size} déjà présente(s).`);
  console.log("  Titres préfixés [Démo] — données locales uniquement.\n");
}

main().catch((error) => {
  console.error("\n✖", error.message, "\n");
  process.exit(1);
});
