import { useEffect, useId, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/auth/AuthLayout";
import {
  FieldError,
  FormError,
  PasswordInput,
  fieldAria,
  useFieldErrors,
} from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { authErrorMessage, MIN_PASSWORD_LENGTH } from "@/lib/auth-errors";
import { supabase } from "@/lib/supabase";

const ASIDE = {
  headline: "Imposta una nuova password",
  body: "Scegli una password sicura per il tuo account.",
};

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { errors, show, clear } = useFieldErrors<"password" | "confirm">();
  const passwordId = useId();
  const passwordHintId = useId();
  const confirmId = useId();

  useEffect(() => {
    let mounted = true;

    const initSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setHasSession(Boolean(data.session));
      setIsReady(true);
    };

    initSession();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setHasSession(Boolean(session));
        setIsReady(true);
      }
    });

    return () => {
      mounted = false;
      subscription?.subscription.unsubscribe();
    };
  }, []);

  const handleReset = async (event: FormEvent) => {
    event.preventDefault();
    if (isLoading) return;
    setFormError(null);
    const valid = show(
      {
        password:
          password.length < MIN_PASSWORD_LENGTH
            ? `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`
            : undefined,
        confirm: !confirmPassword
          ? "Ripeti la password."
          : password !== confirmPassword
            ? "Le password non coincidono."
            : undefined,
      },
      [
        ["password", passwordId],
        ["confirm", confirmId],
      ]
    );
    if (!valid) return;

    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setFormError(authErrorMessage(error, "Aggiornamento non riuscito. Riprova."));
      setIsLoading(false);
      return;
    }

    toast.success("Password aggiornata. Effettua il login.");
    await supabase.auth.signOut();
    setTimeout(() => {
      window.location.href = "/login";
    }, 300);
  };

  if (!isReady) {
    return (
      <AuthLayout title="Nuova password" aside={ASIDE}>
        <p role="status" className="text-center text-sm text-muted-foreground">
          Verifica del link in corso…
        </p>
      </AuthLayout>
    );
  }

  if (!hasSession) {
    return (
      <AuthLayout title="Link non valido" aside={ASIDE}>
        <p className="text-center text-[15px]">Il link non è valido o è scaduto.</p>
        <Button asChild variant="outline" className="mt-5 w-full">
          <Link href="/forgot-password">Richiedi un nuovo link</Link>
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Nuova password"
      description="Inserisci e conferma la nuova password."
      aside={ASIDE}
      footer={
        <Link href="/login" className="font-semibold text-action-text hover:underline">
          Torna al login
        </Link>
      }
    >
      <form onSubmit={handleReset} noValidate aria-label="Imposta la nuova password" className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={passwordId}>Nuova password</Label>
          <PasswordInput
            id={passwordId}
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clear("password");
            }}
            {...fieldAria(passwordId, errors.password, passwordHintId)}
          />
          <FieldError fieldId={passwordId} error={errors.password} />
          <p id={passwordHintId} className="text-xs text-muted-foreground">
            Almeno {MIN_PASSWORD_LENGTH} caratteri.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={confirmId}>Conferma password</Label>
          <PasswordInput
            id={confirmId}
            autoComplete="new-password"
            showLabel="Mostra la conferma della password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              clear("confirm");
            }}
            {...fieldAria(confirmId, errors.confirm)}
          />
          <FieldError fieldId={confirmId} error={errors.confirm} />
        </div>

        <FormError error={formError} />

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Aggiornamento…" : "Aggiorna password"}
          {!isLoading && <ArrowRight aria-hidden />}
        </Button>
      </form>
    </AuthLayout>
  );
}
