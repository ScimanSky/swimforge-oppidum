import { Link } from "wouter"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Flame, Ruler, UserPlus, Waves } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { getInitials, formatDistance } from "@/lib/format"

function SuggestedUserChip({ user }: { user: { userId: number; name: string | null; username: string | null; avatarUrl: string | null; level: number | null } }) {
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
    <div className="flex items-center gap-1.5 min-w-0">
      <Link href={`/u/${user.userId}`}>
        <Avatar className="size-7 border border-border/60 cursor-pointer shrink-0">
          <AvatarImage src={user.avatarUrl || ""} alt={displayName} />
          <AvatarFallback className="text-[9px] font-semibold">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
      </Link>
      <Link href={`/u/${user.userId}`} className="text-xs font-semibold text-foreground truncate hover:underline">
        {displayName}
      </Link>
      <Button
        variant="outline-neon"
        size="sm"
        className="h-6 text-[9px] gap-0.5 px-1.5 shrink-0 ml-auto"
        onClick={() => toggleFollow.mutate({ userId: user.userId })}
        disabled={toggleFollow.isPending}
      >
        <UserPlus className="size-2.5" />
        Segui
      </Button>
    </div>
  )
}

export default function FeedSidebar({ storyBarSlot }: { storyBarSlot?: React.ReactNode }) {
  const profileQuery = trpc.profile.get.useQuery()
  const profile = profileQuery.data

  const suggestedQuery = trpc.community.users.suggested.useQuery(
    { limit: 3 },
    { staleTime: 60_000 }
  )
  const suggestedUsers = suggestedQuery.data ?? []

  const displayName = profile?.username || profile?.userId?.toString() || "Nuotatore"

  return (
    <div className="space-y-2">
      {/* Story bar */}
      {storyBarSlot && (
        <div className="surface-panel p-2.5">{storyBarSlot}</div>
      )}

      {/* Compact horizontal strip: profile + stats + suggested */}
      <div className="surface-panel p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Profile mini + stats */}
          {profile && (
            <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
              {/* Avatar + name + level */}
              <Link href="/profile" className="flex items-center gap-2 min-w-0 shrink-0">
                <Avatar className="size-9 border-2 border-border/60">
                  <AvatarImage src={profile.avatarUrl || ""} alt={displayName} />
                  <AvatarFallback className="text-[10px] font-semibold">
                    {getInitials(displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-bold text-xs text-foreground truncate">{displayName}</p>
                  <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-[linear-gradient(135deg,color-mix(in_oklch,var(--electric-cyan)_20%,transparent),color-mix(in_oklch,var(--electric-lime)_16%,transparent))] text-foreground/80">
                    Lv.{profile.xpLevel}
                  </span>
                </div>
              </Link>

              {/* Inline stats */}
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5" title="Distanza totale">
                  <Ruler className="size-3.5 text-[var(--electric-cyan)]" />
                  <span className="font-display font-bold text-foreground">
                    {formatDistance(profile.totalDistanceMeters) || "—"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5" title="Esperienza">
                  <Waves className="size-3.5 text-[var(--electric-lime)]" />
                  <span className="font-display font-bold text-foreground">{profile.totalXp ?? 0} XP</span>
                </div>
                <div className="hidden sm:flex items-center gap-1.5" title="Titolo">
                  <Flame className="size-3.5 text-[var(--electric-coral)]" />
                  <span className="font-display font-bold text-foreground">{profile.levelTitle}</span>
                </div>
              </div>
            </div>
          )}

          {/* Suggested users - compact */}
          {suggestedUsers.length > 0 && (
            <div className="flex items-center gap-2 sm:border-l sm:border-border/40 sm:pl-3 min-w-0 shrink-0">
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0 hidden sm:block">
                Suggeriti
              </span>
              <div className="flex items-center gap-2 overflow-x-auto">
                {suggestedUsers.map((user) => (
                  <SuggestedUserChip key={user.userId} user={user} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
