// Mapping badge code -> SVG filename
export const BADGE_IMAGE_MAP: Record<string, string> = {
  // Distance badges
  "dist_1km": "first_km",
  "dist_5km": "first_km",
  "dist_10km": "centurion",
  "dist_25km": "marathon_beginner",
  "dist_100km": "aquatic_marathon",
  "dist_250km": "epic_crossing",
  "dist_500km": "half_millennium",
  "dist_1000km": "millionaire",
  
  // Session distance badges
  "session_3km": "solid_session",
  "session_4km": "endurance",
  "session_5km": "ultra_swimmer",
  "session_6km": "unstoppable_machine",
  
  // Consistency badges
  "sessions_10": "promising_start",
  "sessions_25": "healthy_habit",
  "sessions_50": "half_century",
  "sessions_100": "centenarian",
  "sessions_200": "pool_devotee",
  "sessions_365": "year_in_pool",
  
  // Open water badges
  "ow_first": "sea_baptism",
  "ow_5": "navigator",
  "ow_10": "sea_wolf",
  "ow_5km": "marine_explorer",
  "ow_25km": "crosser",
  
  // Special badges
  "oppidum_member": "oppidum_member",
  
  // Time milestone badges
  "time_10h": "first_10_hours",
  "time_50h": "fifty_hours",
  "time_100h": "time_centenarian",
  
  // Level badges
  "level_5": "level_5",
  "level_10": "level_10",
  "level_15": "level_15",
  "level_20": "poseidon",
  
  // Golden octopus (special)
  "golden_octopus": "golden_octopus",
};

export function getBadgeImageUrl(badgeCode: string): string {
  const filename = BADGE_IMAGE_MAP[badgeCode];
  if (!filename) {
    console.warn(`No image mapping found for badge code: ${badgeCode}`);
    return "/badges_new/oppidum_member.png"; // fallback
  }
  return `/badges_new/${filename}.png`;
}
