import { assetUrl } from "@/lib/asset-base";
import { useAuth } from "@/_core/hooks/useAuth";
import { Chip } from "@/components/corsia/Chip";
import { Wordmark } from "@/components/corsia/Wordmark";
import { Button } from "@/components/ui/button";
import { homePathForPlatform } from "@/lib/navigation";
import { isNativePlatform } from "@/lib/platform";
import { ArrowRight, Medal, Trophy, Users, Zap } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";

const highlights = [
  { icon: <Zap className="size-5" aria-hidden />, title: "XP in diretta", body: "Progressi visibili a ogni sessione" },
  { icon: <Medal className="size-5" aria-hidden />, title: "Badge", body: "Traguardi motivanti e obiettivi concreti" },
  { icon: <Trophy className="size-5" aria-hidden />, title: "Sfide", body: "Sfide con la community e classifica aggiornata" },
  { icon: <Users className="size-5" aria-hidden />, title: "Club e feed", body: "Feed e community per allenarti in gruppo" },
];

const featureCards = [
  {
    tag: "Coach AI",
    title: "Correggi prima, non dopo.",
    body: "Consigli in ordine di priorità su tecnica, ritmo e carico per sapere cosa cambiare nella prossima sessione.",
    image: "/images/landing-v5/feature-ai-v3.webp",
    alt: "Nuotatore in corsia con i dati della sessione",
  },
  {
    tag: "XP e badge",
    title: "XP, badge, serie e classifiche.",
    body: "Ogni allenamento produce progressi visibili: guadagni XP, sblocchi badge e sali in classifica.",
    image: "/images/landing-v5/feature-gamification.webp",
    alt: "Atleta guarda i suoi progressi sullo smartphone a bordo vasca",
  },
  {
    tag: "Feed e club",
    title: "Allenati insieme, migliora di più.",
    body: "Feed, sfide con la community, club e confronto con nuotatori del tuo livello.",
    image: "/images/landing-v5/feature-social-club.webp",
    alt: "Squadra di nuoto e allenatore durante un briefing tecnico",
  },
];

const workflowSteps = [
  {
    step: "01",
    title: "Sincronizza",
    body: "Importa da Garmin o Strava, o registra a mano, in un profilo unico.",
  },
  {
    step: "02",
    title: "Analizza",
    body: "Leggi analisi pratiche: dove guadagni tempo e dove perdi efficienza.",
  },
  {
    step: "03",
    title: "Sfida",
    body: "Trasforma i dati in sfide: community, classifica e obiettivi settimanali.",
  },
  {
    step: "04",
    title: "Club",
    body: "Condividi i risultati nel feed, confrontati in classifica e cresci con il club.",
  },
];

const proofShots = [
  {
    src: "/images/landing-v5/gallery-01.webp",
    title: "Passo più stabile",
    subtitle: "Meno oscillazioni, più controllo",
    alt: "Nuotatore in corsia con ritmo costante",
  },
  {
    src: "/images/landing-v5/gallery-02.webp",
    title: "Continuità reale",
    subtitle: "Routine settimanale senza salti",
    alt: "Atleta prepara l'allenamento del mattino in piscina",
  },
  {
    src: "/images/landing-v5/gallery-03.webp",
    title: "Decisioni migliori",
    subtitle: "Dati chiari prima del prossimo blocco",
    alt: "Nuotatore analizza i dati dopo la sessione sullo smartphone",
  },
];

const showcases = [
  {
    src: "/images/landing-v5/showcase-leaderboard.webp",
    alt: "Smartphone con la classifica delle sfide e i progressi XP",
    tag: "Classifiche",
    text: "Classifiche aggiornate, XP e badge in tempo reale.",
  },
  {
    src: "/images/landing-v5/showcase-club.webp",
    alt: "Il club in piscina dopo una sessione insieme",
    tag: "Feed e club",
    text: "Feed condiviso, sfide interne e motivazione di squadra.",
  },
];

/** Section heading of the landing: a short action-blue line above an h2. */
function SectionTitle({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <div className="mb-8 max-w-3xl md:mb-10">
      <p className="text-sm font-semibold text-action-text">{eyebrow}</p>
      <h2 className="mt-2 font-display text-[34px] font-bold leading-tight md:text-5xl">{children}</h2>
    </div>
  );
}

function SignUpActions({ primary }: { primary: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button asChild size="lg" className="w-full sm:w-auto">
        <Link href="/signup">
          {primary}
          <ArrowRight aria-hidden />
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
        <Link href="/login">Accedi</Link>
      </Button>
    </div>
  );
}

/** `/` on the web for visitors: the public landing. Signed in, or in the app, it redirects. */
export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const isNative = isNativePlatform();

  useEffect(() => {
    if (loading) return;
    // replace: "/" is only a switch, the back button must not return to it.
    if (isAuthenticated) navigate(homePathForPlatform(isNative), { replace: true });
    else if (isNative) navigate("/login", { replace: true }); // the public landing is web only
  }, [isAuthenticated, isNative, loading, navigate]);

  if (loading || isAuthenticated || isNative) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
          <Link href="/" aria-label="SwimForge, pagina iniziale" className="rounded-lg">
            <Wordmark />
          </Link>
          <nav aria-label="Sezioni" className="hidden items-center gap-6 text-sm font-semibold text-muted-foreground md:flex">
            <a href="#value" className="transition-colors hover:text-foreground">
              Perché SwimForge
            </a>
            <a href="#workflow" className="transition-colors hover:text-foreground">
              Metodo
            </a>
            <a href="#gallery" className="transition-colors hover:text-foreground">
              Risultati
            </a>
          </nav>
          <Button asChild variant="outline" size="sm">
            <Link href="/login">Accedi</Link>
          </Button>
        </div>
      </header>

      <main>
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:px-6 md:py-16 lg:grid-cols-[1.06fr_0.94fr] lg:items-center lg:gap-14">
            <div className="landing-reveal space-y-6" style={{ animationDelay: "40ms" }}>
              <h1 className="text-balance font-display text-5xl font-bold leading-[0.95] md:text-7xl">
                Nuota con dati chiari.
                <span className="block text-action-text">Vinci con costanza.</span>
              </h1>
              <p className="max-w-xl text-base text-muted-foreground md:text-lg">
                SwimForge unisce Coach AI, XP, badge, sfide, feed e club: ogni sessione diventa progresso misurabile e
                confronto reale.
              </p>
              <ul className="flex flex-wrap gap-2" aria-label="In SwimForge">
                {["XP e badge", "Sfide e classifiche", "Feed", "Classifiche dei club"].map((label) => (
                  <li key={label}>
                    <Chip>{label}</Chip>
                  </li>
                ))}
              </ul>
              <SignUpActions primary="Inizia ora" />
            </div>

            <figure className="landing-reveal" style={{ animationDelay: "170ms" }}>
              <img
                src={assetUrl("/images/landing-v5/hero-main.webp")}
                alt="Due nuotatori preparano la sessione guardando i dati"
                className="aspect-[4/3] w-full rounded-2xl border border-border object-cover lg:aspect-[4/5]"
                loading="eager"
                decoding="async"
              />
              <figcaption className="mt-3 grid grid-cols-2 gap-3">
                <span className="surface-panel block p-3">
                  <span className="block text-xs font-medium text-muted-foreground">XP della sessione</span>
                  <span className="mt-1 block font-display text-2xl font-bold tabular-nums text-xp">+48 XP</span>
                </span>
                <span className="surface-panel block p-3">
                  <span className="block text-xs font-medium text-muted-foreground">Sfida della community</span>
                  <span className="mt-1 block text-[15px] font-semibold">Rivincita pronta</span>
                </span>
              </figcaption>
            </figure>
          </div>

          <ul className="mx-auto mb-12 grid max-w-7xl grid-cols-2 gap-3 px-4 md:mb-16 md:grid-cols-4 md:gap-4 md:px-6">
            {highlights.map(({ icon, title, body }) => (
              <li key={title} className="surface-panel p-4">
                <span className="inline-flex rounded-xl bg-raised p-2 text-action-text">{icon}</span>
                <p className="mt-3 font-semibold">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="value" className="scroll-mt-16 border-b border-border py-12 md:py-16">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <SectionTitle eyebrow="Perché SwimForge">
              Un solo sistema per migliorare, competere e condividere.
            </SectionTitle>
            <div className="grid gap-5 md:grid-cols-3">
              {featureCards.map((item) => (
                <article key={item.title} className="surface-panel overflow-hidden">
                  <img
                    src={assetUrl(item.image)}
                    alt={item.alt}
                    className="aspect-[16/10] w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="space-y-3 p-4 md:p-5">
                    <Chip>{item.tag}</Chip>
                    <h3 className="text-[17px] font-bold">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="scroll-mt-16 border-b border-border py-12 md:py-16">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <SectionTitle eyebrow="Come funziona">Sincronizza. Analizza. Sfida. Club.</SectionTitle>
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {workflowSteps.map((step) => (
                <li key={step.step} className="surface-panel p-5">
                  <p className="font-display text-4xl font-bold leading-none tabular-nums text-muted-foreground" aria-hidden>
                    {step.step}
                  </p>
                  <h3 className="mt-4 text-[17px] font-bold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="gallery" className="scroll-mt-16 border-b border-border py-12 md:py-16">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <SectionTitle eyebrow="Risultati">Dalla vasca alla classifica, ogni dato produce azione.</SectionTitle>
            <div className="grid gap-4 md:grid-cols-3">
              {proofShots.map((item) => (
                <figure key={item.src} className="surface-panel overflow-hidden">
                  <img
                    src={assetUrl(item.src)}
                    alt={item.alt}
                    className="aspect-[4/3] w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  <figcaption className="p-4">
                    <span className="block font-semibold">{item.title}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{item.subtitle}</span>
                  </figcaption>
                </figure>
              ))}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {showcases.map((item) => (
                <figure key={item.src} className="surface-panel overflow-hidden">
                  <img
                    src={assetUrl(item.src)}
                    alt={item.alt}
                    className="aspect-[16/10] w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  <figcaption className="space-y-2 p-4">
                    <Chip>{item.tag}</Chip>
                    <span className="block text-[17px] font-bold">{item.text}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section className="py-12 md:py-16">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <div className="surface-panel flex flex-col items-center p-6 text-center md:p-10">
              <h2 className="text-balance font-display text-[34px] font-bold leading-tight md:text-5xl">
                Smetti di allenarti a tentativi.
              </h2>
              <p className="mt-4 max-w-2xl text-[15px] text-muted-foreground md:text-base">
                Entra in SwimForge, traccia ogni sessione, partecipa alle sfide, guadagna XP e badge, condividi i risultati
                con il feed e il club.
              </p>
              <div className="mt-6">
                <SignUpActions primary="Crea account" />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 md:flex-row md:items-center md:justify-between md:px-6">
          <p className="text-sm text-muted-foreground">© 2026 SwimForge</p>
          <nav aria-label="Documenti legali" className="flex items-center gap-6 text-sm">
            <Link href="/privacy" className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground">
              Termini
            </Link>
            <Link href="/cookies" className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground">
              Cookie
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
