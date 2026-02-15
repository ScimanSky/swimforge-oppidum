import { Link } from "wouter"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Flame, Ruler, UserPlus, Waves } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { getInitials, formatDistance } from "@/lib/format"

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="surface-panel p-4 space-y-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  )
}

function SuggestedUserRow({ user }: { user: { userId: number; name: string | null; username: string | null; avatarUrl: string | null; level: number | null } }) {
  const displayName = user.username || user.name || `Nuotatore #${user.userId}`
  const utils = trpc.useUtils()

  const toggleFollow = trpc.community.users.toggleFollow.useMutation({
    onSuccess: () => {
      toast.success("Fatto!")
      utils.community.users.suggested.invalidate()
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <div className="flex items-center gap-2.5">
      <Link href={`/u/${user.userId}`}>
        <Avatar className="size-9 border border-border/60 cursor-pointer">
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

export default function FeedSidebar() {
  const profileQuery = trpc.profile.get.useQuery()
  const profile = profileQuery.data

  const suggestedQuery = trpc.community.users.suggested.useQuery(
    { limit: 3 },
    { staleTime: 60_000 }
  )
  const suggestedUsers = suggestedQuery.data ?? []

  const displayName = profile?.username || profile?.userId?.toString() || "Nuotatore"

  return (
    <div className="space-y-4">
      {/* Your profile mini card */}
      {profile && (
        <Link href="/profile" className="block">
          <div className="surface-panel p-4 flex items-center gap-3 hover:border-[var(--electric-cyan)]/30 transition-colors cursor-pointer">
            <Avatar className="size-12 border-2 border-border/60">
              <AvatarImage src={profile.avatarUrl || ""} alt={displayName} />
              <AvatarFallback className="text-sm font-semibold">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
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

      {/* Suggested users */}
      <SidebarSection title="Suggeriti per te">
        {suggestedUsers.length > 0 ? (
          <div className="space-y-3">
            {suggestedUsers.map((user) => (
              <SuggestedUserRow key={user.userId} user={user} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nessun suggerimento al momento.
          </p>
        )}
        <Button variant="outline-neon" size="sm" className="w-full text-xs" asChild>
          <Link href="/home/community">Esplora la community</Link>
        </Button>
      </SidebarSection>

      {/* Quick stats */}
      {profile && (
        <SidebarSection title="Riepilogo">
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center size-8 rounded-lg bg-[color-mix(in_oklch,var(--electric-cyan)_12%,transparent)]">
                <Ruler className="size-4 text-[var(--electric-cyan)]" />
              </div>
              <div>
                <p className="text-sm font-display font-bold text-foreground">
                  {formatDistance(profile.totalDistanceMeters) || "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">Distanza totale</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center size-8 rounded-lg bg-[color-mix(in_oklch,var(--electric-lime)_12%,transparent)]">
                <Waves className="size-4 text-[var(--electric-lime)]" />
              </div>
              <div>
                <p className="text-sm font-display font-bold text-foreground">{profile.totalXp ?? 0} XP</p>
                <p className="text-[10px] text-muted-foreground">Esperienza totale</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center size-8 rounded-lg bg-[color-mix(in_oklch,var(--electric-coral)_12%,transparent)]">
                <Flame className="size-4 text-[var(--electric-coral)]" />
              </div>
              <div>
                <p className="text-sm font-display font-bold text-foreground">{profile.levelTitle}</p>
                <p className="text-[10px] text-muted-foreground">Titolo</p>
              </div>
            </div>
          </div>
        </SidebarSection>
      )}
    </div>
  )
}
