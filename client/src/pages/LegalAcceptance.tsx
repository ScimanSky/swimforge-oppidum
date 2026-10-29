import { useEffect, useId, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { FieldError, FormError, fieldAria, useFieldErrors } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LEGAL_ACCEPTANCE, afterSyncPath, syncSupabaseSession } from "@/lib/auth-sync";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";

const ACCEPT_FAILED = "Non è stato possibile completare l'accesso. Riprova.";

type Field = "terms" | "age";

/**
 * `/auth/consenso`: the acceptance step of a sign-in that has not accepted Termini and Privacy yet
 * (the first Google sign-in, web and app). Same checkboxes as the registration form; the account
 * is created and the consents recorded only once they are ticked. «Annulla» signs out.
 */
export default function LegalAcceptance() {
  const [, navigate] = useLocation();
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [confirmedAge, setConfirmedAge] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { errors, show, clear } = useFieldErrors<Field>();
  const ids = { terms: useId(), age: useId() };
  const utils = trpc.useUtils();

  // Nothing to accept without the Google (Supabase) session: back to the sign-in.
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate("/login", { replace: true });
    });
  }, [navigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const valid = show(
      {
        terms: acceptedTerms ? undefined : "Accetta i Termini di Servizio e la Privacy Policy per continuare.",
        age: confirmedAge ? undefined : "Per usare SwimForge devi avere almeno 14 anni.",
      },
      [
        ["terms", ids.terms],
        ["age", ids.age],
      ],
    );
    if (!valid) return;

    setPending(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate("/login", { replace: true });
        return;
      }
      const outcome = await syncSupabaseSession(
        data.session,
        (input) => utils.client.auth.syncSupabaseUser.mutate(input),
        {},
        LEGAL_ACCEPTANCE,
      );
      if (outcome.needsLegalAcceptance) throw new Error("acceptance not recorded");
      toast.success("Accesso effettuato con successo!");
      window.location.href = afterSyncPath(outcome);
    } catch (error) {
      console.error("[LegalAcceptance] sync failed", error);
      setFormError(ACCEPT_FAILED);
      setPending(false);
    }
  };

  const handleCancel = async () => {
    await supabase.auth.signOut().catch(() => {});
    navigate("/login", { replace: true });
  };

  return (
    <AuthLayout
      title="Ancora un passo"
      description="Per usare SwimForge accetta Termini e Privacy e conferma la tua età."
      aside={{
        headline: "Benvenuto in SwimForge",
        body: "Accettati i termini creiamo il tuo account e ti portiamo nell'app.",
      }}
    >
      <form onSubmit={handleSubmit} noValidate aria-label="Accetta Termini e Privacy" className="space-y-4">
        <div className="space-y-1">
          <div className="flex min-h-11 items-start gap-3">
            <Checkbox
              id={ids.terms}
              className="mt-0.5"
              checked={acceptedTerms}
              onCheckedChange={(value) => {
                setAcceptedTerms(Boolean(value));
                clear("terms");
              }}
              {...fieldAria(ids.terms, errors.terms)}
            />
            <label htmlFor={ids.terms} className="text-sm text-muted-foreground">
              Accetto i{" "}
              <Link href="/terms" className="font-semibold text-action-text hover:underline">
                Termini di Servizio
              </Link>{" "}
              e la{" "}
              <Link href="/privacy" className="font-semibold text-action-text hover:underline">
                Privacy Policy
              </Link>
            </label>
          </div>
          <FieldError fieldId={ids.terms} error={errors.terms} />
        </div>

        <div className="space-y-1">
          <div className="flex min-h-11 items-start gap-3">
            <Checkbox
              id={ids.age}
              className="mt-0.5"
              checked={confirmedAge}
              onCheckedChange={(value) => {
                setConfirmedAge(Boolean(value));
                clear("age");
              }}
              {...fieldAria(ids.age, errors.age)}
            />
            <label htmlFor={ids.age} className="text-sm text-muted-foreground">
              Dichiaro di avere almeno 14 anni
            </label>
          </div>
          <FieldError fieldId={ids.age} error={errors.age} />
        </div>

        <FormError error={formError} />

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Un attimo…" : "Accetta e continua"}
          {!pending && <ArrowRight aria-hidden />}
        </Button>
        <Button type="button" variant="outline" className="w-full" onClick={() => void handleCancel()} disabled={pending}>
          Annulla
        </Button>
      </form>
    </AuthLayout>
  );
}
