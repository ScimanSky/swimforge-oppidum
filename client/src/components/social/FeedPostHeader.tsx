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
  PencilLine,
  Trash2,
} from "lucide-react"
import { formatTimeAgo, getInitials } from "@/lib/format"
import { trpc } from "@/lib/trpc"
import { errorToastMessage } from "@/lib/trpc-errors"
import { toast } from "sonner"
import { EditPostSheet } from "./EditPostSheet"

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
  const [editOpen, setEditOpen] = useState(false)

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
      // On the post's own page there is nothing left to show: back to the feed (replacing the
      // entry, so «Indietro» does not open the deleted post again).
      if (location === `/post/${post.id}`) setLocation("/home", { replace: true })
      utils.community.feed.invalidate()
      utils.community.clubs.feed.invalidate()
      utils.community.postById.invalidate({ postId: post.id })
      // A shared swim goes back to «Condividi».
      if (post.activity_id) {
        utils.activities.list.invalidate()
        utils.activities.get.invalidate({ id: post.activity_id })
        utils.community.unsharedActivities.invalidate()
        utils.community.latestSwim.invalidate()
      }
    },
    onError: (err) => toast.error(errorToastMessage(err, "Non riesco a eliminare il post.")),
  })

  // «{club or source} · {time ago}» (Corsia feed): the club first, otherwise the sync source.
  const source = SOURCE_LABELS[String(post.activity_source ?? "").toLowerCase()] ?? null
  const context = clubName || (isActivityPost ? source : null)
  const timeReference =
    isActivityPost && post.activity_date ? post.activity_date : post.created_at
  const subtitle = [context, formatTimeAgo(timeReference)].filter(Boolean).join(" · ")

  return (
    <div className="flex items-center gap-3 pb-1 pt-4">
      <Link href={`/u/${post.user_id}`} aria-label={`Profilo di ${baseName}`} className="shrink-0">
        <Avatar className="size-11">
          <AvatarImage src={post.user_avatar || ""} alt="" />
          <AvatarFallback className="text-sm font-semibold">{initials}</AvatarFallback>
        </Avatar>
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
              <>
                <DropdownMenuItem className="gap-2 text-sm" onSelect={() => setEditOpen(true)}>
                  <PencilLine className="size-4" aria-hidden />
                  Modifica
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 text-sm text-destructive focus:text-destructive"
                  disabled={deletePost.isPending}
                  onSelect={() => {
                    const confirmed = window.confirm("Eliminare questo post? Sparisce per tutti.")
                    if (!confirmed) return
                    deletePost.mutate({ postId: post.id })
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                  {deletePost.isPending ? "Elimino…" : "Elimina"}
                </DropdownMenuItem>
              </>
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
      {/* Mounted only while open: the post is loaded when the author asks to edit it. */}
      {isOwner && editOpen ? (
        <EditPostSheet open onOpenChange={setEditOpen} postRef={{ postId: post.id }} />
      ) : null}
    </div>
  )
}
