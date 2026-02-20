export type StitchSidebarIconKey = "calendar" | "trophy" | "users"

export type StitchClubHubItemMock = {
  id: string
  title: string
  subtitle: string
  icon: StitchSidebarIconKey
  href: string
  badge?: string
}

export type StitchSuggestedProfileMock = {
  id: string
  name: string
  subtitle: string
  avatarUrl?: string
}

export const STITCH_CLUB_HUB_ITEMS_MOCK: StitchClubHubItemMock[] = [
  {
    id: "weekly-virtual-race",
    title: "Weekly Virtual Race",
    subtitle: "Starts in 2 hours",
    icon: "calendar",
    href: "/season/challenges",
    badge: "+8",
  },
  {
    id: "leaderboard-update",
    title: "Leaderboard Update",
    subtitle: "You moved up 2 spots!",
    icon: "trophy",
    href: "/season/leaderboard",
  },
]

export const STITCH_WHO_TO_FOLLOW_MOCK: StitchSuggestedProfileMock[] = [
  {
    id: "mock-alex-rivera",
    name: "Alex Rivera",
    subtitle: "Olympic Hopeful",
  },
  {
    id: "mock-elena-g",
    name: "Elena G.",
    subtitle: "Triathlete",
  },
  {
    id: "mock-master-swimmers",
    name: "Master Swimmers",
    subtitle: "Community Group",
  },
]

export const STITCH_FEED_FOOTER_LINKS = [
  { label: "About", href: "/terms" },
  { label: "Help", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
]

// TODO(api): Replace STITCH_CLUB_HUB_ITEMS_MOCK with community events/trending endpoints once available.
// TODO(api): Replace STITCH_WHO_TO_FOLLOW_MOCK when recommendation coverage reaches parity.
