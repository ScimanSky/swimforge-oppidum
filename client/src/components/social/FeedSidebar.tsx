import { Link } from "wouter"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Flame, Ruler, UserPlus, Waves } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { getInitials, formatDistance } from "@/lib/format"
import { StoryAvatar } from "./StoryAvatar"

function SuggestedUserRow({ user }: { user: { userId: number; name: string | null; username: string | null; avatarUrl: string | null; level: number | null } }) {
  const displayName = user.username || user.name || `#${user.userId}`
  const utils = trpc.useUtils()

  const toggleFollow = trpc.community.users.toggleFollow.useMutation({
    onSuccess: () => {
      toast.success("Fatto!")
      utils.community.users.suggested.invalidate()
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <div className="flex items-center gap-2">
      <Link href={`/u/${user.userId}`}>
        <Avatar className="size-8 border border-border/60 cursor-pointer shrink-0">
          <AvatarImage src={user.avatarUrl || ""} alt={displayName} />
          <AvatarFallback className="text-[10px] font-semibold">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
      </Link>
      <div className="flex-1 min-w-0">
        <Link href={`/u/${user.userId}`} className="text-sm font-semibold text-foreground truncate block hover:underline">
          {displayName}
        </Link>
        {user.level != null && (
          <p className="text-[10px] text-muted-foreground">Lv.{user.level}</p>
        )}
      </div>
      <Button
        variant="outline-neon"
        size="sm"
        className="h-7 text-[10px] gap-1 px-2 shrink-0"
        onClick={() => toggleFollow.mutate({ userId: user.userId })}
        disabled={toggleFollow.isPending}
      >
        <UserPlus className="size-3" />
        Segui
      </Button>
    </div>
  )
}

/** Compact mini-avatar for story in sidebar column */
function StoryMiniAvatar({
  userName,
  avatarUrl,
  hasUnviewed,
  onClick,
}: {
  userName: string
  avatarUrl?: string | null
  hasUnviewed: boolean
  onClick?: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2 group outline-none w-full">
      <div
        className={cn(
          "shrink-0 rounded-full p-[2px] transition-transform group-hover:scale-105 group-active:scale-95",
          hasUnviewed ? "story-ring-animated" : "bg-border/40",
        )}
      >
        <Avatar className="size-8 border-2 border-background">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
          <AvatarFallback className="text-[9px] font-semibold">
            {getInitials(userName)}
          </AvatarFallback>
        </Avatar>
      </div>
      <span className="text-xs text-muted-foreground truncate group-hover:text-foreground transition-colors">
        {userName.split(" ")[0]}
      </span>
    </button>
  )
}

interface FeedSidebarProps {
  currentUserId?: number | null
  onViewStory?: (userId: number) => void
  onCreateStory?: () => void
}

export default function FeedSidebar({ currentUserId, onViewStory, onCreateStory }: FeedSidebarProps) {
  const profileQuery = trpc.profile.get.useQuery()
  const profile = profileQuery.data

  const suggestedQuery = trpc.community.users.suggested.useQuery(
    { limit: 3 },
    { staleTime: 60_000 }
  )
  const suggestedUsers = suggestedQuery.data ?? []

  const { data: storyGroups } = trpc.community.stories.active.useQuery(undefined, {
    staleTime: 30_000,
  })
  const allGroups = storyGroups ?? []
  const currentUserGroup = currentUserId
    ? allGroups.find((g: any) => Number(g.userId) === Number(currentUserId))
    : undefined
  const hasOwnStories = (currentUserGroup?.stories?.length ?? 0) > 0
  const otherGroups = allGroups
    .filter((g: any) => Number(g.userId) !== Number(currentUserId))
    .sort((a, b) => {
      const aU = a.stories.some((s: any) => !s.hasViewed)
      const bU = b.stories.some((s: any) => !s.hasViewed)
      return aU === bU ? 0 : aU ? -1 : 1
    })

  const displayName = profile?.username || profile?.userId?.toString() || "Nuotatore"
  const hasStories = otherGroups.length > 0

  return (
    <div className={cn(
      "grid gap-2.5",
      hasStories
        ? "grid-cols-2 sm:grid-cols-4"
        : "grid-cols-2 sm:grid-cols-3",
    )}>
      {/* Profile card with integrated story avatar */}
      {profile && currentUserId && (
        <div className="surface-panel p-3.5 flex items-center gap-3 h-full">
          <div className="shrink-0">
            <StoryAvatar
              userId={currentUserId}
              userName={currentUserGroup?.userName ?? displayName}
              avatarUrl={currentUserGroup?.userAvatar ?? profile.avatarUrl}
              hasUnviewed={hasOwnStories}
              isCurrentUser
              onClick={hasOwnStories ? () => onViewStory?.(currentUserId) : onCreateStory}
            />
          </div>
          <Link href="/profile" className="min-w-0 flex-1">
            <p className="font-bold text-sm text-foreground truncate hover:underline">{displayName}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[linear-gradient(135deg,color-mix(in_oklch,var(--electric-cyan)_20%,transparent),color-mix(in_oklch,var(--electric-lime)_16%,transparent))] text-foreground/80">
                Lv.{profile.xpLevel}
              </span>
              {profile.xpToNextLevel != null && profile.xpToNextLevel > 0 && (
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,var(--electric-cyan),var(--electric-lime))]"
                    style={{
                      width: `${Math.min(100, ((profile.totalXp) / (profile.totalXp + profile.xpToNextLevel)) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </Link>
        </div>
      )}

      {/* Stats card */}
      {profile && (
        <div className="surface-panel p-3.5 h-full">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Riepilogo</h3>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Ruler className="size-4 text-[var(--electric-cyan)] shrink-0" />
              <span className="text-sm font-display font-bold text-foreground">
                {formatDistance(profile.totalDistanceMeters) || "—"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Waves className="size-4 text-[var(--electric-lime)] shrink-0" />
              <span className="text-sm font-display font-bold text-foreground">{profile.totalXp ?? 0} XP</span>
            </div>
            <div className="flex items-center gap-2">
              <Flame className="size-4 text-[var(--electric-coral)] shrink-0" />
              <span className="text-sm font-display font-bold text-foreground truncate">{profile.levelTitle}</span>
            </div>
          </div>
        </div>
      )}

      {/* Suggested users card */}
      <div className="surface-panel p-3.5 h-full">
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Suggeriti per te</h3>
        {suggestedUsers.length > 0 ? (
          <div className="space-y-2">
            {suggestedUsers.map((user) => (
              <SuggestedUserRow key={user.userId} user={user} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nessun suggerimento al momento.
          </p>
        )}
      </div>

      {/* Stories column — compact vertical list */}
      {hasStories && (
        <div className="surface-panel p-3.5 h-full col-span-2 sm:col-span-1">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Storie</h3>
          <div className="space-y-1.5 max-h-[120px] overflow-y-auto scrollbar-hide">
            {otherGroups.map((group) => {
              const hasUnviewed = group.stories.some((s: any) => !s.hasViewed)
              return (
                <StoryMiniAvatar
                  key={group.userId}
                  userName={group.userName ?? "Utente"}
                  avatarUrl={group.userAvatar}
                  hasUnviewed={hasUnviewed}
                  onClick={() => onViewStory?.(group.userId)}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
