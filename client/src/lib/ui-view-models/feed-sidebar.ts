import {
  STITCH_CLUB_HUB_ITEMS_MOCK,
  STITCH_FEED_FOOTER_LINKS,
  STITCH_WHO_TO_FOLLOW_MOCK,
  type StitchSidebarIconKey,
} from "@/mocks/stitch/feed-sidebar"

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
  canFollow: boolean
  isMock: boolean
}

export type FeedSidebarClubHubVm = {
  id: string
  title: string
  subtitle: string
  icon: StitchSidebarIconKey
  href: string
  badge?: string
}

export type FeedSidebarFooterLinkVm = {
  label: string
  href: string
}

export type FeedSidebarVm = {
  clubHub: FeedSidebarClubHubVm[]
  whoToFollow: FeedSidebarProfileVm[]
  footerLinks: FeedSidebarFooterLinkVm[]
}

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
    canFollow: true,
    isMock: false,
  }
}

function mapMockSuggestedUser(mockUser: (typeof STITCH_WHO_TO_FOLLOW_MOCK)[number]): FeedSidebarProfileVm {
  return {
    id: mockUser.id,
    displayName: mockUser.name,
    subtitle: mockUser.subtitle,
    avatarUrl: mockUser.avatarUrl ?? null,
    level: null,
    canFollow: false,
    isMock: true,
  }
}

export function buildFeedSidebarVm({
  suggestedUsers,
  mockSectionsEnabled,
}: {
  suggestedUsers: FeedSidebarSuggestedUserInput[]
  mockSectionsEnabled: boolean
}): FeedSidebarVm {
  const realWhoToFollow = suggestedUsers.map(mapRealSuggestedUser)

  const whoToFollow = [...realWhoToFollow]

  if (mockSectionsEnabled && whoToFollow.length < 3) {
    for (const mockUser of STITCH_WHO_TO_FOLLOW_MOCK) {
      if (whoToFollow.some((entry) => entry.displayName.toLowerCase() === mockUser.name.toLowerCase())) {
        continue
      }
      whoToFollow.push(mapMockSuggestedUser(mockUser))
      if (whoToFollow.length >= 5) break
    }
  }

  return {
    clubHub: mockSectionsEnabled ? STITCH_CLUB_HUB_ITEMS_MOCK : [],
    whoToFollow: whoToFollow.slice(0, 5),
    footerLinks: STITCH_FEED_FOOTER_LINKS,
  }
}
