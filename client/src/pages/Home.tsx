import { LandingHero } from "@/components/landing/hero"
import { LandingFeatures } from "@/components/landing/features"
import { LandingStats } from "@/components/landing/stats"
import { LandingCTA } from "@/components/landing/cta"
import { LandingFooter } from "@/components/landing/footer"
import { LandingNav } from "@/components/landing/nav"

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <LandingNav />
      <LandingHero />
      <LandingStats />
      <LandingFeatures />
      <LandingCTA />
      <LandingFooter />
    </main>
  )
}
