import { useId, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { ArrowRight, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { FieldError, FormError, fieldAria, useFieldErrors } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authErrorMessage, isPlausibleEmail } from "@/lib/auth-errors";
import { publicSiteUrl } from "@/lib/public-url";
import { supabase } from "@/lib/supabase";

const ASIDE = {
  headline: "Recupero password",
  body: "Ti invieremo un link per impostare una nuova password.",
};

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { errors, show, clear } = useFieldErrors<"email">();
  const emailId = useId();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isLoading) return;
    setFormError(null);
    const valid = show(
      {
        email: !email.trim()
          ? "Inserisci l'email."
          : !isPlausibleEmail(email)
            ? "Inserisci un'email valida, ad esempio nome@esempio.it."
            : undefined,
      },
      [["email", emailId]]
    );
    if (!valid) return;

    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: publicSiteUrl("/reset-password"),
    });

    if (error) {
      setFormError(authErrorMessage(error, "Invio non riuscito. Riprova."));
      setIsLoading(false);
      return;
    }

    setIsSent(true);
    setIsLoading(false);
    toast.success("Email inviata! Controlla la tua casella di posta.");
  };

  if (isSent) {
    return (
      <AuthLayout title="Controlla la tua email" aside={ASIDE}>
        <div role="status" className="space-y-3 text-center">
          <MailCheck className="mx-auto size-8 text-action-text" aria-hidden />
          <p className="text-[15px]">
            Abbiamo inviato il link di recupero a <span className="font-semibold">{email.trim()}</span>.
          </p>
          <p className="text-sm text-muted-foreground">Se non lo vedi, controlla anche la cartella spam.</p>
        </div>
        <Button asChild variant="outline" className="mt-5 w-full">
          <Link href="/login">Torna al login</Link>
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Password dimenticata"
      description="Inserisci l'email per ricevere il link di recupero."
      aside={ASIDE}
      footer={
        <>
          Ricordi la password?{" "}
          <Link href="/login" className="font-semibold text-action-text hover:underline">
            Accedi
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate aria-label="Recupero password" className="space-y-4">
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
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              clear("email");
            }}
            {...fieldAria(emailId, errors.email)}
          />
          <FieldError fieldId={emailId} error={errors.email} />
        </div>

        <FormError error={formError} />

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Invio…" : "Invia link"}
          {!isLoading && <ArrowRight aria-hidden />}
        </Button>
      </form>
    </AuthLayout>
  );
}
