const seasonRewardImageMap: Record<string, string> = {
  "S1-BDG-001": "S1_BDG_001 · Frequenza Solida.png",
  "S1-BDG-002": "S1-BDG-002 · Equilibrio Dinamico.png",
  "S1-BDG-003": "S1-BDG-003 · Voce della Crew.png",
  "S1-BDG-004": "S1-BDG-004 · Electric Ice Apex.png",
};

export function getSeasonRewardImageUrl(rewardCode: string): string {
  const filename = seasonRewardImageMap[rewardCode];
  if (!filename) return "/badges_new/oppidum_member.png";
  return `/badges_season1/${filename}`;
}

const seasonAssignmentImageMap: Record<string, string> = {
  "S1-BDG-001": "S1_BDG_001 · Frequenza Solida.png",
  "S1-BDG-002": "S1-BDG-002 · Equilibrio Dinamico.png",
  "S1-BDG-003": "S1-BDG-003 · Voce della Crew.png",
  "S1-BDG-004": "S1-BDG-004 · Electric Ice Apex.png",
  "S1-BDG-005": "S1-BDG-005 · Finestra Cadenza.png",
  "S1-BDG-006": "S1-BDG-006 · Bilanciamento Zone.png",
  "S1-BDG-007": "S1-BDG-007 · Segnale al Team.png",
  "S1-BDG-008": "S1-BDG-008 · Rotazione Avanzata.png",
  "S1-BDG-009": "S1-BDG-009 · Scintilla Community.png",
  "S1-BDG-010": "S1-BDG-010 · Commitment Club.png",
  "S1-BDG-011": "S1-BDG-011 · Pulse Keeper.png",
  "S1-BDG-012": "S1-BDG-012 · Rhythm Architect.png",
};

export function getSeasonAssignmentImageUrl(code: string): string {
  const filename = seasonAssignmentImageMap[code];
  if (!filename) return "/badges_new/oppidum_member.png";
  return `/badges_season1/${filename}`;
}
