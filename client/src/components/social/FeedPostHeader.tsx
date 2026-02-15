import { Link } from "wouter"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { UserPlus } from "lucide-react"
import { formatTimeAgo, getInitials } from "@/lib/format"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"

interface FeedPostHeaderProps {
  post: {
    user_id: number
    user_name?: string | null
    user_email?: string | null
    user_avatar?: string | null
    activity_source?: string | null
    activity_is_open_water?: boolean | null
    created_at: string
  }
  isOwner: boolean
  isFollowing?: boolean
}

export default function FeedPostHeader({ post, isOwner, isFollowing }: FeedPostHeaderProps) {
  const name = post.user_name || post.user_email?.split("@")[0] || "Nuotatore"
  const initials = getInitials(name)
  const activityType = post.activity_is_open_water ? "Open Water" : "Pool"

  const toggleFollow = trpc.community.users.toggleFollow.useMutation({
    onSuccess: () => toast.success("Fatto!"),
    onError: (err) => toast.error(err.message),
  })

  return (
    <div className="flex items-start gap-3">
      <Link href={`/u/${post.user_id}`}>
        <Avatar className="h-10 w-10 border border-border cursor-pointer">
          <AvatarImage src={post.user_avatar || ""} alt={name} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link
            href={`/u/${post.user_id}`}
            className="font-semibold text-foreground truncate hover:underline"
          >
            {name}
          </Link>
          {post.activity_source ? (
            <Badge variant="neon" className="text-[10px]">
              {post.activity_source}
            </Badge>
          ) : null}
          {post.activity_is_open_water != null && (
            <Badge
              variant="outline"
              className={
                activityType === "Pool"
                  ? "border-primary/40 text-primary text-[10px]"
                  : "border-accent/40 text-accent text-[10px]"
              }
            >
              {activityType}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{formatTimeAgo(post.created_at)}</p>
      </div>
      {!isOwner && !isFollowing && (
        <Button
          variant="outline-neon"
          size="sm"
          className="gap-1 shrink-0"
          onClick={() => toggleFollow.mutate({ userId: post.user_id })}
          disabled={toggleFollow.isPending}
        >
          <UserPlus className="h-3.5 w-3.5" />
          Segui
        </Button>
      )}
    </div>
  )
}
