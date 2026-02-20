import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Trophy, Target, Zap, X } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ONBOARDING_CONSENT_TYPE, isOnboardingCompletedLocally } from "@/lib/onboarding";
import { SwimForgeMark } from "@/components/brand/SwimForgeBrand";

const POPUP_VERSION = "season-launch-s1-v1";
const SEASON_POPUP_DATASET_KEY = "seasonLaunchOpen";
const SEASON_POPUP_EVENT = "swimforge:season-popup:state";

function getStorageKey(userId: string) {
  return `swimforge:feature-popup:${POPUP_VERSION}:${userId}`;
}

export default function SeasonLaunchPopup() {
  const { isAuthenticated, user } = useAuth();
  const [location] = useLocation();
  const userId = user?.id ? String(user.id) : "";
  const [open, setOpen] = useState(false);
  const [bootChecked, setBootChecked] = useState(false);
  const pathname = useMemo(() => location.split("?")[0] || "/", [location]);
  const isProfileSetupPath = pathname === "/settings";

  const seasonQuery = trpc.season.getCurrent.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const consentsQuery = trpc.consent.list.useQuery(undefined, {
    enabled: isAuthenticated && Boolean(userId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const onboardingServerDone = Boolean((consentsQuery.data as any)?.byType?.[ONBOARDING_CONSENT_TYPE]?.granted);
  const onboardingLocalDone = isOnboardingCompletedLocally(userId);
  const onboardingDone = onboardingServerDone || onboardingLocalDone;

  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    const storageKey = getStorageKey(userId);
    const alreadySeen = localStorage.getItem(storageKey) === "1";
    const canOpen = !alreadySeen && onboardingDone && !isProfileSetupPath;
    setOpen(canOpen);
    setBootChecked(true);
  }, [isAuthenticated, userId, onboardingDone, isProfileSetupPath]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    document.documentElement.dataset[SEASON_POPUP_DATASET_KEY] = open ? "1" : "0";
    window.dispatchEvent(new CustomEvent(SEASON_POPUP_EVENT, { detail: { open } }));

    return () => {
      document.documentElement.dataset[SEASON_POPUP_DATASET_KEY] = "0";
      window.dispatchEvent(new CustomEvent(SEASON_POPUP_EVENT, { detail: { open: false } }));
    };
  }, [open]);

  const handleClose = () => {
    if (userId) {
      localStorage.setItem(getStorageKey(userId), "1");
    }
    setOpen(false);
  };

  const missionCount = useMemo(() => {
    const daily = Number(seasonQuery.data?.missions?.daily?.length ?? 0);
    const weekly = Number(seasonQuery.data?.missions?.weekly?.length ?? 0);
    return daily + weekly;
  }, [seasonQuery.data?.missions?.daily?.length, seasonQuery.data?.missions?.weekly?.length]);

  if (!isAuthenticated || !bootChecked) return null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-background/75 px-4 py-6 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            className="relative w-full max-w-4xl overflow-y-auto max-h-[90dvh] rounded-3xl border border-primary/30 bg-background/90 shadow-[0_0_80px_rgba(0,229,255,0.24)] scrollbar-hide"
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 18, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-3 top-3 z-50 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-background/80 text-muted-foreground transition hover:border-primary/40 hover:text-primary backdrop-blur-sm"
              onClick={handleClose}
              aria-label="Chiudi annuncio stagione"
            >
              <X className="size-4" />
            </button>

            <div className="grid gap-0 md:grid-cols-[1.1fr_1fr]">
              <div className="relative min-h-[280px] md:min-h-[460px]">
                <div className="absolute inset-0 bg-[linear-gradient(150deg,#0f1d2d_0%,#14324a_46%,#0f2337_100%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(68%_84%_at_14%_0%,rgba(14,165,233,0.34),transparent_70%),radial-gradient(54%_68%_at_84%_18%,rgba(34,211,238,0.24),transparent_74%)]" />
                <div className="relative z-10 flex h-full flex-col items-start justify-end gap-5 p-8">
                  <div className="inline-flex items-center gap-3 rounded-2xl border border-border/65 bg-background/45 px-4 py-3 backdrop-blur-md">
                    <SwimForgeMark className="size-10" />
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Season 1</p>
                      <p className="font-display text-lg font-semibold text-foreground">Electric Ice</p>
                    </div>
                  </div>
                  <p className="max-w-sm text-sm text-foreground/90">
                    Nuovo layout attivo: missioni, badge e progressi in un'unica esperienza visuale coerente.
                  </p>
                </div>
              </div>

              <div className="flex flex-col justify-between p-6 md:p-8">
                <div className="space-y-4">
                  <Badge variant="outline" className="w-fit border-primary/40 text-primary">
                    <Sparkles className="mr-1.5 size-3.5" />
                    Nuova Feature
                  </Badge>
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Season 1</p>
                    <h2 className="font-display text-2xl font-bold leading-tight md:text-3xl">
                      Electric Ice è ufficialmente live
                    </h2>
                    <p className="text-sm text-muted-foreground md:text-base">
                      È iniziata la prima stagione: Battle Pass, missioni dinamiche, badge esclusivi e classifica dedicata.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border/70 bg-background/65 p-3">
                      <div className="mb-1 flex items-center gap-1.5 text-primary">
                        <Target className="size-4" />
                        <span className="text-[11px] uppercase tracking-[0.14em]">Missioni</span>
                      </div>
                      <p className="text-sm font-semibold">{missionCount || 6} attive</p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/65 p-3">
                      <div className="mb-1 flex items-center gap-1.5 text-primary">
                        <Trophy className="size-4" />
                        <span className="text-[11px] uppercase tracking-[0.14em]">Reward</span>
                      </div>
                      <p className="text-sm font-semibold">12 badge Season</p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/65 p-3">
                      <div className="mb-1 flex items-center gap-1.5 text-primary">
                        <Zap className="size-4" />
                        <span className="text-[11px] uppercase tracking-[0.14em]">Progressione</span>
                      </div>
                      <p className="text-sm font-semibold">XP live + livelli</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">Questa presentazione appare una sola volta.</p>
                  <Button variant="neon" onClick={handleClose} className="min-w-[170px]">
                    Entra nella Season
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
