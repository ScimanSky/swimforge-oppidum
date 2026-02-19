export const COMMUNITY_REACTION_TYPES = [
  "splash",
  "fire",
  "strong",
  "clap",
  "wave",
  "love",
  "rocket",
  "wow",
  "laugh",
  "cry",
] as const;

export const COMMUNITY_REACTION_EMOJI_MAP: Record<(typeof COMMUNITY_REACTION_TYPES)[number], string> = {
  splash: "💧",
  fire: "🔥",
  strong: "💪",
  clap: "👏",
  wave: "🌊",
  love: "❤️",
  rocket: "🚀",
  wow: "🤯",
  laugh: "😂",
  cry: "😢",
};
