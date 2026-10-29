import { useState } from "react"
import { Link } from "wouter"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  UserCheck,
  UserPlus,
  ChevronRight,
} from "lucide-react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { getInitials } from "@/lib/format"
import { buildFeedSidebarVm, type FeedSidebarProfileVm } from "@/lib/ui-view-models/feed-sidebar"
import { cn } from "@/lib/utils"

function SuggestedUserRow({
  user,
}: {
  user: FeedSidebarProfileVm
}) {
  const displayName = user.displayName
  const utils = trpc.useUtils()
  const [isFollowing, setIsFollowing] = useState(false)

  const toggleFollow = trpc.community.users.toggleFollow.useMutation({
    onSuccess: (result) => {
      setIsFollowing(result.following)
      toast.success(result.following ? `Segui ${displayName}` : `Non segui più ${displayName}`)
      utils.community.users.suggested.invalidate()
      utils.community.feed.invalidate()
    },
    onError: (err) => toast.error(err.message),
  })

  const userProfileHref = user.userId ? `/u/${user.userId}` : "/home/community"

  return (
    <div className="flex items-center gap-2">
      <Link href={userProfileHref}>
        <Avatar className="size-8 border border-border/60 cursor-pointer shrink-0">
          <AvatarImage src={user.avatarUrl || ""} alt={displayName} />
          <AvatarFallback className="text-xs font-semibold">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
      </Link>
      <div className="flex-1 min-w-0">
        <Link href={userProfileHref} className="text-sm font-semibold text-foreground truncate block hover:underline">
          {displayName}
        </Link>
        <p className="truncate text-xs text-muted-foreground">{user.subtitle}</p>
      </div>
      <Button
        variant={isFollowing ? "ghost" : "outline"}
        size="sm"
        className="h-8 gap-1 px-2.5 text-xs shrink-0"
        onClick={() => {
          if (!user.userId) return
          toggleFollow.mutate({ userId: user.userId })
        }}
        disabled={toggleFollow.isPending || !user.userId}
      >
        {isFollowing ? (
          <>
            <UserCheck className="size-3" aria-hidden />
            Seguendo
          </>
        ) : (
          <>
            <UserPlus className="size-3" aria-hidden />
            Segui
          </>
        )}
      </Button>
    </div>
  )
}

export default function FeedSidebar() {
  const suggestedQuery = trpc.community.users.suggested.useQuery(
    { limit: 5 },
    { staleTime: 60_000 }
  )
  const recentClubsQuery = trpc.community.clubs.list.useQuery(
    { scope: "all", limit: 4 },
    { staleTime: 60_000 }
  )
  const suggestedUsers = suggestedQuery.data ?? []
  const recentClubs = ((recentClubsQuery.data as any[] | undefined) ?? []).slice(0, 3)
  const vm = buildFeedSidebarVm({ suggestedUsers })

  return (
    <div className="space-y-4">
      <div className="surface-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-foreground">Club recenti</h2>
          <Link href="/home/community" className="text-sm font-semibold text-action-text hover:underline">
            Vedi tutti
          </Link>
        </div>
        {recentClubsQuery.isLoading ? (
          <p className="text-xs text-muted-foreground">Caricamento club...</p>
        ) : recentClubs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nessun club recente disponibile.</p>
        ) : (
          <div className="space-y-2.5">
            {recentClubs.map((club: any) => (
              <Link
                key={club.id}
                href={`/community/club/${club.id}`}
                className="flex items-center gap-2.5 rounded-xl p-2 transition-colors hover:bg-raised"
              >
                <div className="size-10 shrink-0 overflow-hidden rounded-xl bg-raised">
                  {club.cover_image_url ? (
                    <img
                      src={club.cover_image_url}
                      alt={club.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{club.name || "Club"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {club.member_count ?? 0} membri
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="surface-panel p-4">
        <h2 className="mb-3 text-[15px] font-bold text-foreground">
          Chi seguire
        </h2>
        {vm.whoToFollow.length > 0 ? (
          <div className="space-y-2.5">
            {vm.whoToFollow.map((user) => (
              <SuggestedUserRow key={user.id} user={user} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Acqua piatta: nessun suggerimento ora. Torna dopo nuovi follow.
          </p>
        )}
        <Button variant="ghost" size="sm" className="mt-3 w-full text-action-text" asChild>
          <Link href="/home/community">Mostra altri</Link>
        </Button>
      </div>

      <div className="px-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {vm.footerLinks.map((item) => (
            <Link
              key={`${item.label}-${item.href}`}
              href={item.href}
              className={cn("transition-colors hover:text-foreground")}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">© 2026 SwimForge</p>
      </div>
    </div>
  )
}
