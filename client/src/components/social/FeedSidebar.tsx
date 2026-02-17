import { useState } from "react"
import { Link } from "wouter"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { UserCheck, UserPlus } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { getInitials } from "@/lib/format"

function SuggestedUserRow({ user }: { user: { userId: number; name: string | null; username: string | null; avatarUrl: string | null; level: number | null } }) {
  const displayName = user.username || user.name || `#${user.userId}`
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
        variant={isFollowing ? "ghost-neon" : "outline-neon"}
        size="sm"
        className="h-7 text-[10px] gap-1 px-2 shrink-0"
        onClick={() => toggleFollow.mutate({ userId: user.userId })}
        disabled={toggleFollow.isPending}
      >
        {isFollowing ? (
          <>
            <UserCheck className="size-3" />
            Seguendo
          </>
        ) : (
          <>
            <UserPlus className="size-3" />
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
  const suggestedUsers = suggestedQuery.data ?? []

  return (
    <div className="space-y-4">
      {/* Suggested users */}
      <div className="surface-panel p-4">
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Suggeriti per te</h3>
        {suggestedUsers.length > 0 ? (
          <div className="space-y-2.5">
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
  )
}
