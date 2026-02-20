import { useState } from "react"
import { Link } from "wouter"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Calendar,
  Image as ImageIcon,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  UserRoundPlus,
  Waves,
} from "lucide-react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { getInitials } from "@/lib/format"
import { CreatePostSheet } from "@/components/social/CreatePostSheet"
import { UI_FEATURE_FLAGS } from "@/lib/feature-flags"
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
          <AvatarFallback className="text-[10px] font-semibold">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
      </Link>
      <div className="flex-1 min-w-0">
        <Link href={userProfileHref} className="text-sm font-semibold text-foreground truncate block hover:underline">
          {displayName}
        </Link>
        <p className="text-[10px] text-muted-foreground">{user.subtitle}</p>
      </div>
      <Button
        variant={user.canFollow ? (isFollowing ? "ghost-neon" : "outline-neon") : "ghost-neon"}
        size="sm"
        className="h-7 text-[10px] gap-1 px-2 shrink-0"
        onClick={() => {
          if (!user.canFollow || !user.userId) return
          toggleFollow.mutate({ userId: user.userId })
        }}
        disabled={toggleFollow.isPending || !user.canFollow || !user.userId}
      >
        {user.canFollow ? (isFollowing ? (
          <>
            <UserCheck className="size-3" />
            Seguendo
          </>
        ) : (
          <>
            <UserPlus className="size-3" />
            Segui
          </>
        )) : (
          <>
            <UserRoundPlus className="size-3" />
            Scopri
          </>
        )}
      </Button>
    </div>
  )
}

function clubHubIcon(icon: "calendar" | "trophy" | "users") {
  if (icon === "calendar") return <Calendar className="size-4 text-[var(--electric-cyan)]" />
  if (icon === "trophy") return <Trophy className="size-4 text-[var(--electric-lime)]" />
  return <Users className="size-4 text-[var(--electric-cyan)]" />
}

export default function FeedSidebar() {
  const suggestedQuery = trpc.community.users.suggested.useQuery(
    { limit: 5 },
    { staleTime: 60_000 }
  )
  const profileQuery = trpc.profile.get.useQuery()
  const [createPostOpen, setCreatePostOpen] = useState(false)
  const suggestedUsers = suggestedQuery.data ?? []
  const vm = buildFeedSidebarVm({
    suggestedUsers,
    mockSectionsEnabled: UI_FEATURE_FLAGS.mockSections,
  })
  const profileName = profileQuery.data?.username || "You"
  const profileAvatar = profileQuery.data?.avatarUrl || null

  return (
    <div className="space-y-4">
      <div className="surface-panel p-4">
        <div className="flex items-center gap-2.5">
          <Avatar className="size-9 border border-border/60 shrink-0">
            <AvatarImage src={profileAvatar || ""} alt={profileName} />
            <AvatarFallback className="text-xs font-semibold">
              {getInitials(profileName)}
            </AvatarFallback>
          </Avatar>
          <button
            type="button"
            onClick={() => setCreatePostOpen(true)}
            className="flex h-10 flex-1 items-center rounded-full border border-border/70 bg-card/60 px-3 text-sm text-muted-foreground transition-colors hover:border-[var(--electric-cyan)]/60 hover:text-foreground"
          >
            Share your swim...
          </button>
          <Button
            type="button"
            variant="neon"
            size="sm"
            className="min-h-[40px] px-4"
            onClick={() => setCreatePostOpen(true)}
          >
            Post
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            aria-label="Add image post"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border/60 bg-background/35 text-muted-foreground transition-colors hover:text-foreground hover:border-[var(--electric-cyan)]/60"
            onClick={() => setCreatePostOpen(true)}
          >
            <ImageIcon className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Share swim activity"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border/60 bg-background/35 text-muted-foreground transition-colors hover:text-foreground hover:border-[var(--electric-lime)]/60"
            onClick={() => setCreatePostOpen(true)}
          >
            <Waves className="size-4" />
          </button>
        </div>
      </div>

      {vm.clubHub.length > 0 ? (
        <div className="surface-panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-display font-semibold text-foreground">Club Hub</h3>
            <Link href="/home/community" className="text-xs font-semibold text-[var(--electric-cyan)] hover:underline">
              View All
            </Link>
          </div>
          <div className="space-y-3">
            {vm.clubHub.map((entry) => (
              <Link
                key={entry.id}
                href={entry.href}
                className="flex items-start gap-3 rounded-xl border border-border/55 bg-background/35 px-3 py-2.5 transition-colors hover:border-[var(--electric-cyan)]/55"
              >
                <span className="inline-flex size-8 items-center justify-center rounded-lg border border-border/50 bg-card/55">
                  {clubHubIcon(entry.icon)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{entry.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{entry.subtitle}</span>
                </span>
                {entry.badge ? (
                  <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {entry.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="surface-panel p-4">
        <h3 className="mb-3 text-sm font-display font-semibold text-foreground">
          Who to Follow
        </h3>
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
        <Button variant="ghost-neon" size="sm" className="mt-3 w-full" asChild>
          <Link href="/home/community">Show More</Link>
        </Button>
      </div>

      <div className="px-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/80">
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
        <p className="mt-1 text-[11px] text-muted-foreground/60">© 2026 SwimForge</p>
      </div>

      <CreatePostSheet open={createPostOpen} onOpenChange={setCreatePostOpen} />
    </div>
  )
}
