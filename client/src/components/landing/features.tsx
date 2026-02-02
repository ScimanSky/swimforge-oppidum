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
    title: "Metriche Avanzate",
    description: "Pace, SWOLF, zone cardio e consistenza: insights chiari su ogni sessione.",
    badge: "Analisi",
  },
  {
    icon: Brain,
    title: "AI Coach",
    description: "Consigli personalizzati e allenamenti mirati per vasca e dryland.",
    badge: "AI",
  },
  {
    icon: Trophy,
    title: "Badge & XP",
    description: "Sblocca traguardi, ottieni XP e scala i livelli nuotando.",
    badge: "Progressi",
  },
  {
    icon: Users,
    title: "Community & Club",
    description: "Condividi sessioni, dai splash e partecipa ai club.",
    badge: "Social",
  },
  {
    icon: Zap,
    title: "Sync Dispositivi",
    description: "Integrazione con Garmin e Strava per importare tutto in un unico profilo.",
    badge: "Integrazioni",
  },
  {
    icon: TrendingUp,
    title: "Progressi Chiari",
    description: "Grafici e trend per capire dove migliori e dove spingere.",
    badge: "Trend",
  },
]

export function LandingFeatures() {
  return (
    <section id="features" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="outline" className="mb-4">Funzionalità</Badge>
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground text-balance">
            Tutto ciò che ti serve per crescere in acqua
          </h2>
          <p className="mt-4 text-muted-foreground">
            Dalla coaching AI alle sfide con gli amici, SwimForge ti accompagna vasca dopo vasca.
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

        <div className="mt-16 text-center text-sm text-muted-foreground">
          Pensato per piscina e acque libere, con analisi chiare e motivazione costante.
        </div>
      </div>
    </section>
  )
}
