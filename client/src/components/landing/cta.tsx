import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Waves } from "lucide-react"

export function LandingCTA() {
  return (
    <section className="py-24 bg-background relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-0 left-0 w-96 h-96 bg-primary rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-accent rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="bg-card border border-border rounded-3xl overflow-hidden">
          <div className="grid lg:grid-cols-2">
            <div className="p-8 lg:p-12 flex flex-col justify-center">
              <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-6">
                <Waves className="w-8 h-8 text-primary-foreground" />
              </div>

              <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground text-balance">
                Ready to transform your swimming?
              </h2>

              <p className="mt-4 text-muted-foreground leading-relaxed">
                Join thousands of swimmers who are already using SwimForge to track their progress, compete with friends, and unlock their full potential in the water.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mt-8">
                <Button size="lg" className="text-base h-12 px-8" asChild>
                  <Link href="/signup">
                    Start Free Trial
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="text-base h-12 px-8 bg-transparent" asChild>
                  <Link href="#pricing">View Pricing</Link>
                </Button>
              </div>

              <p className="mt-6 text-xs text-muted-foreground">
                Free 14-day trial. No credit card required.
              </p>
            </div>

            <div className="relative aspect-square lg:aspect-auto">
              <Image
                src="/images/open-water.jpg"
                alt="Open water swimming"
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-card to-transparent lg:block hidden" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
