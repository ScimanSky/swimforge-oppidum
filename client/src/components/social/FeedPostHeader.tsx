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
} from "lucide-react"
import { formatTimeAgo, getInitials } from "@/lib/format"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"

const SOURCE_LABELS: Record<string, string> = { garmin: "Garmin", strava: "Strava" }

interface FeedPostHeaderProps {
  post: {
    id: number
    user_id: number
    activity_id?: number | null
    user_name?: string | null
    user_username?: string | null
    user_avatar?: string | null
    user_club_name?: string | null
    activity_source?: string | null
    activity_is_open_water?: boolean | null
    activity_date?: string | null
    created_at: string
    user_level?: number | null
    user_is_online?: boolean | null
  }
  isOwner: boolean
  isFollowing?: boolean
}

export default function FeedPostHeader({ post, isOwner, isFollowing: initialIsFollowing }: FeedPostHeaderProps) {
  const baseName = post.user_name || post.user_username || "Nuotatore"
  const isActivityPost =
    Boolean(post.activity_id) ||
    Boolean(post.activity_source) ||
    post.activity_is_open_water != null
  const clubName = String(post.user_club_name ?? "").trim()
  const initials = getInitials(baseName)
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

  // «{club or source} · {time ago}» (Corsia feed): the club first, otherwise the sync source.
  const source = SOURCE_LABELS[String(post.activity_source ?? "").toLowerCase()] ?? null
  const context = clubName || (isActivityPost ? source : null)
  const timeReference =
    isActivityPost && post.activity_date ? post.activity_date : post.created_at
  const subtitle = [context, formatTimeAgo(timeReference)].filter(Boolean).join(" · ")

  return (
    <div className="flex items-center gap-3 pb-1 pt-4">
      <Link href={`/u/${post.user_id}`} aria-label={`Profilo di ${baseName}`} className="relative shrink-0">
        <Avatar className="size-11">
          <AvatarImage src={post.user_avatar || ""} alt="" />
          <AvatarFallback className="text-sm font-semibold">{initials}</AvatarFallback>
        </Avatar>
        {post.user_is_online ? (
          <span
            className="absolute -left-0.5 -top-0.5 size-3 rounded-full border-2 border-background bg-success"
            aria-hidden
          />
        ) : null}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <Link
            href={`/u/${post.user_id}`}
            className="truncate text-[15px] font-semibold text-foreground hover:underline"
          >
            {baseName}
          </Link>
          {post.user_level != null && post.user_level > 0 ? (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">Livello {post.user_level}</span>
          ) : null}
        </div>
        <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!isOwner && (
          <Button
            variant={isFollowing ? "ghost" : "outline"}
            size="sm"
            className="h-9 gap-1 px-3 text-sm"
            onClick={() => toggleFollow.mutate({ userId: post.user_id })}
            disabled={toggleFollow.isPending}
          >
            {/* The name is not on the button: the label carries the state («Seguendo»). On a
                phone the label is visually hidden but stays the accessible name. */}
            {isFollowing ? (
              <UserCheck className="size-4" aria-hidden />
            ) : (
              <UserPlus className="size-4" aria-hidden />
            )}
            <span className="sr-only sm:not-sr-only">
              {isFollowing ? "Seguendo" : "Segui"}
            </span>
            {" "}
            <span className="sr-only">{baseName}</span>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-11 rounded-full text-muted-foreground hover:text-foreground"
            >
              <MoreHorizontal className="size-5" aria-hidden />
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
                <Trash2 className="size-3.5" aria-hidden />
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
                  <Flag className="size-3.5" aria-hidden />
                  Segnala
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 text-xs"
                  disabled={hidePost.isPending}
                  onSelect={() => {
                    hidePost.mutate({ postId: post.id })
                  }}
                >
                  <EyeOff className="size-3.5" aria-hidden />
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
