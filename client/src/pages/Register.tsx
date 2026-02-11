"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Surface,
  SurfaceContent,
  SurfaceDescription,
  SurfaceHeader,
  SurfaceTitle,
} from "@/components/ui/surface";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Waves, Eye, EyeOff, ArrowRight, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import { useAuth } from "@/_core/hooks/useAuth";

const features = [
  "Sincronizza automaticamente da Garmin e Strava",
  "AI Coach personalizzato per migliorare",
  "Sfida amici e guadagna badge",
  "Analisi avanzate delle performance",
];

export default function Register() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) return;
    window.location.href = "/dashboard";
  }, [authLoading, isAuthenticated]);

  if (authLoading || isAuthenticated) {
    return <div className="min-h-screen bg-background" />;
  }

  const syncSupabaseUserMutation = trpc.auth.syncSupabaseUser.useMutation({
    onSuccess: (data) => {
      toast.success("Registrazione completata!");
      setTimeout(() => {
        window.location.href = data?.isNewUser ? "/settings?tab=profile&onboarding=1" : "/dashboard";
      }, 100);
    },
    onError: (error) => {
      toast.error(error.message || "Errore durante la registrazione");
      setIsLoading(false);
    },
  });

  const handleContinue = () => {
    if (!firstName || !lastName) {
      toast.error("Inserisci nome e cognome");
      return;
    }
    if (!email) {
      toast.error("Inserisci un'email valida");
      return;
    }
    if (!password || password.length < 8) {
      toast.error("La password deve avere almeno 8 caratteri");
      return;
    }
    if (!acceptedTerms) {
      toast.error("Devi accettare i termini di servizio");
      return;
    }
    setStep(2);
  };

  const handleRegister = async () => {
    if (!email || !password) {
      toast.error("Inserisci email e password");
      return;
    }
    setIsLoading(true);

    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: fullName || undefined,
          name: fullName || undefined,
        },
      },
    });

    if (error) {
      toast.error(error.message || "Errore durante la registrazione");
      setIsLoading(false);
      return;
    }

    if (data.session) {
      syncSupabaseUserMutation.mutate({
        accessToken: data.session.access_token,
        user: {
          id: data.user?.id ?? "",
          email: data.user?.email ?? email,
          name:
            data.user?.user_metadata?.full_name ||
            data.user?.user_metadata?.name ||
            fullName ||
            null,
        },
      });
      return;
    }

    setEmailSent(true);
    setIsLoading(false);
    toast.success("Controlla la tua email per confermare la registrazione.");
  };

  const handleGoogleRegister = async () => {
    try {
      setIsGoogleLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });

      if (error) {
        toast.error("Errore durante l'accesso con Google");
        console.error(error);
        setIsGoogleLoading(false);
      }
    } catch (error) {
      toast.error("Errore durante l'accesso con Google");
      console.error(error);
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background dark:bg-[radial-gradient(circle_at_top,_var(--neon-soft),_transparent_65%)] flex relative">
      <ThemeToggleButton className="absolute right-4 top-4 z-20" />
      {/* Left Side - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <Image src="/images/open-water.jpg" alt="Open water swimmer" fill className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 to-transparent" />
        <div className="absolute bottom-12 left-12 max-w-md">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Waves className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="font-display text-2xl font-bold text-foreground">
              SwimForge
            </span>
          </div>
          <h2 className="text-3xl font-display font-bold text-foreground mb-4">
            Inizia il tuo viaggio
          </h2>
          <ul className="space-y-3">
            {features.map((feature, index) => (
              <li key={index} className="flex items-center gap-3 text-muted-foreground">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                  <Check className="w-3 h-3 text-primary" />
                </div>
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Waves className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="font-display text-2xl font-bold text-foreground">
              SwimForge
            </span>
          </div>

          <Surface className="bg-card border-border">
            <SurfaceHeader className="text-center">
              <SurfaceTitle className="text-2xl font-display">Crea Account</SurfaceTitle>
              <SurfaceDescription>
                {step === 1
                  ? "Inserisci i tuoi dati per registrarti"
                  : "Configura il tuo profilo nuotatore"}
              </SurfaceDescription>
              <div className="flex items-center justify-center gap-2 mt-4">
                <div className={`w-8 h-1 rounded ${step >= 1 ? "bg-primary" : "bg-muted"}`} />
                <div className={`w-8 h-1 rounded ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
              </div>
            </SurfaceHeader>
            <SurfaceContent className="space-y-4">
              {emailSent ? (
                <div className="space-y-3 text-center">
                  <div className="text-sm text-muted-foreground">
                    Ti abbiamo inviato una mail di conferma a
                    <span className="text-foreground font-medium"> {email}</span>.
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Clicca sul link nella mail per attivare l&apos;account e completare la
                    registrazione.
                  </div>
                  <Link href="/login" className="inline-flex w-full">
                    <Button className="w-full">Vai al login</Button>
                  </Link>
                </div>
              ) : step === 1 ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Nome</Label>
                      <Input
                        placeholder="Marco"
                        className="bg-secondary border-0"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        disabled={isLoading || isGoogleLoading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Cognome</Label>
                      <Input
                        placeholder="Rossi"
                        className="bg-secondary border-0"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        disabled={isLoading || isGoogleLoading}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      placeholder="nome@esempio.com"
                      className="bg-secondary border-0"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading || isGoogleLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Minimo 8 caratteri"
                        className="bg-secondary border-0 pr-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading || isGoogleLoading}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full"
                        onClick={() => setShowPassword((prev) => !prev)}
                        disabled={isLoading || isGoogleLoading}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="terms"
                      className="mt-1"
                      checked={acceptedTerms}
                      onCheckedChange={(value) => setAcceptedTerms(Boolean(value))}
                      disabled={isLoading || isGoogleLoading}
                    />
                    <label htmlFor="terms" className="text-sm text-muted-foreground">
                      Accetto i{" "}
                      <Link href="/terms" className="text-primary hover:underline">
                        Termini di Servizio
                      </Link>{" "}
                      e la{" "}
                      <Link href="/privacy" className="text-primary hover:underline">
                        Privacy Policy
                      </Link>
                    </label>
                  </div>

                  <Button
                    className="w-full gap-2"
                    onClick={handleContinue}
                    disabled={isLoading || isGoogleLoading}
                  >
                    Continua
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Livello Esperienza</Label>
                    <Select>
                      <SelectTrigger className="bg-secondary border-0">
                        <SelectValue placeholder="Seleziona il tuo livello" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Principiante</SelectItem>
                        <SelectItem value="intermediate">Intermedio</SelectItem>
                        <SelectItem value="advanced">Avanzato</SelectItem>
                        <SelectItem value="competitive">Agonista</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Stile Preferito</Label>
                    <Select>
                      <SelectTrigger className="bg-secondary border-0">
                        <SelectValue placeholder="Il tuo stile principale" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="freestyle">Stile Libero</SelectItem>
                        <SelectItem value="backstroke">Dorso</SelectItem>
                        <SelectItem value="breaststroke">Rana</SelectItem>
                        <SelectItem value="butterfly">Farfalla</SelectItem>
                        <SelectItem value="mixed">Misti</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Obiettivo Principale</Label>
                    <Select>
                      <SelectTrigger className="bg-secondary border-0">
                        <SelectValue placeholder="Cosa vuoi ottenere?" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fitness">Fitness e Salute</SelectItem>
                        <SelectItem value="speed">Migliorare la Velocita</SelectItem>
                        <SelectItem value="endurance">Aumentare la Resistenza</SelectItem>
                        <SelectItem value="technique">Perfezionare la Tecnica</SelectItem>
                        <SelectItem value="compete">Competere in Gare</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline-neon"
                      className="flex-1 bg-transparent"
                      onClick={() => setStep(1)}
                      disabled={isLoading || isGoogleLoading}
                    >
                      Indietro
                    </Button>
                    <Button
                      variant="neon"
                      className="w-full flex-1 gap-2"
                      onClick={handleRegister}
                      disabled={isLoading || isGoogleLoading}
                    >
                      {isLoading ? "Creazione..." : "Crea Account"}
                      {!isLoading && <ArrowRight className="w-4 h-4" />}
                    </Button>
                  </div>
                </>
              )}

              {step === 1 && !emailSent && (
                <>
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-card px-2 text-muted-foreground">
                        oppure registrati con
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <Button
                      variant="outline-neon"
                      className="gap-2 bg-transparent"
                      onClick={handleGoogleRegister}
                      disabled={isLoading || isGoogleLoading}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="currentColor"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      Google
                    </Button>
                  </div>

                  <p className="text-center text-sm text-muted-foreground mt-6">
                    Hai gia un account?{" "}
                    <Link href="/login" className="text-primary hover:underline">
                      Accedi
                    </Link>
                  </p>
                </>
              )}
            </SurfaceContent>
          </Surface>
        </div>
      </div>
    </div>
  );
}
