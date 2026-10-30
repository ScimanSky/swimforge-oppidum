import { useEffect, useId, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { AuthDivider, AuthLayout, AuthPending, GoogleIcon } from "@/components/auth/AuthLayout";
import {
  FieldError,
  FormError,
  PasswordInput,
  fieldAria,
  useFieldErrors,
} from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/_core/hooks/useAuth";
import { authErrorMessage, isPlausibleEmail } from "@/lib/auth-errors";
import { afterSyncPath, syncSupabaseSession } from "@/lib/auth-sync";
import { startNativeGoogleLogin } from "@/lib/native-auth";
import { homePathForPlatform } from "@/lib/navigation";
import { isNativePlatform } from "@/lib/platform";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";

const GOOGLE_ERROR = "Errore durante l'accesso con Google";
const LOGIN_FAILED = "Accesso non riuscito. Riprova.";

export default function Login() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { errors, show, clear } = useFieldErrors<"email" | "password">();
  const emailId = useId();
  const passwordId = useId();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) return;
    window.location.href = homePathForPlatform(isNativePlatform());
  }, [authLoading, isAuthenticated]);

  if (authLoading || isAuthenticated) return <AuthPending />;

  const pending = isLoading || isGoogleLoading;

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const valid = show(
      {
        email: !loginEmail.trim()
          ? "Inserisci l'email."
          : !isPlausibleEmail(loginEmail)
            ? "Inserisci un'email valida, ad esempio nome@esempio.it."
            : undefined,
        password: loginPassword ? undefined : "Inserisci la password.",
      },
      [
        ["email", emailId],
        ["password", passwordId],
      ]
    );
    if (!valid) return;

    setIsLoading(true);
    const email = loginEmail.trim();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: loginPassword,
    });

    if (error || !data.session) {
      setFormError(authErrorMessage(error, LOGIN_FAILED));
      setIsLoading(false);
      return;
    }

    try {
      const outcome = await syncSupabaseSession(
        data.session,
        (input) => utils.client.auth.syncSupabaseUser.mutate(input),
        { email },
      );
      if (!outcome.needsLegalAcceptance) toast.success("Login effettuato con successo!");
      setTimeout(() => {
        window.location.href = afterSyncPath(outcome);
      }, 100);
    } catch (syncError) {
      // The server's messages for this step are English: the Italian fallback instead.
      console.error("[Login] syncSupabaseUser failed", syncError);
      setFormError(LOGIN_FAILED);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setIsGoogleLoading(true);
      if (isNativePlatform()) {
        // Custom Tab + swimforge://auth/callback, completed in native-runtime (App.tsx).
        await startNativeGoogleLogin();
        setIsGoogleLoading(false);
        return;
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });

      if (error) {
        toast.error(GOOGLE_ERROR);
        console.error(error);
        setIsGoogleLoading(false);
      }
    } catch (error) {
      toast.error(GOOGLE_ERROR);
      console.error(error);
      setIsGoogleLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Accedi"
      description="Inserisci email e password per continuare."
      aside={{
        headline: "Bentornato in acqua",
        body: "Accedi per continuare a tracciare i tuoi progressi, sfidare gli amici e raggiungere i tuoi obiettivi.",
      }}
      footer={
        <>
          Non hai un account?{" "}
          <Link href="/register" className="font-semibold text-action-text hover:underline">
            Registrati
          </Link>
        </>
      }
    >
      <form onSubmit={handleLogin} noValidate aria-label="Accedi con email e password" className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={emailId}>Email</Label>
          <Input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="nome@esempio.it"
            value={loginEmail}
            onChange={(event) => {
              setLoginEmail(event.target.value);
              clear("email");
            }}
            {...fieldAria(emailId, errors.email)}
          />
          <FieldError fieldId={emailId} error={errors.email} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={passwordId}>Password</Label>
            <Link
              href="/forgot-password"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-action-text hover:underline"
            >
              Password dimenticata?
            </Link>
          </div>
          <PasswordInput
            id={passwordId}
            autoComplete="current-password"
            placeholder="La tua password"
            value={loginPassword}
            onChange={(event) => {
              setLoginPassword(event.target.value);
              clear("password");
            }}
            {...fieldAria(passwordId, errors.password)}
          />
          <FieldError fieldId={passwordId} error={errors.password} />
        </div>

        <FormError error={formError} />

        <Button type="submit" className="w-full" disabled={pending}>
          {isLoading ? "Accesso…" : "Accedi"}
          {!isLoading && <ArrowRight aria-hidden />}
        </Button>
      </form>

      <AuthDivider>oppure</AuthDivider>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleGoogleLogin}
        disabled={pending}
      >
        <GoogleIcon />
        {isGoogleLoading ? "Apertura di Google…" : "Continua con Google"}
      </Button>
    </AuthLayout>
  );
}
