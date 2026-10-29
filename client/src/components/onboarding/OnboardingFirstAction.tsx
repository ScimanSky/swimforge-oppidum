import { useLocation } from "wouter";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type OnboardingRole } from "@/lib/onboarding";

type Props = {
  role: OnboardingRole;
  onDismiss: () => void;
};

/** Title of the last onboarding step (the dialog's title): it depends on the role. */
export function firstActionTitle(role: OnboardingRole): string {
  return role === "coach" ? "Crea il tuo club adesso" : "Registra la tua prima nuotata";
}

/** Last onboarding step: one suggested first action, or «Lo farò dopo». */
export function OnboardingFirstAction({ role, onDismiss }: Props) {
  const [, setLocation] = useLocation();

  const handleAction = (path: string) => {
    onDismiss();
    setLocation(path);
  };

  if (role === "coach") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          O unisciti a uno esistente con un codice invito.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => handleAction("/home/community?create=1")}>
            Crea club
            <ArrowRight aria-hidden />
          </Button>
          <Button variant="outline" onClick={() => handleAction("/home/community")}>
            Ho un codice invito
          </Button>
        </div>
        <Button variant="ghost" className="self-start" onClick={onDismiss}>
          Lo farò dopo
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Ci vogliono 30 secondi. Sblocchi subito il badge «Benvenuto» e <span className="font-semibold text-xp">+50 XP</span>.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => handleAction("/track")}>
          Vai alle attività
          <ArrowRight aria-hidden />
        </Button>
      </div>
      <Button variant="ghost" className="self-start" onClick={onDismiss}>
        Lo farò dopo
      </Button>
    </div>
  );
}
