import { useMemo } from "react"
import { Link } from "wouter"
import { UserPlus } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { trpc } from "@/lib/trpc"
import { getInitials } from "@/lib/format"
import { toast } from "sonner"

type SuggestedUser = {
  userId: number
  name: string | null
  username: string | null
  avatarUrl: string | null
  level: number | null
}

type FollowStarterState = {
  followingCount: number
  target: number
  remaining: number
  suggestedUsers: SuggestedUser[]
}

interface FollowStarterCardProps {
  state?: FollowStarterState
  isLoading?: boolean
}

export default function FollowStarterCard({ state, isLoading = false }: FollowStarterCardProps) {
  const utils = trpc.useUtils()
  const toggleFollow = trpc.community.users.toggleFollow.useMutation({
    onSuccess: async (result) => {
      if (!result.following) return
      toast.success("Profilo seguito")
      await Promise.all([
        utils.community.users.followStarter.invalidate(),
        utils.community.users.suggested.invalidate(),
        utils.community.feed.invalidate(),
      ])
    },
    onError: (error) => {
      toast.error(error.message || "Impossibile seguire questo profilo.")
    },
  })

  const progress = useMemo(() => {
    if (!state || state.target <= 0) return 0
    return Math.min(100, Math.round((state.followingCount / state.target) * 100))
  }, [state])

  if (isLoading) {
    return (
      <div className="surface-panel p-4">
        <p className="text-sm text-muted-foreground">Caricamento suggerimenti…</p>
      </div>
    )
  }

  if (!state || state.remaining <= 0) {
    return null
  }

  return (
    <section className="surface-panel p-4 space-y-3">
      <div className="space-y-1">
        <h2 className="text-[15px] font-bold text-foreground">
          Segui {state.remaining} nuotator{state.remaining === 1 ? "e" : "i"} per personalizzare il feed
        </h2>
        <p className="text-sm text-muted-foreground">
          Suggeriti in base a livello e attività recente nella community.
        </p>
        <Progress
          value={progress}
          className="mt-2 h-2"
          aria-label={`Profili seguiti: ${state.followingCount} su ${state.target}`}
        />
      </div>

      {state.suggestedUsers.length > 0 ? (
        <div className="space-y-2">
          {state.suggestedUsers.slice(0, 3).map((user) => {
            const displayName = user.username || user.name || `#${user.userId}`
            return (
              <div key={user.userId} className="flex items-center gap-2">
                <Link href={`/u/${user.userId}`}>
                  <Avatar className="size-10 cursor-pointer">
                    <AvatarImage src={user.avatarUrl || ""} alt={displayName} />
                    <AvatarFallback className="text-xs font-semibold">
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/u/${user.userId}`} className="block truncate text-sm font-medium hover:underline">
                    {displayName}
                  </Link>
                  {user.level != null ? (
                    <p className="text-xs text-muted-foreground">Livello {user.level}</p>
                  ) : null}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1"
                  onClick={() => toggleFollow.mutate({ userId: user.userId })}
                  disabled={toggleFollow.isPending}
                >
                  <UserPlus className="size-4" aria-hidden />
                  Segui
                </Button>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nessun suggerimento disponibile al momento.</p>
      )}
    </section>
  )
}
