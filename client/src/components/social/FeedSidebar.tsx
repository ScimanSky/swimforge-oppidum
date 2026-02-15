import { Link } from "wouter"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Flame, Ruler, UserPlus, Waves } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { getInitials, formatDistance } from "@/lib/format"

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
    <div>
      {/* Single row: story bar + profile + stats + suggested */}
      {/* On mobile: 2-col grid. On md+: single row with story bar as first item */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {/* Story bar card */}
        {storyBarSlot && (
          <div className="surface-panel p-3 col-span-2 md:col-span-1 overflow-hidden">
            {storyBarSlot}
          </div>
        )}
        {/* Profile card */}
        {profile && (
          <Link href="/profile" className="block">
            <div className="surface-panel p-3.5 flex items-center gap-3 hover:border-[var(--electric-cyan)]/30 transition-colors cursor-pointer h-full">
              <Avatar className="size-10 border-2 border-border/60 shrink-0">
                <AvatarImage src={profile.avatarUrl || ""} alt={displayName} />
                <AvatarFallback className="text-xs font-semibold">
                  {getInitials(displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm text-foreground truncate">{displayName}</p>
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
              </div>
            </div>
          </Link>
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
      </div>
    </div>
  )
}
