import { useEffect, useId, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, MailCheck } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/_core/hooks/useAuth";
import { authErrorMessage, isPlausibleEmail, MIN_PASSWORD_LENGTH } from "@/lib/auth-errors";
import { postLoginPath, syncSupabaseSession } from "@/lib/auth-sync";
import { startNativeGoogleLogin } from "@/lib/native-auth";
import { homePathForPlatform } from "@/lib/navigation";
import { isNativePlatform } from "@/lib/platform";
import { publicSiteUrl } from "@/lib/public-url";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";

const features = [
  "Sincronizza automaticamente da Garmin e Strava",
  "Coach AI personalizzato per migliorare",
  "Sfida gli amici e guadagna badge",
  "Analisi avanzate delle prestazioni",
];

const GOOGLE_ERROR = "Errore durante l'accesso con Google";
const SIGNUP_FAILED = "Registrazione non riuscita. Riprova.";

type Field = "firstName" | "lastName" | "email" | "password" | "terms";

export default function Register() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { errors, show, clear } = useFieldErrors<Field>();
  const ids = {
    firstName: useId(),
    lastName: useId(),
    email: useId(),
    password: useId(),
    passwordHint: useId(),
    terms: useId(),
  };
  const utils = trpc.useUtils();

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) return;
    window.location.href = homePathForPlatform(isNativePlatform());
  }, [authLoading, isAuthenticated]);

  if (authLoading || isAuthenticated) return <AuthPending />;

  const pending = isLoading || isGoogleLoading;

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const valid = show(
      {
        firstName: firstName.trim() ? undefined : "Inserisci il nome.",
        lastName: lastName.trim() ? undefined : "Inserisci il cognome.",
        email: !email.trim()
          ? "Inserisci l'email."
          : !isPlausibleEmail(email)
            ? "Inserisci un'email valida, ad esempio nome@esempio.it."
            : undefined,
        password:
          password.length < MIN_PASSWORD_LENGTH
            ? `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`
            : undefined,
        terms: acceptedTerms ? undefined : "Accetta i Termini di Servizio e la Privacy Policy per continuare.",
      },
      [
        ["firstName", ids.firstName],
        ["lastName", ids.lastName],
        ["email", ids.email],
        ["password", ids.password],
        ["terms", ids.terms],
      ]
    );
    if (!valid) return;

    setIsLoading(true);
    const address = email.trim();
    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
    const { data, error } = await supabase.auth.signUp({
      email: address,
      password,
      options: {
        emailRedirectTo: publicSiteUrl("/auth/callback"),
        data: {
          full_name: fullName || undefined,
          name: fullName || undefined,
        },
      },
    });

    if (error) {
      setFormError(authErrorMessage(error, SIGNUP_FAILED));
      setIsLoading(false);
      return;
    }

    if (data.session) {
      try {
        const { isNewUser } = await syncSupabaseSession(
          data.session,
          (input) => utils.client.auth.syncSupabaseUser.mutate(input),
          { email: address, name: fullName || null },
        );
        toast.success("Registrazione completata!");
        setTimeout(() => {
          window.location.href = postLoginPath(isNewUser);
        }, 100);
      } catch (syncError) {
        // The server's messages for this step are English: the Italian fallback instead.
        console.error("[Register] syncSupabaseUser failed", syncError);
        setFormError(SIGNUP_FAILED);
        setIsLoading(false);
      }
      return;
    }

    setEmailSent(true);
    setIsLoading(false);
    toast.success("Controlla la tua email per confermare la registrazione.");
  };

  const handleGoogleRegister = async () => {
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

  const aside = {
    headline: "Inizia il tuo viaggio",
    body: (
      <ul className="space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-3">
            <Check className="size-4 shrink-0 text-action-text" aria-hidden />
            {feature}
          </li>
        ))}
      </ul>
    ),
  };

  if (emailSent) {
    return (
      <AuthLayout title="Controlla la tua email" aside={aside}>
        <div role="status" className="space-y-3 text-center">
          <MailCheck className="mx-auto size-8 text-action-text" aria-hidden />
          <p className="text-[15px]">
            Ti abbiamo inviato una mail di conferma a <span className="font-semibold">{email.trim()}</span>.
          </p>
          <p className="text-sm text-muted-foreground">
            Apri il link nella mail per attivare l&apos;account e completare la registrazione.
          </p>
        </div>
        <Button asChild className="mt-5 w-full">
          <Link href="/login">Vai al login</Link>
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Crea account"
      description="Inserisci i tuoi dati per registrarti."
      aside={aside}
      footer={
        <>
          Hai già un account?{" "}
          <Link href="/login" className="font-semibold text-action-text hover:underline">
            Accedi
          </Link>
        </>
      }
    >
      <form onSubmit={handleRegister} noValidate aria-label="Crea account con email e password" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={ids.firstName}>Nome</Label>
            <Input
              id={ids.firstName}
              autoComplete="given-name"
              placeholder="Marco"
              value={firstName}
              onChange={(event) => {
                setFirstName(event.target.value);
                clear("firstName");
              }}
              {...fieldAria(ids.firstName, errors.firstName)}
            />
            <FieldError fieldId={ids.firstName} error={errors.firstName} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.lastName}>Cognome</Label>
            <Input
              id={ids.lastName}
              autoComplete="family-name"
              placeholder="Rossi"
              value={lastName}
              onChange={(event) => {
                setLastName(event.target.value);
                clear("lastName");
              }}
              {...fieldAria(ids.lastName, errors.lastName)}
            />
            <FieldError fieldId={ids.lastName} error={errors.lastName} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.email}>Email</Label>
          <Input
            id={ids.email}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="nome@esempio.it"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              clear("email");
            }}
            {...fieldAria(ids.email, errors.email)}
          />
          <FieldError fieldId={ids.email} error={errors.email} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.password}>Password</Label>
          <PasswordInput
            id={ids.password}
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clear("password");
            }}
            {...fieldAria(ids.password, errors.password, ids.passwordHint)}
          />
          <FieldError fieldId={ids.password} error={errors.password} />
          <p id={ids.passwordHint} className="text-xs text-muted-foreground">
            Almeno {MIN_PASSWORD_LENGTH} caratteri.
          </p>
        </div>

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

        <FormError error={formError} />

        <Button type="submit" className="w-full" disabled={pending}>
          {isLoading ? "Creazione…" : "Crea account"}
          {!isLoading && <ArrowRight aria-hidden />}
        </Button>
      </form>

      <AuthDivider>oppure</AuthDivider>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleGoogleRegister}
        disabled={pending}
      >
        <GoogleIcon />
        {isGoogleLoading ? "Apertura di Google…" : "Continua con Google"}
      </Button>
    </AuthLayout>
  );
}
