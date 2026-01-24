-- Update profile badge image URLs to use local paths
UPDATE profile_badges SET badge_image_url = '/profile_badges/level_1_novizio.png' WHERE level = 1;
UPDATE profile_badges SET badge_image_url = '/profile_badges/level_2_principiante.png' WHERE level = 2;
UPDATE profile_badges SET badge_image_url = '/profile_badges/level_3_intermedio.png' WHERE level = 3;
UPDATE profile_badges SET badge_image_url = '/profile_badges/level_4_avanzato.png' WHERE level = 4;
UPDATE profile_badges SET badge_image_url = '/profile_badges/level_5_esperto.png' WHERE level = 5;
UPDATE profile_badges SET badge_image_url = '/profile_badges/level_6_maestro.png' WHERE level = 6;
UPDATE profile_badges SET badge_image_url = '/profile_badges/level_7_leggenda.png' WHERE level = 7;
