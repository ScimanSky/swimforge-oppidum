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
import { MoreHorizontal, UserCheck, UserPlus, Flag, EyeOff } from "lucide-react"
import { formatTimeAgo, getInitials } from "@/lib/format"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"

interface FeedPostHeaderProps {
  post: {
    id: number
    user_id: number
    user_name?: string | null
    user_email?: string | null
    user_avatar?: string | null
    activity_source?: string | null
    activity_is_open_water?: boolean | null
    created_at: string
    user_level?: number | null
  }
  isOwner: boolean
  isFollowing?: boolean
}

export default function FeedPostHeader({ post, isOwner, isFollowing: initialIsFollowing }: FeedPostHeaderProps) {
  const name = post.user_name || post.user_email?.split("@")[0] || "Nuotatore"
  const initials = getInitials(name)
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
      toast.success(result.following ? `Segui ${name}` : `Non segui più ${name}`)
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

  // Build source line: "Strava · Pool · 2h fa"
  const sourceParts: string[] = []
  if (post.activity_source) sourceParts.push(post.activity_source)
  if (post.activity_is_open_water != null) sourceParts.push(activityType)
  sourceParts.push(formatTimeAgo(post.created_at))

  return (
    <div className="flex items-center gap-3 px-4 pt-3">
      <Link href={`/u/${post.user_id}`}>
        <Avatar className="size-11 border-2 border-border/60 cursor-pointer ring-2 ring-transparent hover:ring-[var(--electric-cyan)]/30 transition-all">
          <AvatarImage src={post.user_avatar || ""} alt={name} />
          <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
        </Avatar>
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Link
            href={`/u/${post.user_id}`}
            className="font-bold text-sm text-foreground truncate hover:underline"
          >
            {name}
          </Link>
          {post.user_level != null && post.user_level > 0 && (
            <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[linear-gradient(135deg,color-mix(in_oklch,var(--electric-cyan)_20%,transparent),color-mix(in_oklch,var(--electric-lime)_16%,transparent))] text-foreground/80">
              Lv.{post.user_level}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{sourceParts.join(" · ")}</p>
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
                Seguendo
              </>
            ) : (
              <>
                <UserPlus className="h-3.5 w-3.5" />
                Segui
              </>
            )}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="size-8 rounded-full text-muted-foreground hover:text-foreground">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
