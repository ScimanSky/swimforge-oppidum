import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { useLocation, useSearch } from "wouter";

import { trpc } from "@/lib/trpc";
import { homePathForPlatform, isPublicPath } from "@/lib/navigation";
import { isNativePlatform } from "@/lib/platform";
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
import { useHoldCelebrations } from "@/hooks/useCelebrationGate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  OnboardingWelcomeComposition,
  ONBOARDING_WELCOME_DURATION_FRAMES,
  ONBOARDING_WELCOME_FPS,
  ONBOARDING_WELCOME_HEIGHT,
  ONBOARDING_WELCOME_WIDTH,
} from "./OnboardingWelcomeComposition";
import { OnboardingIdentitySetup } from "./OnboardingIdentitySetup";
import { OnboardingFirstAction, firstActionTitle } from "./OnboardingFirstAction";

type Stage = "hidden" | "welcome" | "identity" | "tour" | "first-action";

type TourStep = {
  selector: string;
  title: string;
  body: string;
};

const OnboardingPlayer = lazy(async () => {
  const mod = await import("@remotion/player");
  return { default: mod.Player };
});

const ATHLETE_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="main-navigation"]',
    title: "Navigazione principale",
    body: "Cinque voci: Oggi, Feed, il tasto +, Allena e Community.",
  },
  {
    selector: '[data-tour="create-post"]',
    title: "Crea contenuti",
    body: "Post o attività condivisa — tutto in un tap con il tasto +.",
  },
  {
    selector: '[data-tour="track-section"]',
    title: "Allena",
    body: "Allena raccoglie attività, obiettivi, statistiche e Coach AI.",
  },
  {
    selector: '[data-tour="club-directory"]',
    title: "Sfide",
    body: "Le sfide sono in Community, accanto ai club e alle classifiche.",
  },
  {
    selector: '[data-tour="track-section"]',
    title: "Coach AI",
    body: "Il tuo coach AI genera allenamenti personalizzati in secondi. Prova il primo oggi.",
  },
  {
    selector: '[data-tour="badges-nav"]',
    title: "Badge",
    body: "I badge sono nel tuo profilo.",
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
  const [onboardingRole, setOnboardingRole] = useState<OnboardingRole>("athlete");
  const onboardingUserId = meQuery.data?.id ? String(meQuery.data.id) : null;

  const TOUR_STEPS = useMemo(
    () => (onboardingRole === "coach" ? COACH_TOUR_STEPS : ATHLETE_TOUR_STEPS),
    [onboardingRole],
  );

  const syncAttemptedRef = useRef(false);

  // wouter: useLocation() is the pathname, the query string comes from useSearch().
  const search = useSearch();
  const pathname = location || "/";
  const fullLocation = search ? `${pathname}?${search}` : pathname;
  const queryParams = useMemo(() => new URLSearchParams(search), [search]);
  const tourPath = homePathForPlatform(isNativePlatform());

  const forceFromQuery = queryParams.get(ONBOARDING_FORCE_QUERY_PARAM) === "1" || queryParams.get("tour") === "1";
  const shouldForce = forceFromQuery || manualRunNonce > 0;

  const serverDone = Boolean((consentsQuery.data as any)?.byType?.[ONBOARDING_CONSENT_TYPE]?.granted);
  const canEvaluate = Boolean(meQuery.data?.id) && !consentsQuery.isLoading;
  const shouldRender = stage !== "hidden";

  // New badges and records wait while the onboarding is open, about to open (on the way to the
  // tour page) or not decided yet: they would sit under its overlay and be dismissed unseen.
  const deciding = Boolean(meQuery.data?.id) && !canEvaluate && !isPublicPath(pathname);
  useHoldCelebrations("onboarding", shouldRender || pendingTourLaunch || deciding);

  useEffect(() => {
    const handler = () => {
      setManualRunNonce((prev) => prev + 1);
    };

    window.addEventListener("swimforge:onboarding:start", handler);
    return () => window.removeEventListener("swimforge:onboarding:start", handler);
  }, []);

  useEffect(() => {
    if (!meQuery.data?.id) {
      setStage("hidden");
      setHighlightRect(null);
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
  }, [canEvaluate, meQuery.data?.id, onboardingUserId, pathname, pendingTourLaunch, serverDone, shouldForce, stage]);

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
    if (!pendingTourLaunch || pathname !== tourPath) return;

    const timer = window.setTimeout(() => {
      setCurrentStep(0);
      setStage("tour");
      setPendingTourLaunch(false);
      setWelcomeCompleted(false);
      setManualRunNonce(0);
      const cleanLocation = stripOnboardingParams(fullLocation);
      if (cleanLocation !== fullLocation) setLocation(cleanLocation);
    }, 220);

    return () => window.clearTimeout(timer);
  }, [fullLocation, pathname, pendingTourLaunch, setLocation, tourPath]);

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

      // Same anchor in the bottom bar and the desktop rail: highlight the one on screen.
      const element =
        Array.from(document.querySelectorAll<HTMLElement>(step.selector)).find(
          (candidate) => candidate.getClientRects().length > 0,
        ) ?? null;
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
  }, [currentStep, stage, TOUR_STEPS]);

  const completeOnboarding = async () => {
    const targetAfterCompletion = resumePathAfterTour;
    setOnboardingCompletedLocally(true, onboardingUserId);
    setStage("hidden");
    setCurrentStep(0);
    setHighlightRect(null);
    setManualRunNonce(0);
    setPendingTourLaunch(false);
    setResumePathAfterTour(null);

    const cleanLocation = stripOnboardingParams(fullLocation);
    const nextLocation =
      targetAfterCompletion && pathname === tourPath
        ? targetAfterCompletion
        : cleanLocation;
    if (nextLocation !== fullLocation) setLocation(nextLocation);

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
    if (pathname !== tourPath) {
      setResumePathAfterTour(stripOnboardingParams(fullLocation));
      setPendingTourLaunch(true);
      setStage("hidden");
      setHighlightRect(null);
      setLocation(`${tourPath}?tour=1`);
      return;
    }

    setCurrentStep(0);
    setStage("tour");
    setWelcomeCompleted(false);
    const cleanLocation = stripOnboardingParams(fullLocation);
    if (cleanLocation !== fullLocation) setLocation(cleanLocation);
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

  const handleNextStep = () => {
    if (currentStep >= TOUR_STEPS.length - 1) {
      setHighlightRect(null);
      setStage("first-action");
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

  return (
    <>
      {stage === "welcome" && (
        <OnboardingDialog
          title="Benvenuto nel tour guidato"
          description="Un video rapido e poi una guida interattiva sui punti chiave dell'app."
          onDismiss={() => void skipWelcome()}
          className="max-w-4xl"
        >
          {/* The video repeats the dialog's title and line: hidden from screen readers. */}
          <div className="bg-raised p-3 sm:p-4" aria-hidden>
            <Suspense
              fallback={(
                <div
                  className="w-full animate-pulse rounded-2xl bg-card"
                  style={{ aspectRatio: `${ONBOARDING_WELCOME_WIDTH} / ${ONBOARDING_WELCOME_HEIGHT}` }}
                />
              )}
            >
              <OnboardingPlayer
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
            </Suspense>
          </div>

          <div className="flex flex-col gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-between sm:px-6">
            <Button variant="ghost" onClick={() => void skipWelcome()}>
              Salta tour
            </Button>
            <Button onClick={handleWelcomeContinue} disabled={!welcomeCompleted}>
              {welcomeCompleted ? "Inizia tour interattivo" : "Attendi la fine dell'intro…"}
            </Button>
          </div>
        </OnboardingDialog>
      )}

      {stage === "identity" && onboardingUserId && (
        <OnboardingDialog
          title="Configura il tuo profilo"
          description="Due minuti per personalizzare SwimForge."
          onDismiss={() => void completeOnboarding()}
          className="max-w-lg"
        >
          <div className="p-5 sm:p-6">
            <OnboardingIdentitySetup
              userId={onboardingUserId}
              onComplete={handleIdentityComplete}
              onSkip={() => void completeOnboarding()}
            />
          </div>
        </OnboardingDialog>
      )}

      {stage === "tour" && (
        <Dialog open onOpenChange={(open) => { if (!open) void completeOnboarding(); }}>
          <DialogPortal>
            {/* Transparent: blocks the page; the dim comes from the highlight's cut-out shadow. */}
            <DialogOverlay className="z-[120] bg-transparent" />
            <motion.div
              aria-hidden
              className="pointer-events-none fixed z-[120] rounded-2xl border-2 border-action-text"
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
              style={{ boxShadow: "0 0 0 9999px color-mix(in oklch, var(--background) 72%, transparent)" }}
            />
            <DialogPrimitive.Content
              onInteractOutside={(event) => event.preventDefault()}
              className="fixed z-[121] rounded-2xl border border-border bg-card p-4 outline-none"
              style={{ width: tooltip.width, left: tooltip.left, top: tooltip.top }}
            >
              <p className="text-xs font-semibold text-muted-foreground">
                Passo {currentStep + 1} di {TOUR_STEPS.length}
              </p>
              <DialogTitle className="mt-1 text-[17px] font-bold leading-snug">{step?.title ?? "Tour"}</DialogTitle>
              <DialogDescription className="mt-2 text-sm text-muted-foreground">{step?.body}</DialogDescription>

              <div className="mt-4 flex items-center justify-between gap-2">
                <Button variant="ghost" onClick={() => void completeOnboarding()}>
                  Chiudi
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handleBackStep} disabled={currentStep === 0}>
                    Indietro
                  </Button>
                  <Button onClick={handleNextStep}>
                    {currentStep >= TOUR_STEPS.length - 1 ? "Fine" : "Avanti"}
                  </Button>
                </div>
              </div>
            </DialogPrimitive.Content>
          </DialogPortal>
        </Dialog>
      )}

      {stage === "first-action" && (
        <OnboardingDialog
          title={firstActionTitle(onboardingRole)}
          onDismiss={() => void completeOnboarding()}
          className="max-w-md"
        >
          <div className="p-5 sm:p-6">
            <OnboardingFirstAction
              role={onboardingRole}
              onDismiss={() => void completeOnboarding()}
            />
          </div>
        </OnboardingDialog>
      )}
    </>
  );
}

/**
 * A step of the onboarding as a modal dialog (focus kept inside and given back, Escape = the
 * step's own «skip»): title and optional line in a header, the step below. Above the cookie
 * banner (z-[85]); a click outside does not close it.
 */
function OnboardingDialog({
  title,
  description,
  onDismiss,
  className,
  children,
}: {
  title: string;
  description?: string;
  onDismiss: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <DialogPortal>
        <DialogOverlay className="z-[120] bg-background/80" />
        <DialogPrimitive.Content
          // Without a description line, say so (Radix otherwise warns about a missing one).
          {...(description ? {} : { "aria-describedby": undefined })}
          onInteractOutside={(event) => event.preventDefault()}
          className={cn(
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 fixed left-1/2 top-1/2 z-[120] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card outline-none",
            className,
          )}
        >
          <div className="border-b border-border px-5 py-4 sm:px-6">
            <DialogTitle className="text-[17px] font-bold">{title}</DialogTitle>
            {description ? (
              <DialogDescription className="mt-1 text-sm text-muted-foreground">{description}</DialogDescription>
            ) : null}
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
