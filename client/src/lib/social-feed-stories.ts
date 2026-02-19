export type SocialStory = {
  hasViewed: boolean
}

export type SocialStoryGroup = {
  userId: number
  userName: string | null
  userAvatar: string | null
  stories: SocialStory[]
}

function hasUnviewedStories(group: SocialStoryGroup) {
  return group.stories.some((story) => !story.hasViewed)
}

export function sortStoryGroupsForHeader(groups: SocialStoryGroup[]) {
  return [...groups].sort((a, b) => {
    const aHasUnviewed = hasUnviewedStories(a)
    const bHasUnviewed = hasUnviewedStories(b)
    return aHasUnviewed === bHasUnviewed ? 0 : aHasUnviewed ? -1 : 1
  })
}

export function buildDisplayStoryGroups(params: {
  allGroups: SocialStoryGroup[]
  currentUserId?: number | null
  displayName: string
  avatarUrl?: string | null
}) {
  const { allGroups, currentUserId, displayName, avatarUrl } = params

  const normalizedCurrentUserId =
    typeof currentUserId === "number" && Number.isFinite(currentUserId) ? Number(currentUserId) : null

  const currentUserGroup =
    normalizedCurrentUserId === null
      ? undefined
      : allGroups.find((group) => Number(group.userId) === normalizedCurrentUserId)

  const otherGroups = sortStoryGroupsForHeader(
    allGroups.filter((group) => Number(group.userId) !== normalizedCurrentUserId)
  )

  if (normalizedCurrentUserId === null) return otherGroups
  if (currentUserGroup) return [currentUserGroup, ...otherGroups]

  return [
    {
      userId: normalizedCurrentUserId,
      userName: displayName,
      userAvatar: avatarUrl ?? null,
      stories: [],
    },
    ...otherGroups,
  ]
}

export function findStoryGroupIndex(groups: SocialStoryGroup[], userId: number) {
  return groups.findIndex((group) => Number(group.userId) === Number(userId))
}
