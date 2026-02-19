import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { Trophy, Medal, Star } from "lucide-react"

const athletes = [
  {
    name: "Sarah Chen",
    title: "Olympic Trialist",
    image: "/images/athlete-1.jpg",
    stats: { distance: "1,234 km", level: 42, badges: 28 },
    quote: "SwimForge transformed how I train. The AI insights are game-changing.",
  },
  {
    name: "Marcus Rivera",
    title: "Masters Champion",
    image: "/images/athlete-2.jpg",
    stats: { distance: "892 km", level: 35, badges: 21 },
    quote: "The community features keep me motivated. Best swim app I've ever used.",
  },
  {
    name: "Emma Thompson",
    title: "Open Water Specialist",
    image: "/images/athlete-3.jpg",
    stats: { distance: "2,156 km", level: 58, badges: 45 },
    quote: "From pool to ocean, SwimForge tracks everything perfectly.",
  },
]

export function LandingAthletes() {
  return (
    <section id="athletes" className="py-24 bg-card">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="outline" className="mb-4">Community</Badge>
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground text-balance">
            Meet our top swimmers
          </h2>
          <p className="mt-4 text-muted-foreground">
            Join thousands of swimmers who are crushing their goals with SwimForge.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {athletes.map((athlete, index) => (
            <div
              key={index}
              className="group bg-background rounded-2xl overflow-hidden border border-border hover:border-primary/50 transition-all duration-300"
            >
              <div className="relative aspect-[4/5]">
                <Image
                  src={athlete.image || "/placeholder.svg"}
                  alt={athlete.name}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <Badge className="mb-2 bg-primary/90 text-primary-foreground">
                    Level {athlete.stats.level}
                  </Badge>
                  <h3 className="text-xl font-display font-bold text-foreground">
                    {athlete.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">{athlete.title}</p>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-sm text-muted-foreground italic">
                  &ldquo;{athlete.quote}&rdquo;
                </p>

                <div className="grid grid-cols-3 gap-2 pt-4 border-t border-border">
                  <div className="text-center">
                    <Trophy className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="text-xs font-medium text-foreground">{athlete.stats.distance}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div className="text-center">
                    <Star className="w-4 h-4 text-accent mx-auto mb-1" />
                    <p className="text-xs font-medium text-foreground">Lv. {athlete.stats.level}</p>
                    <p className="text-xs text-muted-foreground">Level</p>
                  </div>
                  <div className="text-center">
                    <Medal className="w-4 h-4 text-chart-4 mx-auto mb-1" />
                    <p className="text-xs font-medium text-foreground">{athlete.stats.badges}</p>
                    <p className="text-xs text-muted-foreground">Badges</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
