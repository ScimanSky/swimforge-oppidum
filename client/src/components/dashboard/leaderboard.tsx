import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ChevronRight, Trophy } from "lucide-react"
import Link from "next/link"

const leaderboard = [
  {
    rank: 1,
    name: "You",
    avatar: "/images/athlete-1.jpg",
    initials: "SC",
    distance: "12.4 km",
    isCurrentUser: true,
  },
  {
    rank: 2,
    name: "Marcus R.",
    avatar: "/images/athlete-2.jpg",
    initials: "MR",
    distance: "11.8 km",
    isCurrentUser: false,
  },
  {
    rank: 3,
    name: "Emma T.",
    avatar: "/images/athlete-3.jpg",
    initials: "ET",
    distance: "10.2 km",
    isCurrentUser: false,
  },
]

export function Leaderboard() {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-chart-4" />
            <CardTitle className="text-lg font-display font-bold text-foreground">
              Weekly Leaderboard
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {leaderboard.map((user) => (
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
              {user.distance}
            </p>
          </div>
        ))}

        <Button variant="ghost" size="sm" className="w-full mt-2" asChild>
          <Link href="/challenges">
            View full rankings
            <ChevronRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
