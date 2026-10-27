export type FeedSidebarSuggestedUserInput = {
  userId: number
  name: string | null
  username: string | null
  avatarUrl: string | null
  level: number | null
}

export type FeedSidebarProfileVm = {
  id: string
  userId?: number
  displayName: string
  subtitle: string
  avatarUrl: string | null
  level: number | null
}

export type FeedSidebarFooterLinkVm = {
  label: string
  href: string
}

export type FeedSidebarVm = {
  whoToFollow: FeedSidebarProfileVm[]
  footerLinks: FeedSidebarFooterLinkVm[]
}

const FEED_FOOTER_LINKS: FeedSidebarFooterLinkVm[] = [
  { label: "About", href: "/terms" },
  { label: "Help", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
]

function mapRealSuggestedUser(user: FeedSidebarSuggestedUserInput): FeedSidebarProfileVm {
  const displayName = user.username || user.name || `#${user.userId}`
  const subtitle = user.level != null ? `Level ${user.level}` : "Swimmer"

  return {
    id: `real-${user.userId}`,
    userId: user.userId,
    displayName,
    subtitle,
    avatarUrl: user.avatarUrl,
    level: user.level,
  }
}

export function buildFeedSidebarVm({
  suggestedUsers,
}: {
  suggestedUsers: FeedSidebarSuggestedUserInput[]
}): FeedSidebarVm {
  const whoToFollow = suggestedUsers.map(mapRealSuggestedUser)

  return {
    whoToFollow: whoToFollow.slice(0, 5),
    footerLinks: FEED_FOOTER_LINKS,
  }
}
