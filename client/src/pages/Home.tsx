import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { MetricOrb } from "@/components/metrics/MetricOrb";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Activity,
  ArrowRight,
  Brain,
  TrendingUp,
  Trophy,
  Users,
  Waves,
  Zap,
  Sun,
  Moon,
} from "lucide-react";
import { Link } from "wouter";
import { useEffect } from "react";

const features = [
  {
    icon: Activity,
    title: "Metriche Avanzate",
    description:
      "Pace, SWOLF, zone cardio e consistenza: insights chiari su ogni sessione.",
    badge: "Analisi",
    backgroundImageSrc: "/images/detailed_stats_graph.webp",
  },
  {
    icon: Brain,
    title: "AI Coach",
    description: "Consigli personalizzati e allenamenti mirati per vasca e dryland.",
    badge: "AI",
    backgroundImageSrc: "/images/ai_coach_digital.webp",
  },
  {
    icon: Trophy,
    title: "Badge & XP",
    description: "Sblocca traguardi, ottieni XP e scala i livelli nuotando.",
    badge: "Progressi",
    backgroundImageSrc: "/images/awards_trophies.webp",
  },
  {
    icon: Users,
    title: "Community & Club",
    description: "Condividi sessioni, dai splash e partecipa ai club.",
    badge: "Social",
    backgroundImageSrc: "/images/swimmers_team_community.webp",
  },
  {
    icon: Zap,
    title: "Sync Dispositivi",
    description:
      "Integrazione con Garmin e Strava per importare tutto in un unico profilo.",
    badge: "Integrazioni",
    backgroundImageSrc: "/images/swimmer_smartwatch_tech.webp",
  },
  {
    icon: TrendingUp,
    title: "Progressi Chiari",
    description: "Grafici e trend per capire dove migliori e dove spingere.",
    badge: "Trend",
    backgroundImageSrc: "/images/predictive_analytics_speed.webp",
  },
];

const stats = [
  { value: "20", label: "Livelli", description: "da sbloccare" },
  { value: "40+", label: "Badge", description: "di progressione" },
  { value: "∞", label: "XP", description: "da guadagnare" },
];

function FeatureCard({
  icon,
  title,
  description,
  badge,
  backgroundImageSrc,
}: {
  icon: typeof Activity;
  title: string;
  description: string;
  badge: string;
  backgroundImageSrc?: string;
}) {
  const Icon = icon;
  return (
    <Card className="relative overflow-hidden border-border/50 bg-card/50 backdrop-blur transition-all hover:border-primary/30 hover:shadow-md">
      {backgroundImageSrc && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <img
            src={backgroundImageSrc}
            alt=""
            className="h-full w-full object-cover opacity-15"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-background/40 via-background/70 to-background/90" />
        </div>
      )}
      <CardContent className="relative pt-6">
        <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-6" />
        </div>
        <Badge variant="neon" className="mb-3 text-xs">
          {badge}
        </Badge>
        <h3 className="mb-2 text-lg font-semibold text-foreground">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { theme, toggleTheme, switchable } = useTheme();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) return;
    window.location.href = "/dashboard";
  }, [isAuthenticated, loading]);

  if (loading || isAuthenticated) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background dark:bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_rgba(15,23,42,0.9)_45%,_rgba(2,6,23,1)_100%)]">
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <img
              src="/swimforge-logo.png"
              alt="SwimForge"
              className="size-12 drop-shadow-sm"
            />
            <span className="text-2xl font-semibold text-foreground">
              SwimForge
            </span>
          </div>
          <nav className="hidden items-center gap-6 md:flex">
            <a
              href="#features"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Funzionalità
            </a>
            <a
              href="#progress"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Progressi
            </a>
            <a
              href="#features"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Club
            </a>
          </nav>
          {switchable && toggleTheme && (
            <Button
              type="button"
              variant="ghost-neon"
              size="icon"
              onClick={toggleTheme}
              aria-label="Cambia tema"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          )}
        </div>
      </header>

      <section className="relative overflow-hidden pt-16">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/15 via-background to-background" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 md:px-6 md:py-32 lg:py-40">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="neon" className="mb-6">
              Analisi AI • Gamification • Community
            </Badge>
            <h1 className="mb-6 text-balance text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl">
              <span className="neon-gradient-text">SwimForge</span>
              <span className="block text-primary">Forgia il tuo percorso</span>
            </h1>
            <p className="mb-8 text-pretty text-lg text-muted-foreground md:text-xl">
              La piattaforma esclusiva per nuotatori di tutte le età. Trasforma
              ogni allenamento in un&apos;avventura epica, con sincronizzazione
              Garmin e Strava, XP, badge e analisi avanzate.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/signup"
                className={cn(buttonVariants({ size: "lg", variant: "neon" }))}
              >
                Inizia l&apos;avventura
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="progress" className="border-y border-border bg-card/50 py-16">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              { ...stats[0], icon: <TrendingUp className="size-4" />, progress: 72, tone: "cyan" as const },
              { ...stats[1], icon: <Trophy className="size-4" />, progress: 82, tone: "lime" as const },
              { ...stats[2], icon: <Zap className="size-4" />, progress: 100, tone: "amber" as const },
            ].map((stat) => (
              <MetricOrb
                key={stat.label}
                label={stat.label}
                value={stat.value}
                progress={stat.progress}
                helper={stat.description}
                icon={stat.icon}
                tone={stat.tone}
                size="sm"
              />
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="py-24">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <Badge variant="neon" className="mb-4">
              Funzionalità
            </Badge>
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
              Tutto ciò che ti serve per crescere in acqua
            </h2>
            <p className="mt-4 text-muted-foreground">
              Dalla coaching AI alle sfide con gli amici, SwimForge ti accompagna
              vasca dopo vasca.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>

          <div className="mt-16 text-center text-sm text-muted-foreground">
            Pensato per piscina e acque libere, con analisi chiare e motivazione
            costante.
          </div>
        </div>
      </section>

      <section id="cta" className="relative overflow-hidden py-24">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute left-0 top-0 size-96 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute bottom-0 right-0 size-96 rounded-full bg-accent/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 md:px-6">
          <div className="relative grid gap-10 overflow-hidden rounded-3xl border border-border bg-card/60 p-10 backdrop-blur lg:grid-cols-[auto_1fr]">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <img
                src="/images/swimmer_action_hero.webp"
                alt=""
                className="h-full w-full object-cover opacity-10"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-br from-background/30 via-background/75 to-background/95" />
            </div>
            <div className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Waves className="size-8" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
                Pronto a iniziare la tua avventura?
              </h2>
              <p className="mt-4 max-w-2xl text-muted-foreground">
                Registra ogni allenamento, sblocca badge e ottieni insight concreti
                per migliorare.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/signup"
                  className={cn(buttonVariants({ size: "lg", variant: "neon" }))}
                >
                  Inizia l&apos;Avventura
                  <ArrowRight className="ml-2 size-4" />
                </Link>
                <Link
                  href="/login"
                  className={cn(buttonVariants({ variant: "outline-neon", size: "lg" }))}
                >
                  Accedi
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-12 md:px-6 lg:py-16">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-4">
            <div className="col-span-2 md:col-span-3 lg:col-span-1">
              <Link href="/" className="mb-4 flex items-center gap-2">
                <img
                  src="/swimforge-logo.png"
                  alt="SwimForge"
                  className="size-9"
                />
                <span className="text-xl font-bold text-foreground">
                  SwimForge
                </span>
              </Link>
              <p className="max-w-xs text-sm text-muted-foreground">
                La piattaforma per nuotatori che vogliono crescere, competere e
                divertirsi.
              </p>
            </div>

            <div>
              <h4 className="mb-4 font-semibold text-foreground">Prodotto</h4>
              <ul className="space-y-3">
                <li>
                  <a
                    href="#features"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Funzionalità
                  </a>
                </li>
                <li>
                  <a
                    href="#progress"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Progressi
                  </a>
                </li>
                <li>
                  <a
                    href="#features"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Club
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 font-semibold text-foreground">Supporto</h4>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/login"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Accedi
                  </Link>
                </li>
                <li>
                  <Link
                    href="/signup"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Registrati
                  </Link>
                </li>
                <li>
                  <a
                    href="#features"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    AI Coach
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 font-semibold text-foreground">Legale</h4>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/privacy"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Termini
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              2026 SwimForge. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
