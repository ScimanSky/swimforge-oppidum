-- Migration: Create epic challenge winner badges
-- These badges are awarded to challenge winners

INSERT INTO badges (
  name, description, category, rarity, requirement_type, requirement_value, 
  xp_reward, image_url, created_at, updated_at
) VALUES
  (
    'Distance Champion',
    'Hai vinto una sfida di distanza totale! Sei un campione di resistenza.',
    'challenge_winner',
    'epic',
    'manual',
    0,
    500,
    'https://files.manuscdn.com/user_upload_by_module/session_file/310519663310540862/IbYAZPDagEeFecMX.png',
    NOW(),
    NOW()
  ),
  (
    'Session Master',
    'Hai vinto una sfida di sessioni totali! La tua dedizione è leggendaria.',
    'challenge_winner',
    'epic',
    'manual',
    0,
    500,
    'https://files.manuscdn.com/user_upload_by_module/session_file/310519663310540862/vwEtaKSdnlBZGAJD.png',
    NOW(),
    NOW()
  ),
  (
    'Speed Demon',
    'Hai vinto una sfida di velocità media! Sei un fulmine in acqua.',
    'challenge_winner',
    'epic',
    'manual',
    0,
    500,
    'https://files.manuscdn.com/user_upload_by_module/session_file/310519663310540862/vkmnVBVnidSQgEFx.png',
    NOW(),
    NOW()
  ),
  (
    'Endurance Legend',
    'Hai vinto una sfida di tempo totale o sessione più lunga! Sei una leggenda.',
    'challenge_winner',
    'epic',
    'manual',
    0,
    500,
    'https://files.manuscdn.com/user_upload_by_module/session_file/310519663310540862/vEWDcOMPWjiJzpiQ.png',
    NOW(),
    NOW()
  )
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url,
  updated_at = NOW();
