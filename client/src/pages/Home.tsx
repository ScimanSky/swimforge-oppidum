import { useAuth } from "@/_core/hooks/useAuth";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowRight, Medal, Trophy, Users, Zap } from "lucide-react";
import { useEffect } from "react";
import { Link } from "wouter";

const featureCards = [
  {
    tag: "AI Coach",
    title: "Correggi prima, non dopo.",
    body: "Insight prioritizzati su tecnica, ritmo e carico per sapere cosa cambiare nella prossima sessione.",
    image: "/images/landing-v5/feature-ai-v3.webp",
    alt: "Nuotatore in corsia con visual analytics in sovraimpressione",
  },
  {
    tag: "Gamification",
    title: "XP, badge, streak e ranking.",
    body: "Ogni allenamento produce progresso visibile: guadagni XP, sblocchi badge e sali nella classifica.",
    image: "/images/landing-v5/feature-gamification.webp",
    alt: "Atleta osserva progressi gamification su smartphone bordo vasca",
  },
  {
    tag: "Social & Club",
    title: "Allenati insieme, migliora di piu.",
    body: "Feed social, sfide classiche e ghost, club e confronto con nuotatori del tuo livello.",
    image: "/images/landing-v5/feature-social-club.webp",
    alt: "Squadra nuoto e coach durante briefing tecnico",
  },
];

const workflowSteps = [
  {
    step: "01",
    title: "Sync",
    body: "Importa da Garmin/Strava o registra manualmente in un profilo unico.",
  },
  {
    step: "02",
    title: "Insight",
    body: "Leggi analisi pratiche: dove guadagni tempo e dove perdi efficienza.",
  },
  {
    step: "03",
    title: "Challenge",
    body: "Trasforma i dati in sfide: ghost track, classiche e obiettivi settimanali.",
  },
  {
    step: "04",
    title: "Club",
    body: "Condividi risultati nel feed, confrontati in classifica e cresci con il club.",
  },
];

const proofShots = [
  {
    src: "/images/landing-v5/gallery-01.webp",
    title: "Pace piu stabile",
    subtitle: "Meno oscillazioni, piu controllo",
    alt: "Nuotatore in corsia con ritmo costante",
  },
  {
    src: "/images/landing-v5/gallery-02.webp",
    title: "Continuita reale",
    subtitle: "Routine settimanale senza salti",
    alt: "Atleta prepara allenamento mattutino in piscina",
  },
  {
    src: "/images/landing-v5/gallery-03.webp",
    title: "Decisioni migliori",
    subtitle: "Dati chiari prima del prossimo blocco",
    alt: "Nuotatore analizza dati post sessione su smartphone",
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
    return <div className="min-h-screen bg-[#04101b]" />;
  }

  return (
    <div className="landing-shell bg-[#04101b] text-slate-100">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-cyan-100/10 bg-[#04101b]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2 rounded-md px-1 py-1">
            <img
              src="/brand/swimforge-navbar-logo.png"
              alt="SwimForge"
              className="h-7 w-auto object-contain md:h-8"
              loading="lazy"
              decoding="async"
            />
          </Link>
          <nav className="hidden items-center gap-7 text-xs uppercase tracking-[0.16em] text-slate-300 md:flex">
            <a href="#value" className="transition-colors hover:text-cyan-300">
              Perche SwimForge
            </a>
            <a href="#workflow" className="transition-colors hover:text-cyan-300">
              Metodo
            </a>
            <a href="#gallery" className="transition-colors hover:text-cyan-300">
              Risultati
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className={cn(buttonVariants({ variant: "outline-neon", size: "sm" }), "min-h-[44px] px-4")}>
              Accedi
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="landing-grain relative overflow-hidden border-b border-cyan-100/10 pt-20">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 top-8 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
            <div className="absolute right-[-80px] top-20 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="absolute bottom-[-140px] left-1/3 h-80 w-80 rounded-full bg-teal-400/10 blur-3xl" />
          </div>

          <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 md:px-6 md:py-20 lg:grid-cols-[1.06fr_0.94fr] lg:items-end lg:gap-14">
            <div className="landing-reveal space-y-7" style={{ animationDelay: "40ms" }}>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">Performance Platform</p>
              <h1 className="text-balance font-display text-5xl font-semibold leading-[0.88] tracking-tight text-white md:text-7xl lg:text-8xl">
                Nuota con dati chiari.
                <span className="block text-cyan-300"> Vinci con costanza.</span>
              </h1>
              <p className="max-w-xl border-l-2 border-cyan-300/70 pl-5 text-base text-slate-200 md:text-lg">
                SwimForge unisce AI Coach, XP, badge, sfide, social feed e club: ogni sessione diventa progresso misurabile e confronto reale.
              </p>
              <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-cyan-100/85">
                <span className="rounded-full border border-cyan-100/25 bg-cyan-300/10 px-3 py-1">XP & Badge</span>
                <span className="rounded-full border border-cyan-100/25 bg-cyan-300/10 px-3 py-1">Ghost + Classiche</span>
                <span className="rounded-full border border-cyan-100/25 bg-cyan-300/10 px-3 py-1">Social Feed</span>
                <span className="rounded-full border border-cyan-100/25 bg-cyan-300/10 px-3 py-1">Club Ranking</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className={cn(buttonVariants({ variant: "neon", size: "lg" }), "min-h-[48px] w-full sm:w-auto")}>
                  Inizia ora <ArrowRight className="ml-2 size-4" />
                </Link>
                <Link href="/login" className={cn(buttonVariants({ variant: "outline-neon", size: "lg" }), "min-h-[48px] w-full sm:w-auto")}>
                  Accedi
                </Link>
              </div>
            </div>

            <figure
              className="landing-reveal relative overflow-hidden rounded-2xl border border-cyan-100/20 bg-slate-950 shadow-[0_20px_70px_rgba(0,0,0,0.45)]"
              style={{ animationDelay: "170ms" }}
            >
              <img
                src="/images/landing-v5/hero-main.webp"
                alt="Due nuotatori preparano la sessione guardando i dati"
                className="aspect-[4/5] w-full object-cover object-center md:aspect-[3/4] lg:aspect-[4/5]"
                loading="eager"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#03101b]/85 via-[#03101b]/25 to-transparent" />
              <div className="absolute left-4 top-4 rounded-xl border border-cyan-100/30 bg-[#062032]/80 px-3 py-2 backdrop-blur">
                <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/80">Session XP</p>
                <p className="text-xl font-semibold text-cyan-200">+48</p>
              </div>
              <div className="absolute bottom-4 right-4 rounded-xl border border-cyan-100/30 bg-[#062032]/80 px-3 py-2 backdrop-blur">
                <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/80">Ghost Challenge</p>
                <p className="text-sm font-semibold text-white">Rivincita pronta</p>
              </div>
            </figure>
          </div>

          <div className="relative mx-auto mb-16 grid max-w-7xl grid-cols-2 gap-3 px-4 md:grid-cols-4 md:gap-4 md:px-6">
            <article className="landing-reveal rounded-xl border border-cyan-100/15 bg-cyan-400/10 p-4" style={{ animationDelay: "220ms" }}>
              <div className="mb-2 inline-flex rounded-lg bg-cyan-300/15 p-2 text-cyan-200">
                <Zap className="size-4" />
              </div>
              <p className="text-xl font-semibold text-white">XP Live</p>
              <p className="mt-1 text-xs text-slate-200/80">Progressione visibile ad ogni sessione</p>
            </article>
            <article className="landing-reveal rounded-xl border border-cyan-100/15 bg-cyan-400/10 p-4" style={{ animationDelay: "280ms" }}>
              <div className="mb-2 inline-flex rounded-lg bg-cyan-300/15 p-2 text-cyan-200">
                <Medal className="size-4" />
              </div>
              <p className="text-xl font-semibold text-white">Badge</p>
              <p className="mt-1 text-xs text-slate-200/80">Traguardi motivanti e obiettivi concreti</p>
            </article>
            <article className="landing-reveal rounded-xl border border-cyan-100/15 bg-cyan-400/10 p-4" style={{ animationDelay: "340ms" }}>
              <div className="mb-2 inline-flex rounded-lg bg-cyan-300/15 p-2 text-cyan-200">
                <Trophy className="size-4" />
              </div>
              <p className="text-xl font-semibold text-white">Sfide</p>
              <p className="mt-1 text-xs text-slate-200/80">Ghost e classiche con classifica aggiornata</p>
            </article>
            <article className="landing-reveal rounded-xl border border-cyan-100/15 bg-cyan-400/10 p-4" style={{ animationDelay: "400ms" }}>
              <div className="mb-2 inline-flex rounded-lg bg-cyan-300/15 p-2 text-cyan-200">
                <Users className="size-4" />
              </div>
              <p className="text-xl font-semibold text-white">Club & Social</p>
              <p className="mt-1 text-xs text-slate-200/80">Feed e community per allenarti in gruppo</p>
            </article>
          </div>
        </section>

        <section id="value" className="border-b border-cyan-100/10 bg-[#061726] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <div className="landing-reveal mb-10 md:mb-12" style={{ animationDelay: "60ms" }}>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/75">Perche SwimForge</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl">Un solo sistema per migliorare, competere e condividere.</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {featureCards.map((item, index) => (
                <article
                  key={item.title}
                  className="landing-reveal group overflow-hidden rounded-2xl border border-cyan-100/15 bg-[#082033]/80"
                  style={{ animationDelay: `${120 + index * 90}ms` }}
                >
                  <img
                    src={item.image}
                    alt={item.alt}
                    className="aspect-[16/10] w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="space-y-3 p-4 md:p-5">
                    <p className="text-xs uppercase tracking-[0.17em] text-cyan-200/70">{item.tag}</p>
                    <h3 className="text-xl font-semibold text-white">{item.title}</h3>
                    <p className="text-sm leading-relaxed text-slate-200/85">{item.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="border-b border-cyan-100/10 bg-[#041320] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <div className="landing-reveal mb-10" style={{ animationDelay: "40ms" }}>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/75">Come Funziona</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl">Sync. Insight. Challenge. Club.</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {workflowSteps.map((step, index) => (
                <div
                  key={step.step}
                  className="landing-reveal rounded-2xl border border-cyan-100/15 bg-[#082033] p-5 md:p-6"
                  style={{ animationDelay: `${130 + index * 90}ms` }}
                >
                  <p className="text-4xl font-semibold leading-none text-cyan-200/30">{step.step}</p>
                  <h3 className="mt-4 text-2xl font-semibold text-white">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-200/80">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="gallery" className="border-b border-cyan-100/10 bg-[#061a2a] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <div className="landing-reveal mb-10" style={{ animationDelay: "50ms" }}>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/75">Proof di Risultato</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl">Dalla vasca alla classifica, ogni dato produce azione.</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {proofShots.map((item, index) => (
                <figure
                  key={item.src}
                  className="landing-reveal group relative overflow-hidden rounded-2xl border border-cyan-100/15"
                  style={{ animationDelay: `${120 + index * 80}ms` }}
                >
                  <img
                    src={item.src}
                    alt={item.alt}
                    className="aspect-[3/4] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    loading="lazy"
                    decoding="async"
                  />
                  <figcaption className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#03101b]/85 to-transparent px-4 py-5">
                    <p className="text-sm uppercase tracking-[0.14em] text-cyan-100/85">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-200/85">{item.subtitle}</p>
                  </figcaption>
                </figure>
              ))}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <article className="landing-reveal relative overflow-hidden rounded-2xl border border-cyan-100/15" style={{ animationDelay: "360ms" }}>
                <img
                  src="/images/landing-v5/showcase-leaderboard.webp"
                  alt="Smartphone con classifica sfide e progressione XP"
                  className="aspect-[16/10] w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#03101b]/85 via-[#03101b]/15 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/80">Gamification</p>
                  <p className="mt-1 text-lg font-semibold text-white">Classifiche aggiornate, XP e badge in tempo reale.</p>
                </div>
              </article>
              <article className="landing-reveal relative overflow-hidden rounded-2xl border border-cyan-100/15" style={{ animationDelay: "430ms" }}>
                <img
                  src="/images/landing-v5/showcase-club.webp"
                  alt="Community club in piscina dopo una sessione condivisa"
                  className="aspect-[16/10] w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#03101b]/85 via-[#03101b]/15 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/80">Social & Club</p>
                  <p className="mt-1 text-lg font-semibold text-white">Feed condiviso, sfide interne e motivazione di squadra.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-[#030c15] py-16 md:py-20">
          <img
            src="/images/landing-v5/cta-banner.webp"
            alt="Nuotatore sott acqua in accelerazione verso la corsia"
            className="absolute inset-0 h-full w-full object-cover opacity-35"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-0 bg-[#03101b]/75" />
          <div className="landing-reveal relative z-10 mx-auto max-w-5xl px-4 text-center md:px-6" style={{ animationDelay: "70ms" }}>
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-100/75">Final CTA</p>
            <h2 className="mt-3 text-balance text-4xl font-semibold leading-tight tracking-tight text-white md:text-6xl">
              Smetti di allenarti a tentativi.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-slate-100/85 md:text-base">
              Entra in SwimForge, traccia ogni sessione, competi nelle sfide, guadagna XP e badge, condividi risultati con social e club.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/signup" className={cn(buttonVariants({ variant: "neon", size: "lg" }), "min-h-[48px] w-full sm:w-auto")}>
                Crea account
              </Link>
              <Link href="/login" className={cn(buttonVariants({ variant: "outline-neon", size: "lg" }), "min-h-[48px] w-full sm:w-auto")}>
                Accedi
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-cyan-100/10 bg-[#020913]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex items-center gap-2">
            <img
              src="/brand/swimforge-navbar-logo.png"
              alt="SwimForge"
              className="h-7 w-auto object-contain"
              loading="lazy"
              decoding="async"
            />
            <span className="text-sm text-slate-300/80">2026 SwimForge</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-300/80">
            <Link href="/privacy" className="transition-colors hover:text-cyan-200">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-cyan-200">
              Termini
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
