-- Seed data for Azar Neɣ remote production environment

-- Users
INSERT OR IGNORE INTO users (id, email, password_hash, password_algo, role, status, auth_provider, created_at, updated_at) VALUES
('usr_tech_dz', 'contact@techdz.com', 'pbkdf2-sha256$100000$c2VlZDEyMzQ1Njc4OWFiY2RlZg$c2VlZDEyMzQ1Njc4OWFiY2RlZg', 'pbkdf2-sha256', 'USER', 'ACTIVE', 'LOCAL', '2026-01-10T10:00:00.000Z', '2026-01-10T10:00:00.000Z'),
('usr_auto_oran', 'contact@oranauto.com', 'pbkdf2-sha256$100000$c2VlZDEyMzQ1Njc4OWFiY2RlZg$c2VlZDEyMzQ1Njc4OWFiY2RlZg', 'pbkdf2-sha256', 'USER', 'ACTIVE', 'LOCAL', '2026-01-12T10:00:00.000Z', '2026-01-12T10:00:00.000Z'),
('usr_artisanat', 'contact@artisanatdz.com', 'pbkdf2-sha256$100000$c2VlZDEyMzQ1Njc4OWFiY2RlZg$c2VlZDEyMzQ1Njc4OWFiY2RlZg', 'pbkdf2-sha256', 'USER', 'ACTIVE', 'LOCAL', '2026-01-15T10:00:00.000Z', '2026-01-15T10:00:00.000Z'),
('usr_constantine', 'contact@constantinedeco.com', 'pbkdf2-sha256$100000$c2VlZDEyMzQ1Njc4OWFiY2RlZg$c2VlZDEyMzQ1Njc4OWFiY2RlZg', 'pbkdf2-sha256', 'USER', 'ACTIVE', 'LOCAL', '2026-01-20T10:00:00.000Z', '2026-01-20T10:00:00.000Z'),
('usr_buyer_aminedz', 'amine.alger@gmail.com', 'pbkdf2-sha256$100000$c2VlZDEyMzQ1Njc4OWFiY2RlZg$c2VlZDEyMzQ1Njc4OWFiY2RlZg', 'pbkdf2-sha256', 'USER', 'ACTIVE', 'GOOGLE', '2026-02-01T10:00:00.000Z', '2026-02-01T10:00:00.000Z'),
('usr_buyer_karim', 'karim.oran@gmail.com', 'pbkdf2-sha256$100000$c2VlZDEyMzQ1Njc4OWFiY2RlZg$c2VlZDEyMzQ1Njc4OWFiY2RlZg', 'pbkdf2-sha256', 'USER', 'ACTIVE', 'GOOGLE', '2026-02-05T10:00:00.000Z', '2026-02-05T10:00:00.000Z'),
('usr_buyer_sarah', 'sarah.tizi@gmail.com', 'pbkdf2-sha256$100000$c2VlZDEyMzQ1Njc4OWFiY2RlZg$c2VlZDEyMzQ1Njc4OWFiY2RlZg', 'pbkdf2-sha256', 'USER', 'ACTIVE', 'GOOGLE', '2026-02-10T10:00:00.000Z', '2026-02-10T10:00:00.000Z');

-- Seller Profiles
INSERT OR REPLACE INTO seller_profiles (
  user_id, display_name, phone, phone_public, whatsapp_public, wilaya_id, bio,
  store_name, store_slug, commune, address, latitude, longitude, opening_hours, onboarded_at
) VALUES
(
  'usr_tech_dz', 'Tech DZ', '+213550123456', 1, 1, 16,
  'Boutique spécialisée en smartphones, tablettes et accessoires certifiés avec garantie et livraison 58 wilayas.',
  'Tech DZ Store', 'tech-dz', 'Kouba', 'Boulevard des Martyrs, Kouba', 36.7262, 3.0825, 'Sam - Jeu: 09h00 - 19h00',
  '2026-01-10T10:00:00.000Z'
),
(
  'usr_auto_oran', 'Oran Auto', '+213661234567', 1, 1, 31,
  'Vente de pièces détachées d''origine et accessoires automobiles toutes marques allemandes et françaises.',
  'Oran Auto Pièces', 'oran-auto', 'Es Sénia', 'Zone d''activité Es Sénia', 35.6481, -0.6268, 'Sam - Mer: 08h00 - 17h30',
  '2026-01-12T10:00:00.000Z'
),
(
  'usr_artisanat', 'Artisanat Kabyle', '+213770123456', 1, 1, 15,
  'Créations artisanales berbères : poterie traditionnelle d''Ath Kheir, bijoux en argent de Béni Yenni, et tapis tissés main.',
  'Artisanat & Déco Kabylie', 'artisanat-kabylie', 'Tizi Ouzou', 'Rue de la Liberté, Centre-Ville', 36.7118, 4.0459, 'Sam - Jeu: 09h00 - 18h00',
  '2026-01-15T10:00:00.000Z'
),
(
  'usr_constantine', 'Constantine Meubles', '+213560789012', 1, 1, 25,
  'Salons modernes et canapés convertibles sur mesure avec tissu anti-tâche haute résistance.',
  'Constantine Meubles & Confort', 'constantine-meubles', 'El Khroub', 'Route Nationale 3, El Khroub', 36.2625, 6.6922, 'Sam - Jeu: 09h30 - 20h00',
  '2026-01-20T10:00:00.000Z'
);

-- Listings
INSERT OR REPLACE INTO listings (
  id, seller_id, category_id, wilaya_id, title, description, price_da, original_price_da,
  negotiable, condition, status, contact_phone, contact_phone_public, contact_whatsapp,
  view_count, call_clicks, order_clicks, sort_order, published_at, created_at, updated_at
) VALUES
(
  'lst_iphone15_promax', 'usr_tech_dz', 11, 16,
  'iPhone 15 Pro Max 256GB Titane Neuf Scellé',
  'iPhone 15 Pro Max 256 Go Titane Naturel, boîte scellée jamais ouverte avec facture officielle et garantie internationale 1 an. Possibilité de livraison express sur Alger et les 58 wilayas.',
  245000, 260000, 0, 'NEW', 'APPROVED', '+213550123456', 1, 1,
  450, 48, 12, 0, '2026-02-01T12:00:00.000Z', '2026-02-01T12:00:00.000Z', '2026-02-01T12:00:00.000Z'
),
(
  'lst_s24_ultra', 'usr_tech_dz', 11, 16,
  'Samsung Galaxy S24 Ultra 512GB Titane Gray',
  'Samsung Galaxy S24 Ultra 512 Go avec S-Pen intégré, écran Dynamic AMOLED 2X 120Hz, processeur Snapdragon 8 Gen 3 for Galaxy, couleur Titane Gray. Produit neuf dans son emballage d''origine.',
  220000, 235000, 0, 'NEW', 'APPROVED', '+213550123456', 1, 1,
  380, 35, 8, 1, '2026-02-02T14:30:00.000Z', '2026-02-02T14:30:00.000Z', '2026-02-02T14:30:00.000Z'
),
(
  'lst_macbook_m3', 'usr_tech_dz', 13, 16,
  'MacBook Pro 14 M3 Pro 18GB 512GB Gris Sidéral',
  'Apple MacBook Pro 14 pouces puce M3 Pro, 18 Go de mémoire unifiée, 512 Go SSD. Clavier AZERTY d''origine, batterie 100%, état comme neuf dans sa boîte complète avec chargeur MagSafe 70W.',
  365000, 390000, 1, 'LIKE_NEW', 'APPROVED', '+213550123456', 1, 1,
  290, 22, 5, 2, '2026-02-03T09:15:00.000Z', '2026-02-03T09:15:00.000Z', '2026-02-03T09:15:00.000Z'
),
(
  'lst_airpods_pro2', 'usr_tech_dz', 12, 16,
  'AirPods Pro 2ème Génération USB-C MagSafe',
  'Écouteurs Apple AirPods Pro 2 avec port USB-C et réduction active du bruit de niveau professionnel. Neufs scellés avec numéro de série vérifiable sur le site officiel Apple.',
  38000, 42000, 0, 'NEW', 'APPROVED', '+213550123456', 1, 1,
  620, 64, 19, 3, '2026-02-04T16:00:00.000Z', '2026-02-04T16:00:00.000Z', '2026-02-04T16:00:00.000Z'
),
(
  'lst_clio4_distrib', 'usr_auto_oran', 17, 31,
  'Kit Distribution Renault Clio 4 1.5 dCi Original',
  'Kit de distribution complet d''origine Renault (courroie + galet tendeur + pompe à eau) pour moteur 1.5 dCi K9K. Pièce certifiée constructeur avec emballage holographique.',
  18500, 22000, 0, 'NEW', 'APPROVED', '+213661234567', 1, 1,
  510, 53, 14, 0, '2026-02-05T11:00:00.000Z', '2026-02-05T11:00:00.000Z', '2026-02-05T11:00:00.000Z'
),
(
  'lst_golf7_led', 'usr_auto_oran', 17, 31,
  'Optiques Phares LED Volkswagen Golf 7.5 R-Line',
  'Paire de projecteurs avant Full LED adaptatifs pour Golf 7 restylée (facelift 7.5). État impeccable, tous modules et ballasts inclus, testés et fonctionnels sans aucun défaut.',
  85000, 95000, 1, 'LIKE_NEW', 'APPROVED', '+213661234567', 1, 1,
  340, 29, 7, 1, '2026-02-06T15:20:00.000Z', '2026-02-06T15:20:00.000Z', '2026-02-06T15:20:00.000Z'
),
(
  'lst_jantes_audi18', 'usr_auto_oran', 17, 31,
  'Pack 4 Jantes Aluminium 18 Pouces Audi S-Line',
  'Jantes sport en alliage léger 18 pouces entraxe 5x112 finition bicolore diamantée pour Audi A3, A4, Golf 7/8. Produit neuf dans carton d''importation avec cache-moyeux d''origine.',
  135000, 150000, 0, 'NEW', 'APPROVED', '+213661234567', 1, 1,
  410, 41, 11, 2, '2026-02-07T10:45:00.000Z', '2026-02-07T10:45:00.000Z', '2026-02-07T10:45:00.000Z'
),
(
  'lst_vase_poterie', 'usr_artisanat', 22, 15,
  'Vase décoratif en terre cuite kabyle fait main',
  'Vase traditionnel fabriqué et décoré à la main selon les techniques ancestrales de Grande Kabylie. Motifs géométriques berbères peints avec des pigments minéraux naturels.',
  4500, 5500, 0, 'NEW', 'APPROVED', '+213770123456', 1, 1,
  270, 32, 9, 0, '2026-02-08T08:30:00.000Z', '2026-02-08T08:30:00.000Z', '2026-02-08T08:30:00.000Z'
),
(
  'lst_bracelet_argent', 'usr_artisanat', 23, 15,
  'Bracelet Tabzimt Argent 925 Émaillé Béni Yenni',
  'Véritable bijou traditionnel en argent massif 925 serti de corail rouge naturel méditerranéen et émail traditionnel (bleu, vert, jaune). Certificat d''authenticité de l''artisan fourni.',
  19500, 23000, 0, 'NEW', 'APPROVED', '+213770123456', 1, 1,
  490, 44, 16, 1, '2026-02-09T13:00:00.000Z', '2026-02-09T13:00:00.000Z', '2026-02-09T13:00:00.000Z'
),
(
  'lst_tapis_berbere', 'usr_artisanat', 22, 15,
  'Tapis Berbère Traditionnel Pure Laine 200x150cm',
  'Tapis en pure laine vierge tissé patiemment à la main sur métier à tisser traditionnel. Épais, doux et très chaleureux. Idéal pour salon ou chambre à coucher.',
  28000, 35000, 1, 'NEW', 'APPROVED', '+213770123456', 1, 1,
  310, 19, 4, 2, '2026-02-10T17:10:00.000Z', '2026-02-10T17:10:00.000Z', '2026-02-10T17:10:00.000Z'
),
(
  'lst_salon_moderne', 'usr_constantine', 22, 25,
  'Salon d''angle panoramique 6 places velours hydrofuge',
  'Grand salon d''angle moderne 6 places avec tissu velours anti-tâche lavable, mousse haute résilience densité 30, carcasse en bois rouge séché garanti 5 ans. Couleurs au choix.',
  95000, 110000, 0, 'NEW', 'APPROVED', '+213560789012', 1, 1,
  420, 38, 6, 0, '2026-02-11T11:40:00.000Z', '2026-02-11T11:40:00.000Z', '2026-02-11T11:40:00.000Z'
),
(
  'lst_table_manger', 'usr_constantine', 22, 25,
  'Table à Manger Extensible Bois Noble avec 6 Chaises',
  'Table de séjour haut de gamme extensible (160 à 210 cm) en hêtre massif avec plateau en placage chêne naturel et 6 chaises capitonnées grand confort.',
  68000, 75000, 0, 'NEW', 'APPROVED', '+213560789012', 1, 1,
  260, 24, 3, 1, '2026-02-12T14:15:00.000Z', '2026-02-12T14:15:00.000Z', '2026-02-12T14:15:00.000Z'
);

-- Store Reviews (natural 1..5 stars)
INSERT OR REPLACE INTO store_reviews (id, store_seller_id, reviewer_id, rating, comment, created_at) VALUES
('rev_1', 'usr_tech_dz', 'usr_buyer_aminedz', 5, 'Vendeur très sérieux, iPhone reçu sous 24h avec emballage scellé et facture. Service au top !', '2026-02-03T18:00:00.000Z'),
('rev_2', 'usr_tech_dz', 'usr_buyer_karim', 5, 'Matériel 100% original, boutique propre à Kouba avec un très bon accueil.', '2026-02-05T19:30:00.000Z'),
('rev_3', 'usr_auto_oran', 'usr_buyer_aminedz', 5, 'Kit distribution d''origine monté sans aucun problème. Prix imbattable par rapport au concessionnaire.', '2026-02-07T12:00:00.000Z'),
('rev_4', 'usr_artisanat', 'usr_buyer_sarah', 5, 'Les bijoux et la poterie sont magnifiques ! Très fière de notre artisanat.', '2026-02-10T16:00:00.000Z'),
('rev_5', 'usr_constantine', 'usr_buyer_karim', 4, 'Très beau salon et finition soignée. Livraison rapide vers Oran.', '2026-02-12T18:00:00.000Z');

-- Store Follows
INSERT OR REPLACE INTO store_follows (user_id, seller_id, created_at) VALUES
('usr_buyer_aminedz', 'usr_tech_dz', '2026-02-02T10:00:00.000Z'),
('usr_buyer_karim', 'usr_tech_dz', '2026-02-03T11:00:00.000Z'),
('usr_buyer_sarah', 'usr_tech_dz', '2026-02-04T12:00:00.000Z'),
('usr_buyer_aminedz', 'usr_auto_oran', '2026-02-06T14:00:00.000Z'),
('usr_buyer_karim', 'usr_auto_oran', '2026-02-06T15:00:00.000Z'),
('usr_buyer_sarah', 'usr_artisanat', '2026-02-09T09:00:00.000Z'),
('usr_buyer_aminedz', 'usr_artisanat', '2026-02-09T10:00:00.000Z'),
('usr_buyer_sarah', 'usr_constantine', '2026-02-11T13:00:00.000Z');
