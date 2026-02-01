"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Play, Zap } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

export function LandingHero() {
  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/hero-swimmer.jpg"
          alt="Swimmer in action"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/50" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-2xl">
          <Badge variant="outline" className="mb-6 border-primary/50 text-primary">
            <Zap className="w-3 h-3 mr-1" />
            AI-Powered Swimming Analytics
          </Badge>

          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-display font-bold text-foreground leading-tight text-balance">
            Forge Your
            <span className="text-primary block">Swimming Legacy</span>
          </h1>

          <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-xl">
            Track every stroke, earn XP, compete with friends. SwimForge syncs with Garmin and Strava to deliver AI-powered coaching insights for pool and open water swimmers.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-8">
            <Button size="lg" className="text-base h-12 px-8" asChild>
              <Link href="/signup">
                Start Free Trial
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-base h-12 px-8 group bg-transparent">
              <Play className="w-4 h-4 mr-2 group-hover:text-primary transition-colors" />
              Watch Demo
            </Button>
          </div>

          <div className="flex items-center gap-6 mt-10 pt-10 border-t border-border/50">
            <div className="flex -space-x-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-10 h-10 rounded-full border-2 border-background overflow-hidden"
                >
                  <Image
                    src={`/images/athlete-${i}.jpg`}
                    alt={`Athlete ${i}`}
                    width={40}
                    height={40}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Join 12,000+ swimmers</p>
              <p className="text-xs text-muted-foreground">Rated 4.9/5 on App Store</p>
            </div>
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
