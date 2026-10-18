-- Additional high-demand products for Azar Neɣ marketplace

INSERT OR REPLACE INTO listings (
  id, seller_id, category_id, wilaya_id, title, description, price_da, original_price_da,
  negotiable, condition, status, contact_phone, contact_phone_public, contact_whatsapp,
  view_count, call_clicks, order_clicks, sort_order, published_at, created_at, updated_at
) VALUES
(
  'lst_ps5_slim', 'usr_tech_dz', 1, 16,
  'Console Sony PlayStation 5 Slim 1TB Édition Standard avec 2 Manettes',
  'Sony PlayStation 5 Slim 1 To SSD avec lecteur de disque Blu-ray, pack avec deux manettes DualSense sans fil officielles. Produit scellé avec garantie 1 an et livraison 58 wilayas.',
  118000, 125000, 0, 'NEW', 'APPROVED', '+213550123456', 1, 1,
  580, 52, 14, 4, '2026-02-13T10:00:00.000Z', '2026-02-13T10:00:00.000Z', '2026-02-13T10:00:00.000Z'
),
(
  'lst_tv_iris_55', 'usr_tech_dz', 21, 19,
  'Téléviseur IRIS 55 Pouces 4K Ultra HD Smart Google TV HDR10',
  'TV Iris 55 pouces (140 cm) 4K Ultra HD avec Google TV intégré, Dolby Audio, Bluetooth 5.0, WiFi double bande, applications Netflix, YouTube, Shahid préinstallées. Garantie constructeur 24 mois.',
  62000, 69000, 0, 'NEW', 'APPROVED', '+213550123456', 1, 1,
  420, 39, 9, 5, '2026-02-13T11:30:00.000Z', '2026-02-13T11:30:00.000Z', '2026-02-13T11:30:00.000Z'
),
(
  'lst_delonghi_magnifica', 'usr_auto_oran', 21, 31,
  'Machine à Café Espresso Broyeur à Grains DeLonghi Magnifica S',
  'Machine à café automatique avec broyeur à grains en acier conique intégré, buse vapeur cappuccino, personnalisation de l''intensité et de la température. Fabriquée en Europe, neuve en emballage scellé.',
  72000, 79000, 0, 'NEW', 'APPROVED', '+213661234567', 1, 1,
  310, 27, 6, 6, '2026-02-13T14:15:00.000Z', '2026-02-13T14:15:00.000Z', '2026-02-13T14:15:00.000Z'
),
(
  'lst_velo_rockrider', 'usr_auto_oran', 8, 31,
  'Vélo VTT Rockrider ST 540 27.5 Pouces Freins Hydrauliques',
  'VTT tout terrain cadre aluminium léger 6061, fourche hydraulique 100mm avec commande au guidon, transmission 2x9 vitesses Shimano Altus, freins à disques hydrauliques Tektro puissants.',
  64000, 70000, 1, 'NEW', 'APPROVED', '+213661234567', 1, 1,
  390, 33, 8, 7, '2026-02-13T16:00:00.000Z', '2026-02-13T16:00:00.000Z', '2026-02-13T16:00:00.000Z'
),
(
  'lst_trottinette_xiaomi', 'usr_tech_dz', 16, 16,
  'Trottinette Électrique Xiaomi Mi Electric Scooter Pro 2',
  'Trottinette électrique Xiaomi Pro 2, autonomie jusqu''à 45 km, vitesse max 25 km/h, pneus 8.5 pouces pneumatiques, double système de freinage régénératif E-ABS, éclairage LED puissant.',
  78000, 85000, 0, 'NEW', 'APPROVED', '+213550123456', 1, 1,
  460, 41, 11, 8, '2026-02-14T09:00:00.000Z', '2026-02-14T09:00:00.000Z', '2026-02-14T09:00:00.000Z'
),
(
  'lst_robe_kabyle_moderne', 'usr_artisanat', 23, 15,
  'Robe Kabyle Moderne Haute Couture avec Ceinture et Foulard',
  'Superbe robe kabyle contemporaine brodée main avec rubans zig-zag colorés traditionnels et passementerie fine en soie végétale. Livrée avec ceinture argentée et mendil assorti.',
  16500, 19000, 0, 'NEW', 'APPROVED', '+213770123456', 1, 1,
  530, 49, 15, 9, '2026-02-14T11:20:00.000Z', '2026-02-14T11:20:00.000Z', '2026-02-14T11:20:00.000Z'
),
(
  'lst_caftan_algerois', 'usr_artisanat', 23, 16,
  'Caftan Traditionnel Algérien Karakou Velours et Broderie Dorée',
  'Tenue traditionnelle de cérémonie en velours de soie de première qualité, ornée de broderies au fil d''or (fetla et medjboud) réalisées par des maîtres artisans d''Alger.',
  42000, 48000, 0, 'NEW', 'APPROVED', '+213770123456', 1, 1,
  480, 36, 7, 10, '2026-02-14T13:45:00.000Z', '2026-02-14T13:45:00.000Z', '2026-02-14T13:45:00.000Z'
),
(
  'lst_huile_olive_kabyle', 'usr_artisanat', 10, 15,
  'Huile d''Olive Vierge Extra de Kabylie Bidon 5 Litres Pression à Froid',
  'Huile d''olive pure 100% naturelle récolte récente de Haute Kabylie. Première pression mécanique à froid sans aucun additif chimique. Taux d''acidité inférieur à 0.8%, goût fruité intense.',
  6500, 7500, 0, 'NEW', 'APPROVED', '+213770123456', 1, 1,
  620, 58, 22, 11, '2026-02-14T15:10:00.000Z', '2026-02-14T15:10:00.000Z', '2026-02-14T15:10:00.000Z'
),
(
  'lst_dattes_deglet_nour', 'usr_artisanat', 10, 7,
  'Dattes Deglet Nour de Biskra Tolga Carton 5kg Première Qualité',
  'Dattes branchées Deglet Nour authentiques des palmeraies réputées de Tolga (Biskra). Translucides, moelleuses et parfumées au miel naturel, calibre extra dans emballage fraîcheur hermétique.',
  4500, 5200, 0, 'NEW', 'APPROVED', '+213770123456', 1, 1,
  510, 47, 18, 12, '2026-02-14T16:30:00.000Z', '2026-02-14T16:30:00.000Z', '2026-02-14T16:30:00.000Z'
),
(
  'lst_perceuse_bosch', 'usr_tech_dz', 9, 16,
  'Pack Perceuse Visseuse Sans Fil Bosch Professional GSR 18V',
  'Perceuse visseuse professionnelle sans balais (Brushless) Bosch 18V avec 2 batteries Li-ion 2.0Ah, chargeur rapide et coffret de transport robuste L-BOXX.',
  26500, 30000, 0, 'NEW', 'APPROVED', '+213550123456', 1, 1,
  350, 31, 7, 13, '2026-02-15T09:30:00.000Z', '2026-02-15T09:30:00.000Z', '2026-02-15T09:30:00.000Z'
),
(
  'lst_canape_clicclac', 'usr_constantine', 22, 25,
  'Canapé Convertible Clic-Clac 3 Places Tissu Velours Gris Anthracite',
  'Canapé lit convertible 3 places avec coffre de rangement sous l''assise, matelas mousse haute densité 28kg/m3, pieds en bois naturel et tissu anti-tâches très doux.',
  45000, 52000, 0, 'NEW', 'APPROVED', '+213560789012', 1, 1,
  380, 29, 5, 14, '2026-02-15T11:00:00.000Z', '2026-02-15T11:00:00.000Z', '2026-02-15T11:00:00.000Z'
),
(
  'lst_montre_xiaomi', 'usr_tech_dz', 12, 16,
  'Montre Connectée Xiaomi Watch S3 Écran AMOLED 1.43 Pouces',
  'Smartwatch Xiaomi avec lunette interchangeable, écran AMOLED éclatant 60Hz, GPS double fréquence, suivi continu du rythme cardiaque et de la SpO2, autonomie jusqu''à 15 jours.',
  17500, 21000, 0, 'NEW', 'APPROVED', '+213550123456', 1, 1,
  440, 38, 10, 15, '2026-02-15T14:00:00.000Z', '2026-02-15T14:00:00.000Z', '2026-02-15T14:00:00.000Z'
),
(
  'lst_veste_cuir_homme', 'usr_artisanat', 23, 16,
  'Veste en Cuir Véritable Homme Coupe Motard Slim Noir',
  'Veste homme 100% cuir d''agneau véritable pleine fleur, doublure satinée thermique, fermetures éclair métalliques YKK robustes, col motard avec bouton pression.',
  22000, 26000, 0, 'NEW', 'APPROVED', '+213770123456', 1, 1,
  290, 24, 6, 16, '2026-02-15T16:20:00.000Z', '2026-02-15T16:20:00.000Z', '2026-02-15T16:20:00.000Z'
),
(
  'lst_casque_sony_xm5', 'usr_tech_dz', 1, 16,
  'Casque Audio Sans Fil Sony WH-1000XM5 Réduction de Bruit Active',
  'Casque Bluetooth circum-aural haute fidélité Sony WH-1000XM5 noir avec processeur V1, 8 microphones à réduction de bruit, audio Hi-Res LDAC et autonomie 30 heures.',
  49000, 55000, 0, 'NEW', 'APPROVED', '+213550123456', 1, 1,
  410, 35, 9, 17, '2026-02-15T17:40:00.000Z', '2026-02-15T17:40:00.000Z', '2026-02-15T17:40:00.000Z'
),
(
  'lst_table_basse_marbre', 'usr_constantine', 22, 25,
  'Table Basse Moderne Plateau Marbre Blanc et Structure Métal Doré',
  'Table basse design contemporaine double plateau rond marbre blanc veiné et armature géométrique en acier finition laiton doré brossé anti-rayures.',
  29000, 34000, 0, 'NEW', 'APPROVED', '+213560789012', 1, 1,
  330, 26, 4, 18, '2026-02-15T19:00:00.000Z', '2026-02-15T19:00:00.000Z', '2026-02-15T19:00:00.000Z'
);
