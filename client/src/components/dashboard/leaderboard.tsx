import { Surface, SurfaceContent, SurfaceHeader, SurfaceTitle } from "@/components/ui/surface"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ChevronRight, Trophy } from "lucide-react"
import Link from "next/link"

type LeaderboardEntry = {
  rank: number
  name: string
  avatar?: string | null
  initials: string
  value: string
  isCurrentUser?: boolean
}

type LeaderboardProps = {
  entries: LeaderboardEntry[]
  isLoading?: boolean
}

export function Leaderboard({ entries, isLoading }: LeaderboardProps) {
  return (
    <Surface className="bg-card border-border">
      <SurfaceHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-chart-4" />
            <SurfaceTitle className="text-lg font-display font-bold text-foreground">
              Weekly Leaderboard
            </SurfaceTitle>
          </div>
        </div>
      </SurfaceHeader>
      <SurfaceContent className="space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))
        ) : entries.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            No rankings yet.
          </div>
        ) : (
          entries.map((user) => (
            <div
              key={user.rank}
              className={`flex items-center gap-3 p-3 rounded-lg ${
                user.isCurrentUser
                  ? "bg-primary/10 border border-primary/30"
                  : "bg-secondary/30"
              }`}
            >
              <span
                className={`w-6 h-6 flex items-center justify-center text-sm font-bold rounded-full ${
                  user.rank === 1
                    ? "bg-chart-4 text-primary-foreground"
                    : user.rank === 2
                    ? "bg-muted-foreground/30 text-foreground"
                    : "bg-accent/30 text-accent"
                }`}
              >
                {user.rank}
              </span>
              <Avatar className="w-8 h-8">
                <AvatarImage src={user.avatar || "/placeholder.svg"} alt={user.name} />
                <AvatarFallback>{user.initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user.name}
                </p>
              </div>
              <p className="text-sm font-display font-bold text-foreground">
                {user.value}
              </p>
            </div>
          ))
        )}

        <Button variant="ghost" size="sm" className="w-full mt-2" asChild>
          <Link href="/challenges">
            View full rankings
            <ChevronRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </SurfaceContent>
    </Surface>
  )
}
