import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Waves } from "lucide-react"

export function LandingCTA() {
  return (
    <section id="cta" className="py-24 bg-background relative overflow-hidden">
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
                Pronto a iniziare la tua avventura?
              </h2>

              <p className="mt-4 text-muted-foreground leading-relaxed">
                Registra ogni allenamento, sblocca badge e ottieni insight concreti per migliorare.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mt-8">
                <Button size="lg" className="text-base h-12 px-8" asChild>
                  <Link href="/signup">
                    Inizia l&apos;Avventura
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="text-base h-12 px-8 bg-transparent" asChild>
                  <Link href="/login">Accedi</Link>
                </Button>
              </div>
            </div>

            <div className="relative aspect-square lg:aspect-auto">
              <Image
                src="/images/theme-v3/landing-tour-poster.png"
                alt="Open water swimming"
                fill
                className="object-cover"
              />
              <Image
                src="/images/theme-v3/overlay-energy.png"
                alt=""
                fill
                className="object-cover opacity-[0.15] mix-blend-screen"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-card to-transparent lg:block hidden" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
