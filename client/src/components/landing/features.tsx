import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import {
  Activity,
  Brain,
  Trophy,
  Users,
  Zap,
  TrendingUp,
} from "lucide-react"

const features = [
  {
    icon: Activity,
    title: "Advanced Metrics",
    description: "Pace, efficiency, load zones - get deep insights into every swim session with our powerful analytics engine.",
    badge: "Analytics",
  },
  {
    icon: Brain,
    title: "AI Coaching",
    description: "Personalized training plans and real-time feedback powered by advanced machine learning algorithms.",
    badge: "AI-Powered",
  },
  {
    icon: Trophy,
    title: "Gamification",
    description: "Earn XP, unlock badges, level up your swimmer profile. Stay motivated with achievements and milestones.",
    badge: "Rewards",
  },
  {
    icon: Users,
    title: "Social Hub",
    description: "Join clubs, share sessions, give Splash kudos. Connect with swimmers from around the world.",
    badge: "Community",
  },
  {
    icon: Zap,
    title: "Device Sync",
    description: "Seamlessly sync with Garmin, Strava, and other popular fitness platforms. Your data, unified.",
    badge: "Integration",
  },
  {
    icon: TrendingUp,
    title: "Progress Tracking",
    description: "Visualize your improvement over time with beautiful charts and performance comparisons.",
    badge: "Insights",
  },
]

export function LandingFeatures() {
  return (
    <section id="features" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="outline" className="mb-4">Features</Badge>
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground text-balance">
            Everything you need to dominate the water
          </h2>
          <p className="mt-4 text-muted-foreground">
            From AI-powered coaching to social competitions, SwimForge has all the tools to take your swimming to the next level.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group p-6 rounded-xl bg-card border border-border hover:border-primary/50 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <Badge variant="secondary" className="mb-3 text-xs">
                {feature.badge}
              </Badge>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Feature Showcase */}
        <div className="mt-20 grid lg:grid-cols-2 gap-8 items-center">
          <div className="relative aspect-[4/3] rounded-2xl overflow-hidden">
            <Image
              src="/images/pool-lanes.jpg"
              alt="Swimming pool lanes"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <div className="bg-card/90 backdrop-blur-sm rounded-xl p-4 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-foreground">Today&apos;s Session</span>
                  <Badge className="bg-accent text-accent-foreground">Pool</Badge>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-2xl font-display font-bold text-primary">2.4km</p>
                    <p className="text-xs text-muted-foreground">Distance</p>
                  </div>
                  <div>
                    <p className="text-2xl font-display font-bold text-foreground">1:42</p>
                    <p className="text-xs text-muted-foreground">Avg Pace/100m</p>
                  </div>
                  <div>
                    <p className="text-2xl font-display font-bold text-accent">+85</p>
                    <p className="text-xs text-muted-foreground">XP Earned</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-2xl sm:text-3xl font-display font-bold text-foreground">
              Real-time performance tracking
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Every stroke counts. Our advanced metrics engine analyzes your swimming data to provide insights you won&apos;t find anywhere else. From SWOLF scores to stroke rate consistency, we&apos;ve got you covered.
            </p>
            <ul className="space-y-3">
              {[
                "Automatic lap detection and split times",
                "Heart rate zone analysis",
                "Stroke efficiency scoring",
                "Recovery recommendations",
              ].map((item, index) => (
                <li key={index} className="flex items-center gap-3 text-sm text-foreground">
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
