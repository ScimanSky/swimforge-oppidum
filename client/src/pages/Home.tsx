import { buttonVariants } from "@/components/ui/button";
import { SwimForgeMark, SwimForgeWordmark } from "@/components/brand/SwimForgeBrand";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { useEffect } from "react";

const valueProps = [
  {
    title: "AI Coach",
    body: "L'analisi tecnica evidenzia inefficienze e priorita con indicazioni chiare per la prossima sessione.",
    image: "/images/landing-bw/feature-ai.webp",
    alt: "Dettaglio tecnico in piscina per analisi AI",
  },
  {
    title: "Progressi",
    body: "Trend e metriche essenziali per misurare i miglioramenti nel tempo senza rumore visivo.",
    image: "/images/landing-bw/feature-progress.webp",
    alt: "Corsie piscina viste dall'alto in bianco e nero",
  },
  {
    title: "Community Club",
    body: "Atleti e coach nello stesso spazio operativo, con convocazioni, comunicazioni e allineamento continuo.",
    image: "/images/landing-bw/feature-community.webp",
    alt: "Team nuoto in bordo vasca durante briefing",
  },
];

const workflowSteps = [
  {
    step: "01",
    title: "Sync",
    body: "Connetti le tue attivita e centralizza i dati in un unico profilo operativo.",
  },
  {
    step: "02",
    title: "Analisi",
    body: "Ricevi insight leggibili e prioritizzati per capire dove intervenire subito.",
  },
  {
    step: "03",
    title: "Crescita",
    body: "Trasforma i feedback in una progressione costante con obiettivi realistici.",
  },
];

const galleryShots = [
  {
    src: "/images/landing-bw/gallery-01.webp",
    alt: "Nuotatore in preparazione prima della gara",
    caption: "Preparazione",
  },
  {
    src: "/images/landing-bw/gallery-02.webp",
    alt: "Nuotatori allineati bordo piscina in bianco e nero",
    caption: "Disciplina",
  },
  {
    src: "/images/landing-bw/gallery-03.webp",
    alt: "Dettaglio tecnico atleta con smartwatch",
    caption: "Precisione",
  },
];

export default function Home() {
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) return;
    window.location.href = "/home";
  }, [isAuthenticated, loading]);

  if (loading || isAuthenticated) {
    return <div className="min-h-screen bg-[#0a0a0a]" />;
  }

  return (
    <div className="landing-shell bg-[#0a0a0a] text-zinc-100">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2 rounded-md px-1 py-1">
            <SwimForgeMark className="size-8" />
            <SwimForgeWordmark compact className="text-sm md:text-base" />
          </Link>
          <nav className="hidden items-center gap-7 text-xs uppercase tracking-[0.16em] text-zinc-300 md:flex">
            <a href="#value" className="hover:text-[var(--landing-accent)] transition-colors">Value</a>
            <a href="#workflow" className="hover:text-[var(--landing-accent)] transition-colors">Metodo</a>
            <a href="#gallery" className="hover:text-[var(--landing-accent)] transition-colors">Galleria</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className={cn(buttonVariants({ variant: "outline-neon", size: "sm" }), "min-h-[44px] px-4")}>Accedi</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="landing-grain relative overflow-hidden border-b border-white/10 pt-20">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 md:px-6 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-end lg:gap-14">
            <div className="landing-reveal space-y-7" style={{ animationDelay: "40ms" }}>
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">SwimForge.it</p>
              <h1 className="text-balance font-display text-5xl font-semibold leading-[0.9] tracking-tight text-white md:text-7xl lg:text-8xl">
                Forgia la tua <span className="text-zinc-400 italic">prestazione</span>.
              </h1>
              <p className="max-w-xl border-l border-[var(--landing-accent)] pl-5 text-base text-zinc-300 md:text-lg">
                Una landing iconica, essenziale e ad alto contrasto per raccontare nuoto, disciplina e progresso.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className={cn(buttonVariants({ variant: "neon", size: "lg" }), "min-h-[48px] w-full sm:w-auto")}
                >
                  Inizia ora <ArrowRight className="ml-2 size-4" />
                </Link>
                <Link
                  href="/login"
                  className={cn(buttonVariants({ variant: "outline-neon", size: "lg" }), "min-h-[48px] w-full sm:w-auto")}
                >
                  Accedi
                </Link>
              </div>
            </div>

            <figure className="landing-reveal relative overflow-hidden rounded-sm border border-white/15 bg-black" style={{ animationDelay: "170ms" }}>
              <img
                src="/images/landing-bw/hero-main.webp"
                alt="Due nuotatori concentrati osservano la piscina"
                className="aspect-[4/5] w-full object-cover object-center grayscale md:aspect-[3/4] lg:aspect-[4/5]"
                loading="eager"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
              <figcaption className="absolute bottom-0 left-0 right-0 p-4 text-xs uppercase tracking-[0.18em] text-zinc-300">
                Editorial B/N Collection
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="value" className="border-b border-white/10 bg-[#0b0b0b] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <div className="landing-reveal mb-10 md:mb-12" style={{ animationDelay: "60ms" }}>
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Value Proposition</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl">Tre blocchi, un solo standard.</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {valueProps.map((item, index) => (
                <article
                  key={item.title}
                  className="landing-reveal group overflow-hidden border border-white/10 bg-[#111]/70"
                  style={{ animationDelay: `${120 + index * 90}ms` }}
                >
                  <img
                    src={item.image}
                    alt={item.alt}
                    className="aspect-[16/10] w-full object-cover grayscale transition-transform duration-500 group-hover:scale-[1.04]"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="space-y-3 p-4 md:p-5">
                    <h3 className="text-xl font-semibold text-white">{item.title}</h3>
                    <p className="text-sm leading-relaxed text-zinc-400">{item.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="border-b border-white/10 bg-[#0a0a0a] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <div className="landing-reveal mb-10" style={{ animationDelay: "40ms" }}>
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Come Funziona</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl">Sync. Analisi. Crescita.</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {workflowSteps.map((step, index) => (
                <div
                  key={step.step}
                  className="landing-reveal border border-white/10 bg-[#121212] p-5 md:p-6"
                  style={{ animationDelay: `${130 + index * 100}ms` }}
                >
                  <p className="text-5xl font-semibold leading-none text-white/15">{step.step}</p>
                  <h3 className="mt-4 text-2xl font-semibold text-white">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-400">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="gallery" className="border-b border-white/10 bg-[#090909] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <div className="landing-reveal mb-10" style={{ animationDelay: "50ms" }}>
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Visual Proof</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl">Icone in bianco e nero.</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {galleryShots.map((item, index) => (
                <figure
                  key={item.src}
                  className="landing-reveal group relative overflow-hidden border border-white/10"
                  style={{ animationDelay: `${120 + index * 80}ms` }}
                >
                  <img
                    src={item.src}
                    alt={item.alt}
                    className="aspect-[3/4] w-full object-cover grayscale transition-transform duration-500 group-hover:scale-[1.03]"
                    loading="lazy"
                    decoding="async"
                  />
                  <figcaption className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-5 text-sm uppercase tracking-[0.16em] text-zinc-200">
                    {item.caption}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-black py-16 md:py-20">
          <img
            src="/images/landing-bw/cta-banner.webp"
            alt="Superficie acqua scura in bianco e nero"
            className="absolute inset-0 h-full w-full object-cover grayscale opacity-30"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-0 bg-black/70" />
          <div className="landing-reveal relative z-10 mx-auto max-w-5xl px-4 text-center md:px-6" style={{ animationDelay: "70ms" }}>
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Final CTA</p>
            <h2 className="mt-3 text-balance text-4xl font-semibold leading-tight tracking-tight text-white md:text-6xl">
              Pronto a portare il club al livello successivo?
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-zinc-300 md:text-base">
              Esperienza premium, linguaggio chiaro, conversione pulita. Nessun rumore, solo focus su performance.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/signup" className={cn(buttonVariants({ variant: "neon", size: "lg" }), "min-h-[48px] w-full sm:w-auto")}>
                Inizia ora
              </Link>
              <Link href="/login" className={cn(buttonVariants({ variant: "outline-neon", size: "lg" }), "min-h-[48px] w-full sm:w-auto")}>
                Accedi
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#070707]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex items-center gap-2">
            <SwimForgeMark className="size-7" />
            <span className="text-sm text-zinc-400">2026 SwimForge</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-zinc-400">
            <Link href="/privacy" className="hover:text-[var(--landing-accent)] transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-[var(--landing-accent)] transition-colors">Termini</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
