-- Update wilayas 59 to 69 with exact official decree numbering and Arabic names
INSERT OR REPLACE INTO wilayas (id, slug, name_fr, name_ar) VALUES
  (59, 'aflou',                 'Aflou',                 'آفلو'),
  (60, 'barika',                'Barika',                'بريكة'),
  (61, 'el-kantara',            'El Kantara',            'القنطرة'),
  (62, 'bir-el-ater',           'Bir El Ater',           'بئر العاتر'),
  (63, 'cheria',                'Chéria',                'الشريعة'),
  (64, 'ksar-chellala',         'Ksar Chellala',         'قصر الشلالة'),
  (65, 'ain-oussara',           'Aïn Oussara',           'عين وسارة'),
  (66, 'messaad',               'Messaâd',               'مسعد'),
  (67, 'ksar-el-boukhari',      'Ksar El Boukhari',      'قصر البخاري'),
  (68, 'bou-saada',             'Bou Saâda',             'بوسعادة'),
  (69, 'el-abiodh-sidi-cheikh', 'El Abiodh Sidi Cheikh', 'الأبيض سيدي الشيخ');
