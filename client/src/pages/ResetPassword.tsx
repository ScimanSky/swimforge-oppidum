"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Waves, Eye, EyeOff, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import ThemeToggleButton from "@/components/ThemeToggleButton";

export default function ResetPassword() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

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

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 8) {
      toast.error("La password deve avere almeno 8 caratteri");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Le password non coincidono");
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message || "Errore durante l'aggiornamento");
      setIsLoading(false);
      return;
    }

    toast.success("Password aggiornata. Effettua il login.");
    await supabase.auth.signOut();
    setTimeout(() => {
      window.location.href = "/login";
    }, 300);
  };

  return (
    <div className="min-h-screen bg-background flex relative">
      <ThemeToggleButton className="absolute right-4 top-4 z-20" />
      <div className="hidden lg:flex lg:w-1/2 relative">
        <Image src="/images/hero-swimmer.jpg" alt="Swimmer" fill className="object-cover" />
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
          <h2 className="text-3xl font-display font-bold text-foreground mb-2">
            Imposta una nuova password
          </h2>
          <p className="text-muted-foreground">
            Scegli una password sicura per il tuo account.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Waves className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="font-display text-2xl font-bold text-foreground">
              SwimForge
            </span>
          </div>

          <Card className="bg-card border-border">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-display">Nuova password</CardTitle>
              <CardDescription>
                Inserisci e conferma la nuova password
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isReady ? (
                <div className="text-center text-sm text-muted-foreground">
                  Verifica del link in corso...
                </div>
              ) : hasSession ? (
                <form onSubmit={handleReset} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nuova password</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Minimo 8 caratteri"
                        className="bg-secondary border-0 pr-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full"
                        onClick={() => setShowPassword((prev) => !prev)}
                        disabled={isLoading}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Conferma password</Label>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Ripeti la password"
                        className="bg-secondary border-0 pr-10"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={isLoading}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        disabled={isLoading}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full gap-2" disabled={isLoading}>
                    {isLoading ? "Aggiornamento..." : "Aggiorna password"}
                    {!isLoading && <ArrowRight className="w-4 h-4" />}
                  </Button>
                </form>
              ) : (
                <div className="space-y-3 text-center text-sm text-muted-foreground">
                  Il link non e valido o e scaduto.
                  <Link href="/forgot-password" className="inline-flex w-full">
                    <Button className="w-full">Richiedi nuovo link</Button>
                  </Link>
                </div>
              )}

              {hasSession && (
                <p className="text-center text-sm text-muted-foreground mt-6">
                  Torna al{" "}
                  <Link href="/login" className="text-primary hover:underline">
                    login
                  </Link>
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
