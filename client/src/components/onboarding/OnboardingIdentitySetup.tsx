import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { trpc } from "@/lib/trpc";
import { type OnboardingRole, setOnboardingIdentityLocally } from "@/lib/onboarding";

const STROKES = [
  { value: "freestyle", label: "Stile libero" },
  { value: "backstroke", label: "Dorso" },
  { value: "breaststroke", label: "Rana" },
  { value: "butterfly", label: "Farfalla" },
  { value: "mixed", label: "Misto" },
] as const;

type StrokeValue = typeof STROKES[number]["value"]; // "freestyle" | "backstroke" | "breaststroke" | "butterfly" | "mixed"

type IdentityData = {
  role: OnboardingRole | null;
  stroke: StrokeValue | null;
  poolLength: number | null;
};

type Props = {
  userId: string | number;
  onComplete: (role: OnboardingRole) => void;
  onSkip: () => void;
};

const POOL_LENGTHS = [
  { value: 25, label: "25m — vasca corta" },
  { value: 50, label: "50m — vasca lunga" },
] as const;

const STEP_LABELS = ["Chi sei?", "Stile preferito", "Tipo di vasca"];

export function OnboardingIdentitySetup({ userId, onComplete, onSkip }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<IdentityData>({
    role: null,
    stroke: null,
    poolLength: null,
  });

  // profile.update is the existing tRPC mutation that accepts preferredStroke and preferredPoolLengthMeters
  const updateProfileMutation = trpc.profile.update.useMutation();

  const handleRoleSelect = (role: OnboardingRole) => {
    setData((d) => ({ ...d, role }));
    setCurrentStep(1);
  };

  const handleStrokeSelect = (stroke: StrokeValue) => {
    setData((d) => ({ ...d, stroke }));
    setCurrentStep(2);
  };

  const handlePoolSelect = async (poolLength: number) => {
    const updated: IdentityData = { ...data, poolLength };
    setData(updated);
    const role = updated.role ?? "athlete";
    try {
      await updateProfileMutation.mutateAsync({
        preferredStroke: updated.stroke ?? undefined,
        preferredPoolLengthMeters: updated.poolLength ?? undefined,
      });
    } catch {
      // Non-blocking — silent failure is intentional; identity is persisted locally as fallback
    }
    setOnboardingIdentityLocally({ role, completed: true }, userId);
    onComplete(role);
  };

  const handleSkipPool = async () => {
    const role = data.role ?? "athlete";
    try {
      await updateProfileMutation.mutateAsync({
        preferredStroke: data.stroke ?? undefined,
      });
    } catch {
      // Non-blocking
    }
    setOnboardingIdentityLocally({ role, completed: true }, userId);
    onComplete(role);
  };

  // Steps 2 and 3 appear after a choice: their title takes the focus (the chosen button is gone).
  // A stable callback: React calls it when a title mounts, not again on every render.
  const focusOnMount = useCallback(
    (element: HTMLHeadingElement | null) => element?.focus({ preventScroll: true }),
    [],
  );

  // The steps slide in from the side; with reduced motion they just swap.
  const reduceMotion = usePrefersReducedMotion();
  const stepMotion = reduceMotion
    ? { initial: false as const, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, x: 24 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -24 },
        transition: { duration: 0.22 },
      };

  const optionClass =
    "min-h-11 rounded-xl border border-border bg-raised px-4 py-3 text-left text-sm transition-colors hover:border-action-text focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

  return (
    <div className="flex flex-col gap-4">
      <div
        role="progressbar"
        aria-label="Configurazione"
        aria-valuemin={1}
        aria-valuemax={STEP_LABELS.length}
        aria-valuenow={currentStep + 1}
        aria-valuetext={`Passo ${currentStep + 1} di ${STEP_LABELS.length}: ${STEP_LABELS[currentStep]}`}
        className="flex gap-1.5"
      >
        {STEP_LABELS.map((label, idx) => (
          <span
            key={label}
            className={`h-1 flex-1 rounded-full transition-colors ${idx <= currentStep ? "bg-primary" : "bg-border"}`}
          />
        ))}
      </div>

      <p className="text-xs font-semibold text-muted-foreground">
        Passo {currentStep + 1} di {STEP_LABELS.length}
      </p>

      <AnimatePresence mode="wait">
        {currentStep === 0 && (
          <motion.div
            key="role"
            {...stepMotion}
            className="flex flex-col gap-3"
          >
            <h3 className="text-[17px] font-bold">Chi sei?</h3>
            <p className="text-sm text-muted-foreground">
              Personalizziamo l&apos;app in base al tuo ruolo.
            </p>
            <div className="mt-2 flex flex-col gap-2">
              <button type="button" onClick={() => handleRoleSelect("athlete")} className={optionClass}>
                <span className="block font-semibold">
                  <span aria-hidden>🏊 </span>Atleta
                </span>
                <span className="block text-xs text-muted-foreground">Voglio tracciare e gareggiare</span>
              </button>
              <button type="button" onClick={() => handleRoleSelect("coach")} className={optionClass}>
                <span className="block font-semibold">
                  <span aria-hidden>🎽 </span>Allenatore
                </span>
                <span className="block text-xs text-muted-foreground">Gestisco un club o una squadra</span>
              </button>
            </div>
          </motion.div>
        )}

        {currentStep === 1 && (
          <motion.div
            key="stroke"
            {...stepMotion}
            className="flex flex-col gap-3"
          >
            <h3 ref={focusOnMount} tabIndex={-1} className="text-[17px] font-bold outline-none">
              Stile preferito
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {STROKES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => handleStrokeSelect(s.value)}
                  className={`${optionClass} text-center`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" className="self-start" onClick={() => setCurrentStep(2)}>
              Salta
              <ArrowRight aria-hidden />
            </Button>
          </motion.div>
        )}

        {currentStep === 2 && (
          <motion.div
            key="pool"
            {...stepMotion}
            className="flex flex-col gap-3"
          >
            <h3 ref={focusOnMount} tabIndex={-1} className="text-[17px] font-bold outline-none">
              Tipo di vasca
            </h3>
            <div className="mt-2 flex flex-col gap-2">
              {POOL_LENGTHS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => void handlePoolSelect(p.value)}
                  className={optionClass}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" className="self-start" onClick={() => void handleSkipPool()}>
              Salta
              <ArrowRight aria-hidden />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="border-t border-border pt-3">
        <Button variant="ghost" className="text-muted-foreground" onClick={onSkip}>
          Salta configurazione
        </Button>
      </div>
    </div>
  );
}
