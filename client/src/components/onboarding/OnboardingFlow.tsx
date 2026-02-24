import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Player } from "@remotion/player";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "wouter";

import { trpc } from "@/lib/trpc";
import {
  ONBOARDING_CONSENT_TYPE,
  ONBOARDING_CONSENT_VERSION,
  ONBOARDING_FORCE_QUERY_PARAM,
  isOnboardingCompletedLocally,
  setOnboardingCompletedLocally,
  stripOnboardingParams,
  getOnboardingIdentityLocally,
  type OnboardingRole,
} from "@/lib/onboarding";
import { Button } from "@/components/ui/button";
import {
  OnboardingWelcomeComposition,
  ONBOARDING_WELCOME_DURATION_FRAMES,
  ONBOARDING_WELCOME_FPS,
  ONBOARDING_WELCOME_HEIGHT,
  ONBOARDING_WELCOME_WIDTH,
} from "./OnboardingWelcomeComposition";
import { OnboardingIdentitySetup } from "./OnboardingIdentitySetup";

type Stage = "hidden" | "welcome" | "identity" | "tour";

type TourStep = {
  selector: string;
  title: string;
  body: string;
};

const ATHLETE_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="main-navigation"]',
    title: "Navigazione principale",
    body: "Quattro sezioni, tutto ciò che ti serve: Feed, Traccia, Club e Profilo.",
  },
  {
    selector: '[data-tour="feed-stories"]',
    title: "Stories",
    body: "Le Stories della community spariscono dopo 24h. Aprile con un tap.",
  },
  {
    selector: '[data-tour="create-post"]',
    title: "Crea contenuti",
    body: "Post, attività condivisa o story — tutto in un tap con il tasto +.",
  },
  {
    selector: '[data-tour="track-section"]',
    title: "Traccia le tue vasche",
    body: "Log la tua prima vasca manualmente, o connetti Garmin/Strava per il sync automatico.",
  },
  {
    selector: '[data-tour="season-hub"]',
    title: "Season Hub",
    body: "La stagione è il tuo campionato personale. XP, livelli e progressi stagione per stagione.",
  },
  {
    selector: '[data-tour="challenges-list"]',
    title: "Sfide settimanali",
    body: "Partecipa alle sfide attive e scala la classifica in tempo reale.",
  },
  {
    selector: '[data-tour="ai-coach-btn"]',
    title: "AI Coach",
    body: "Il tuo coach AI genera allenamenti personalizzati in secondi. Prova il primo oggi.",
  },
  {
    selector: '[data-tour="badges-nav"]',
    title: "Badge e Achievement",
    body: "Ogni milestone sblocca un badge. Già ne hai uno — dai un'occhiata!",
  },
  {
    selector: '[data-tour="club-directory"]',
    title: "Club e Community",
    body: "Trova il tuo club, unisciti alla squadra o creane uno nuovo.",
  },
  {
    selector: '[data-tour="profile-stats"]',
    title: "Il tuo profilo",
    body: "Stats, badge, attività e follower — tutto il tuo percorso in un posto.",
  },
];

const COACH_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="main-navigation"]',
    title: "Navigazione principale",
    body: "Come coach hai accesso a sezioni di gestione extra.",
  },
  {
    selector: '[data-tour="club-directory"]',
    title: "Club",
    body: "Crea il tuo club o gestisci quelli esistenti da qui.",
  },
  {
    selector: '[data-tour="club-members"]',
    title: "Roster atleti",
    body: "Gestisci iscrizioni, ruoli e inviti per il tuo club.",
  },
  {
    selector: '[data-tour="club-events"]',
    title: "Gare ed eventi",
    body: "Programma eventi, meet e raduni del club.",
  },
  {
    selector: '[data-tour="club-meets"]',
    title: "Risultati gare",
    body: "Importa e gestisci i risultati delle competizioni.",
  },
  {
    selector: '[data-tour="club-history"]',
    title: "Storico atleti",
    body: "Importa dati storici da OppiDUM con un click.",
  },
  {
    selector: '[data-tour="club-announcements"]',
    title: "Annunci club",
    body: "Comunica con tutti gli atleti del club in tempo reale.",
  },
  {
    selector: '[data-tour="coach-panel"]',
    title: "Dashboard coach",
    body: "La panoramica completa: membri, eventi, statistiche del club.",
  },
];

const PUBLIC_PATHS = [
  "/",
  "/auth",
  "/login",
  "/register",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/terms",
  "/cookies",
] as const;
const SEASON_POPUP_DATASET_KEY = "seasonLaunchOpen";
const SEASON_POPUP_EVENT = "swimforge:season-popup:state";

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

function getTooltipPosition(rect: DOMRect | null) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(360, viewportWidth - 24);

  if (!rect) {
    return {
      width,
      left: Math.max(12, (viewportWidth - width) / 2),
      top: Math.max(12, (viewportHeight - 220) / 2),
    };
  }

  const desiredTop = rect.bottom + 14;
  const fallbackTop = rect.top - 220;
  const top = desiredTop + 210 > viewportHeight ? Math.max(12, fallbackTop) : desiredTop;

  const centeredLeft = rect.left + rect.width / 2 - width / 2;
  const left = Math.max(12, Math.min(centeredLeft, viewportWidth - width - 12));

  return { width, left, top: Math.max(12, top) };
}

export default function OnboardingFlow() {
  const [location, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const meQuery = trpc.auth.me.useQuery();
  const setConsentMutation = trpc.consent.set.useMutation();
  const consentsQuery = trpc.consent.list.useQuery(undefined, {
    enabled: Boolean(meQuery.data?.id),
    staleTime: 30_000,
  });

  const [stage, setStage] = useState<Stage>("hidden");
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const [manualRunNonce, setManualRunNonce] = useState(0);
  const [pendingTourLaunch, setPendingTourLaunch] = useState(false);
  const [welcomeCompleted, setWelcomeCompleted] = useState(false);
  const [resumePathAfterTour, setResumePathAfterTour] = useState<string | null>(null);
  const [seasonPopupOpen, setSeasonPopupOpen] = useState(false);
  const [onboardingRole, setOnboardingRole] = useState<OnboardingRole>("athlete");
  const onboardingUserId = meQuery.data?.id ? String(meQuery.data.id) : null;

  const TOUR_STEPS = useMemo(
    () => (onboardingRole === "coach" ? COACH_TOUR_STEPS : ATHLETE_TOUR_STEPS),
    [onboardingRole],
  );

  const syncAttemptedRef = useRef(false);

  const pathname = useMemo(() => location.split("?")[0] || "/", [location]);
  const queryParams = useMemo(() => new URLSearchParams(location.split("?")[1] ?? ""), [location]);

  const forceFromQuery = queryParams.get(ONBOARDING_FORCE_QUERY_PARAM) === "1" || queryParams.get("tour") === "1";
  const shouldForce = forceFromQuery || manualRunNonce > 0;

  const serverDone = Boolean((consentsQuery.data as any)?.byType?.[ONBOARDING_CONSENT_TYPE]?.granted);
  const canEvaluate = Boolean(meQuery.data?.id) && !consentsQuery.isLoading;
  const shouldRender = stage !== "hidden";

  useEffect(() => {
    const handler = () => {
      setManualRunNonce((prev) => prev + 1);
    };

    window.addEventListener("swimforge:onboarding:start", handler);
    return () => window.removeEventListener("swimforge:onboarding:start", handler);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const readCurrent = () => document.documentElement.dataset[SEASON_POPUP_DATASET_KEY] === "1";
    setSeasonPopupOpen(readCurrent());

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ open?: boolean }>;
      if (typeof customEvent.detail?.open === "boolean") {
        setSeasonPopupOpen(customEvent.detail.open);
        return;
      }
      setSeasonPopupOpen(readCurrent());
    };

    window.addEventListener(SEASON_POPUP_EVENT, handler as EventListener);
    return () => window.removeEventListener(SEASON_POPUP_EVENT, handler as EventListener);
  }, []);

  useEffect(() => {
    if (!meQuery.data?.id) {
      setStage("hidden");
      setHighlightRect(null);
      return;
    }

    if (seasonPopupOpen) {
      if (stage !== "hidden") {
        setStage("hidden");
        setHighlightRect(null);
      }
      return;
    }

    if (pendingTourLaunch) return;
    if (isPublicPath(pathname)) return;
    if (!canEvaluate) return;

    const localDone = isOnboardingCompletedLocally(onboardingUserId);

    if (serverDone && !localDone) {
      setOnboardingCompletedLocally(true, onboardingUserId);
    }

    if (shouldForce) {
      if (stage === "hidden") {
        setStage("welcome");
        setWelcomeCompleted(false);
      }
      return;
    }

    if (!serverDone && !localDone) {
      // Open welcome only when idle; do not interrupt an already-started interactive tour.
      if (stage === "hidden") {
        setStage("welcome");
        setWelcomeCompleted(false);
      }
      return;
    }

    if (stage !== "hidden") {
      setStage("hidden");
      setHighlightRect(null);
    }
  }, [canEvaluate, meQuery.data?.id, onboardingUserId, pathname, pendingTourLaunch, seasonPopupOpen, serverDone, shouldForce, stage]);

  useEffect(() => {
    if (!canEvaluate || !meQuery.data?.id) return;

    const localDone = isOnboardingCompletedLocally(onboardingUserId);
    if (!localDone || serverDone || syncAttemptedRef.current) return;

    syncAttemptedRef.current = true;
    void setConsentMutation
      .mutateAsync({
        consentType: ONBOARDING_CONSENT_TYPE,
        granted: true,
        consentVersion: ONBOARDING_CONSENT_VERSION,
      })
      .then(() => utils.consent.list.invalidate())
      .catch(() => {
        syncAttemptedRef.current = false;
      });
  }, [canEvaluate, meQuery.data?.id, onboardingUserId, serverDone, setConsentMutation, utils.consent.list]);

  useEffect(() => {
    if (!pendingTourLaunch || pathname !== "/home") return;

    const timer = window.setTimeout(() => {
      setCurrentStep(0);
      setStage("tour");
      setPendingTourLaunch(false);
      setWelcomeCompleted(false);
      setManualRunNonce(0);
      const cleanLocation = stripOnboardingParams(location);
      if (cleanLocation !== location) setLocation(cleanLocation);
    }, 220);

    return () => window.clearTimeout(timer);
  }, [location, pathname, pendingTourLaunch, setLocation]);

  useEffect(() => {
    if (stage !== "welcome") return;
    setWelcomeCompleted(false);
    const durationMs = Math.round((ONBOARDING_WELCOME_DURATION_FRAMES / ONBOARDING_WELCOME_FPS) * 1000);
    const timer = window.setTimeout(() => setWelcomeCompleted(true), Math.max(3000, durationMs - 250));
    return () => window.clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "tour") {
      setHighlightRect(null);
      return;
    }

    let rafId = 0;

    const updateRect = () => {
      const step = TOUR_STEPS[currentStep];
      if (!step) {
        setHighlightRect(null);
        return;
      }

      const element = document.querySelector(step.selector) as HTMLElement | null;
      if (!element) {
        setHighlightRect(null);
        return;
      }

      const rect = element.getBoundingClientRect();
      setHighlightRect(rect);

      const topGuard = 96;
      const bottomGuard = 170;
      if (rect.top < topGuard || rect.bottom > window.innerHeight - bottomGuard) {
        element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      }
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(updateRect);
    };

    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [currentStep, stage]);

  const completeOnboarding = async () => {
    const targetAfterCompletion = resumePathAfterTour;
    setOnboardingCompletedLocally(true, onboardingUserId);
    setStage("hidden");
    setCurrentStep(0);
    setHighlightRect(null);
    setManualRunNonce(0);
    setPendingTourLaunch(false);
    setResumePathAfterTour(null);

    const cleanLocation = stripOnboardingParams(location);
    const nextLocation =
      targetAfterCompletion && cleanLocation.startsWith("/home")
        ? targetAfterCompletion
        : cleanLocation;
    if (nextLocation !== location) setLocation(nextLocation);

    if (!meQuery.data?.id || serverDone) return;

    try {
      await setConsentMutation.mutateAsync({
        consentType: ONBOARDING_CONSENT_TYPE,
        granted: true,
        consentVersion: ONBOARDING_CONSENT_VERSION,
      });
      await utils.consent.list.invalidate();
    } catch {
      // Retry will happen automatically when local state is checked on next session.
    }
  };

  const startTour = () => {
    setManualRunNonce(0);
    if (pathname !== "/home") {
      setResumePathAfterTour(stripOnboardingParams(location));
      setPendingTourLaunch(true);
      setStage("hidden");
      setHighlightRect(null);
      setLocation("/home?tour=1");
      return;
    }

    setCurrentStep(0);
    setStage("tour");
    setWelcomeCompleted(false);
    const cleanLocation = stripOnboardingParams(location);
    if (cleanLocation !== location) setLocation(cleanLocation);
  };

  const skipWelcome = async () => {
    await completeOnboarding();
  };

  const handleWelcomeContinue = () => {
    const identity = getOnboardingIdentityLocally(onboardingUserId);
    if (identity.completed) {
      setOnboardingRole(identity.role ?? "athlete");
      startTour();
    } else {
      setStage("identity");
    }
  };

  const handleIdentityComplete = (role: OnboardingRole) => {
    setOnboardingRole(role);
    startTour();
  };

  const handleNextStep = async () => {
    if (currentStep >= TOUR_STEPS.length - 1) {
      await completeOnboarding();
      return;
    }
    setCurrentStep((prev) => prev + 1);
  };

  const handleBackStep = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  if (!shouldRender || typeof document === "undefined") return null;

  const step = TOUR_STEPS[currentStep];
  const tooltip = getTooltipPosition(highlightRect);

  return createPortal(
    <AnimatePresence>
      {stage === "welcome" && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(2,8,24,0.82)] px-4 py-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="w-full max-w-4xl overflow-hidden rounded-3xl border border-[color-mix(in_oklch,var(--electric-cyan)_26%,transparent)] bg-[color-mix(in_oklch,var(--background)_82%,transparent)] shadow-[0_0_52px_var(--neon-soft)]"
          >
            <div className="border-b border-border/70 px-5 py-4 sm:px-6">
              <h2 className="font-display text-xl font-bold text-foreground">Benvenuto nel tour guidato</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Un video rapido e poi una guida interattiva sui punti chiave dell'app.
              </p>
            </div>

            <div className="bg-black/25 p-3 sm:p-4">
              <Player
                component={OnboardingWelcomeComposition}
                durationInFrames={ONBOARDING_WELCOME_DURATION_FRAMES}
                fps={ONBOARDING_WELCOME_FPS}
                compositionHeight={ONBOARDING_WELCOME_HEIGHT}
                compositionWidth={ONBOARDING_WELCOME_WIDTH}
                controls={false}
                autoPlay
                loop={false}
                inputProps={{ userName: meQuery.data?.name ?? null }}
                style={{
                  width: "100%",
                  borderRadius: 16,
                  aspectRatio: `${ONBOARDING_WELCOME_WIDTH} / ${ONBOARDING_WELCOME_HEIGHT}`,
                }}
              />
            </div>

            <div className="flex flex-col gap-2 border-t border-border/70 px-5 py-4 sm:flex-row sm:justify-between sm:px-6">
              <Button variant="ghost-neon" onClick={() => void skipWelcome()}>
                Salta tour
              </Button>
              <Button variant="neon" onClick={handleWelcomeContinue} disabled={!welcomeCompleted}>
                {welcomeCompleted ? "Inizia tour interattivo" : "Attendi fine intro..."}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {stage === "identity" && onboardingUserId && (
        <motion.div
          key="identity"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(2,8,24,0.82)] px-4 py-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="w-full max-w-lg overflow-hidden rounded-3xl border border-[color-mix(in_oklch,var(--electric-cyan)_26%,transparent)] bg-[color-mix(in_oklch,var(--background)_90%,transparent)] p-6 shadow-[0_0_52px_var(--neon-soft)]"
          >
            <div className="mb-4 border-b border-border/70 pb-4">
              <h2 className="font-display text-xl font-bold text-foreground">Configura il tuo profilo</h2>
              <p className="mt-1 text-sm text-muted-foreground">Due minuti per personalizzare SwimForge.</p>
            </div>
            <OnboardingIdentitySetup
              userId={onboardingUserId}
              onComplete={handleIdentityComplete}
              onSkip={() => void completeOnboarding()}
            />
          </motion.div>
        </motion.div>
      )}

      {stage === "tour" && (
        <motion.div
          className="fixed inset-0 z-[120]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-[rgba(2,8,24,0.72)]" />

          <motion.div
            className="pointer-events-none absolute rounded-2xl border border-[color-mix(in_oklch,var(--electric-cyan)_58%,transparent)]"
            animate={
              highlightRect
                ? {
                    top: Math.max(8, highlightRect.top - 8),
                    left: Math.max(8, highlightRect.left - 8),
                    width: Math.max(24, highlightRect.width + 16),
                    height: Math.max(24, highlightRect.height + 16),
                  }
                : {
                    top: window.innerHeight / 2 - 80,
                    left: window.innerWidth / 2 - 150,
                    width: 300,
                    height: 160,
                  }
            }
            transition={{ type: "spring", stiffness: 220, damping: 28, mass: 0.8 }}
            style={{
              boxShadow: "0 0 0 9999px rgba(2,8,24,0.65), 0 0 0 1px rgba(0,245,255,0.35), 0 0 28px rgba(0,245,255,0.34)",
            }}
          />

          <motion.div
            className="absolute rounded-2xl border border-border/70 bg-[color-mix(in_oklch,var(--background)_84%,transparent)] p-4 shadow-[0_0_34px_var(--neon-soft)]"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{
              width: tooltip.width,
              left: tooltip.left,
              top: tooltip.top,
            }}
          >
            <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[var(--electric-cyan)]">
              Step {currentStep + 1} di {TOUR_STEPS.length}
            </div>
            <h3 className="font-display text-lg font-semibold text-foreground">{step?.title ?? "Tour"}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{step?.body}</p>

            <div className="mt-4 flex items-center justify-between gap-2">
              <Button variant="ghost-neon" onClick={() => void completeOnboarding()}>
                Chiudi
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline-neon" onClick={handleBackStep} disabled={currentStep === 0}>
                  Indietro
                </Button>
                <Button variant="neon" onClick={() => void handleNextStep()}>
                  {currentStep >= TOUR_STEPS.length - 1 ? "Fine" : "Avanti"}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
