import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { type OnboardingRole } from "@/lib/onboarding";

type Props = {
  role: OnboardingRole;
  onDismiss: () => void;
};

export function OnboardingFirstAction({ role, onDismiss }: Props) {
  const [, setLocation] = useLocation();

  const handleAction = (path: string) => {
    onDismiss();
    setLocation(path);
  };

  if (role === "coach") {
    return (
      <div className="flex flex-col gap-4">
        <h3 className="font-display text-xl font-semibold text-foreground">
          Crea il tuo club adesso
        </h3>
        <p className="text-sm text-muted-foreground">
          O unisciti ad uno esistente con un codice invito.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="neon" onClick={() => handleAction("/home/community?create=1")}>
            → Crea club
          </Button>
          <Button variant="outline-neon" onClick={() => handleAction("/home/community")}>
            Ho un codice invito
          </Button>
        </div>
        <Button variant="ghost-neon" className="mt-1 text-xs" onClick={onDismiss}>
          Lo farò dopo
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-xl font-semibold text-foreground">
        Logga la tua prima vasca
      </h3>
      <p className="text-sm text-muted-foreground">
        Ci vogliono 30 secondi. Sblocchi subito il badge &ldquo;Benvenuto&rdquo; e +50 XP.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="neon" onClick={() => handleAction("/track")}>
          → Log attività
        </Button>
      </div>
      <Button variant="ghost-neon" className="mt-1 text-xs" onClick={onDismiss}>
        Lo farò dopo
      </Button>
    </div>
  );
}
