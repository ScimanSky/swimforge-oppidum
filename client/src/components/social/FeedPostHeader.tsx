import { useState, useEffect } from "react"
import { Link, useLocation } from "wouter"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  MoreHorizontal,
  UserCheck,
  UserPlus,
  Flag,
  EyeOff,
  Trash2,
  Waves,
  Droplets,
} from "lucide-react"
import { formatTimeAgo, getInitials } from "@/lib/format"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"

interface FeedPostHeaderProps {
  post: {
    id: number
    user_id: number
    activity_id?: number | null
    user_name?: string | null
    user_email?: string | null
    user_avatar?: string | null
    user_club_name?: string | null
    activity_source?: string | null
    activity_is_open_water?: boolean | null
    created_at: string
    user_level?: number | null
    user_is_online?: boolean | null
  }
  isOwner: boolean
  isFollowing?: boolean
}

export default function FeedPostHeader({ post, isOwner, isFollowing: initialIsFollowing }: FeedPostHeaderProps) {
  const baseName = post.user_name || post.user_email?.split("@")[0] || "Nuotatore"
  const isActivityPost =
    Boolean(post.activity_id) ||
    Boolean(post.activity_source) ||
    post.activity_is_open_water != null
  const clubName = String(post.user_club_name ?? "").trim()
  const displayName = isActivityPost && clubName ? `${baseName} (${clubName})` : baseName
  const initials = getInitials(baseName)
  const activityType = post.activity_is_open_water ? "Open Water" : "Pool"
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing ?? false)
  const [location, setLocation] = useLocation()

  useEffect(() => {
    setIsFollowing(initialIsFollowing ?? false)
  }, [initialIsFollowing])

  const utils = trpc.useUtils()
  const toggleFollow = trpc.community.users.toggleFollow.useMutation({
    onSuccess: (result) => {
      setIsFollowing(result.following)
      toast.success(result.following ? `Segui ${baseName}` : `Non segui più ${baseName}`)
      utils.community.feed.invalidate()
      utils.community.users.suggested.invalidate()
    },
    onError: (err) => toast.error(err.message),
  })

  const hidePost = trpc.community.hidePost.useMutation({
    onSuccess: () => {
      toast.success("Post nascosto dal tuo feed")
      utils.community.feed.invalidate()
      utils.community.clubs.feed.invalidate()
    },
    onError: (err) => toast.error(err.message),
  })

  const deletePost = trpc.community.deletePost.useMutation({
    onSuccess: () => {
      toast.success("Post eliminato")
      utils.community.feed.invalidate()
      utils.community.clubs.feed.invalidate()
    },
    onError: (err) => toast.error(err.message),
  })

  const sourceParts: string[] = []
  if (post.activity_source) sourceParts.push(post.activity_source)
  if (post.activity_is_open_water != null) sourceParts.push(activityType)
  sourceParts.push(formatTimeAgo(post.created_at))

  return (
    <div className="flex items-center gap-3 px-4 pb-1 pt-4">
      <Link href={`/u/${post.user_id}`}>
        <div className="relative">
          <Avatar className="size-11 cursor-pointer ring-2 ring-[var(--electric-cyan)]/30 transition-all hover:ring-[var(--electric-cyan)]/60">
            <AvatarImage src={post.user_avatar || ""} alt={baseName} />
            <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
          </Avatar>
          {post.user_is_online ? (
            <span className="absolute -left-0.5 -top-0.5 size-3 rounded-full border-2 border-card bg-emerald-400" />
          ) : null}
        </div>
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Link
            href={`/u/${post.user_id}`}
            className="font-bold text-sm text-foreground truncate hover:underline"
          >
            {displayName}
          </Link>
          {post.user_level != null && post.user_level > 0 && (
            <span className="shrink-0 rounded-md bg-[var(--electric-cyan)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--electric-cyan)]">
              Lv.{post.user_level}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {post.activity_is_open_water != null ? (
            post.activity_is_open_water ? (
              <Droplets className="size-3 text-sky-400" />
            ) : (
              <Waves className="size-3 text-[var(--electric-cyan)]" />
            )
          ) : null}
          <span className="truncate">{sourceParts.join(" · ")}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!isOwner && (
          <Button
            variant={isFollowing ? "ghost-neon" : "outline-neon"}
            size="sm"
            className="gap-1 h-8 text-xs"
            onClick={() => toggleFollow.mutate({ userId: post.user_id })}
            disabled={toggleFollow.isPending}
          >
            {isFollowing ? (
              <>
                <UserCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Seguendo</span>
              </>
            ) : (
              <>
                <UserPlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Segui</span>
              </>
            )}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-11 rounded-full text-muted-foreground hover:text-foreground"
            >
              <MoreHorizontal className="size-4" />
              <span className="sr-only">Menu post</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {isOwner ? (
              <DropdownMenuItem
                className="gap-2 text-xs text-destructive focus:text-destructive"
                disabled={deletePost.isPending}
                onSelect={() => {
                  const confirmed = window.confirm("Eliminare questo post?")
                  if (!confirmed) return
                  deletePost.mutate({ postId: post.id })
                }}
              >
                <Trash2 className="size-3.5" />
                {deletePost.isPending ? "Elimino..." : "Elimina"}
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem
                  className="gap-2 text-xs"
                  onSelect={() => {
                    const from = encodeURIComponent(location || "/home")
                    setLocation(`/home/report/post/${post.id}?from=${from}`)
                  }}
                >
                  <Flag className="size-3.5" />
                  Segnala
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 text-xs"
                  disabled={hidePost.isPending}
                  onSelect={() => {
                    hidePost.mutate({ postId: post.id })
                  }}
                >
                  <EyeOff className="size-3.5" />
                  {hidePost.isPending ? "Nascondo..." : "Nascondi"}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
