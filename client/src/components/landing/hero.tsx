"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

export function LandingHero() {
  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/theme-v3/landing-hero.jpg"
          alt="Swimmer in action"
          fill
          className="object-cover"
          priority
        />
        <Image
          src="/images/theme-v3/overlay-caustics.png"
          alt=""
          fill
          className="object-cover opacity-20 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/50" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-2xl">
          <Badge variant="neon" className="mb-6">
            Analisi AI • Gamification • Community
          </Badge>

          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-display font-bold text-foreground leading-tight text-balance">
            SwimForge
            <span className="text-primary block">Forgi il tuo percorso</span>
          </h1>

          <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-xl">
            La piattaforma esclusiva per nuotatori di tutte le età. Trasforma ogni allenamento in
            un&apos;avventura epica, con sincronizzazione Garmin e Strava, XP, badge e analisi avanzate.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-8">
            <Button size="lg" variant="neon" className="text-base h-12 px-8" asChild>
              <Link href="/signup">
                Inizia l&apos;Avventura
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
            <Button size="lg" variant="outline-neon" className="text-base h-12 px-8 bg-transparent" asChild>
              <Link href="/login">Accedi</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <div className="w-6 h-10 rounded-full border-2 border-muted-foreground/30 flex justify-center pt-2">
          <div className="w-1 h-3 bg-primary rounded-full animate-bounce" />
        </div>
      </div>
    </section>
  )
}
