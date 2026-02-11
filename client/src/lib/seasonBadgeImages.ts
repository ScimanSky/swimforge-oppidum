const seasonRewardImageMap: Record<string, string> = {
  "S1-BDG-001": "s1_bdg_001.png",
  "S1-BDG-002": "s1_bdg_002.png",
  "S1-BDG-003": "s1_bdg_003.png",
  "S1-BDG-004": "s1_bdg_004.png",
  "S1-TITLE-PULSE-KEEPER": "s1_title_pulse_keeper.png",
  "S1-TITLE-RHYTHM-ARCHITECT": "s1_title_rhythm_architect.png",
  "S1-FRAME-GLACIER-RING": "s1_frame_glacier_ring.png",
  "S1-EFFECT-AQUA-FLUX": "s1_effect_aqua_flux.png",
};

export function getSeasonRewardImageUrl(rewardCode: string): string {
  const filename = seasonRewardImageMap[rewardCode];
  if (!filename) return "/badges_new/oppidum_member.png";
  return `/badges_season1/${filename}`;
}

const seasonAssignmentImageMap: Record<string, string> = {
  "S1-BDG-001": "s1_bdg_001.png",
  "S1-BDG-002": "s1_bdg_002.png",
  "S1-BDG-003": "s1_bdg_003.png",
  "S1-BDG-004": "s1_bdg_004.png",
};

export function getSeasonAssignmentImageUrl(code: string): string {
  const filename = seasonAssignmentImageMap[code];
  if (!filename) return "/badges_new/oppidum_member.png";
  return `/badges_season1/${filename}`;
}
