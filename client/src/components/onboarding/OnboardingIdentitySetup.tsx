import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { type OnboardingRole, setOnboardingIdentityLocally } from "@/lib/onboarding";

type IdentityData = {
  role: OnboardingRole | null;
  stroke: string | null;
  poolLength: number | null;
};

type Props = {
  userId: string | number;
  onComplete: (role: OnboardingRole) => void;
  onSkip: () => void;
};

const STROKES = [
  { value: "freestyle", label: "Stile libero" },
  { value: "backstroke", label: "Dorso" },
  { value: "breaststroke", label: "Rana" },
  { value: "butterfly", label: "Farfalla" },
  { value: "mixed", label: "Misto" },
] as const;

const POOL_LENGTHS = [
  { value: 25, label: "25m — vasca corta" },
  { value: 50, label: "50m — vasca lunga" },
] as const;

const STEP_LABELS = ["Chi sei?", "Stile preferito", "Tipo di vasca", "Foto profilo"];

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

  const handleStrokeSelect = (stroke: string) => {
    setData((d) => ({ ...d, stroke }));
    setCurrentStep(2);
  };

  const handlePoolSelect = (poolLength: number) => {
    setData((d) => ({ ...d, poolLength }));
    setCurrentStep(3);
  };

  const handleFinish = async () => {
    const role = data.role ?? "athlete";
    try {
      await updateProfileMutation.mutateAsync({
        preferredStroke: (data.stroke as "freestyle" | "backstroke" | "breaststroke" | "butterfly" | "mixed") ?? undefined,
        preferredPoolLengthMeters: data.poolLength ?? undefined,
      });
    } catch {
      // Non-blocking
    }
    setOnboardingIdentityLocally({ role, completed: true }, userId);
    onComplete(role);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Progress bar */}
      <div className="flex gap-1.5 px-1">
        {STEP_LABELS.map((_, idx) => (
          <div
            key={idx}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{
              background:
                idx <= currentStep
                  ? "var(--electric-cyan)"
                  : "color-mix(in oklch, var(--border) 60%, transparent)",
            }}
          />
        ))}
      </div>

      <div className="text-xs uppercase tracking-[0.16em] text-[var(--electric-cyan)]">
        Setup {currentStep + 1} di {STEP_LABELS.length}
      </div>

      <AnimatePresence mode="wait">
        {currentStep === 0 && (
          <motion.div
            key="role"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22 }}
            className="flex flex-col gap-3"
          >
            <h3 className="font-display text-xl font-semibold text-foreground">Chi sei?</h3>
            <p className="text-sm text-muted-foreground">
              Personalizziamo l&apos;app in base al tuo ruolo.
            </p>
            <div className="mt-2 flex flex-col gap-2">
              <button
                onClick={() => handleRoleSelect("athlete")}
                className="rounded-xl border border-border/60 bg-surface-panel/40 px-4 py-3 text-left transition hover:border-[var(--electric-cyan)] hover:bg-[color-mix(in_oklch,var(--electric-cyan)_8%,transparent)]"
              >
                <div className="font-medium text-foreground">🏊 Atleta</div>
                <div className="text-xs text-muted-foreground">Voglio tracciare e gareggiare</div>
              </button>
              <button
                onClick={() => handleRoleSelect("coach")}
                className="rounded-xl border border-border/60 bg-surface-panel/40 px-4 py-3 text-left transition hover:border-[var(--electric-cyan)] hover:bg-[color-mix(in_oklch,var(--electric-cyan)_8%,transparent)]"
              >
                <div className="font-medium text-foreground">🎽 Allenatore</div>
                <div className="text-xs text-muted-foreground">Gestisco un club o una squadra</div>
              </button>
            </div>
          </motion.div>
        )}

        {currentStep === 1 && (
          <motion.div
            key="stroke"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22 }}
            className="flex flex-col gap-3"
          >
            <h3 className="font-display text-xl font-semibold text-foreground">Stile preferito</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {STROKES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => handleStrokeSelect(s.value)}
                  className="rounded-xl border border-border/60 bg-surface-panel/40 px-3 py-2.5 text-sm text-foreground transition hover:border-[var(--electric-cyan)]"
                >
                  {s.label}
                </button>
              ))}
            </div>
            <Button variant="ghost-neon" className="mt-1 self-start text-xs" onClick={() => setCurrentStep(2)}>
              Salta →
            </Button>
          </motion.div>
        )}

        {currentStep === 2 && (
          <motion.div
            key="pool"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22 }}
            className="flex flex-col gap-3"
          >
            <h3 className="font-display text-xl font-semibold text-foreground">Tipo di vasca</h3>
            <div className="mt-2 flex flex-col gap-2">
              {POOL_LENGTHS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => handlePoolSelect(p.value)}
                  className="rounded-xl border border-border/60 bg-surface-panel/40 px-4 py-3 text-left text-sm text-foreground transition hover:border-[var(--electric-cyan)]"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button variant="ghost-neon" className="mt-1 self-start text-xs" onClick={() => setCurrentStep(3)}>
              Salta →
            </Button>
          </motion.div>
        )}

        {currentStep === 3 && (
          <motion.div
            key="avatar"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22 }}
            className="flex flex-col gap-3"
          >
            <h3 className="font-display text-xl font-semibold text-foreground">Foto profilo</h3>
            <p className="text-sm text-muted-foreground">Opzionale — puoi aggiungerla dopo.</p>
            <div className="mt-2 flex gap-3">
              <Button variant="neon" onClick={() => void handleFinish()}>
                Continua senza foto
              </Button>
              <Button variant="outline-neon" asChild>
                <a href="/settings#avatar" onClick={() => void handleFinish()}>
                  Vai alle impostazioni
                </a>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-2 border-t border-border/40 pt-3">
        <Button variant="ghost-neon" className="text-xs text-muted-foreground" onClick={onSkip}>
          Salta configurazione
        </Button>
      </div>
    </div>
  );
}
