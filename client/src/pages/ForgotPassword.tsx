"use client";

import { useState } from "react";
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
import { Waves, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import ThemeToggleButton from "@/components/ThemeToggleButton";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Inserisci un'email valida");
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      toast.error(error.message || "Errore durante l'invio dell'email");
      setIsLoading(false);
      return;
    }

    setIsSent(true);
    setIsLoading(false);
    toast.success("Email inviata! Controlla la tua casella di posta.");
  };

  return (
    <div className="min-h-screen bg-background flex relative dark:bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_rgba(15,23,42,0.92)_45%,_rgba(2,6,23,1)_100%)]">
      <ThemeToggleButton className="absolute right-4 top-4 z-20" />
      <div className="hidden lg:flex lg:w-1/2 relative">
        <Image src="/images/theme-v3/auth-bg.png" alt="Swimmer" fill className="object-cover" />
        <Image src="/images/theme-v3/overlay-caustics.png" alt="" fill className="object-cover opacity-[0.28] mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/58 to-transparent" />
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
            Recupero password
          </h2>
          <p className="text-muted-foreground">
            Ti invieremo un link per impostare una nuova password.
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

          <Surface className="bg-card border-border">
            <SurfaceHeader className="text-center">
              <SurfaceTitle className="text-2xl font-display">Password dimenticata</SurfaceTitle>
              <SurfaceDescription>
                Inserisci l&apos;email per ricevere il link di recupero
              </SurfaceDescription>
            </SurfaceHeader>
            <SurfaceContent className="space-y-4">
              {isSent ? (
                <div className="space-y-3 text-center text-sm text-muted-foreground">
                  Abbiamo inviato il link di recupero a
                  <span className="text-foreground font-medium"> {email}</span>.
                  <div className="text-xs text-muted-foreground">
                    Se non lo vedi, controlla anche la cartella spam.
                  </div>
                  <Link href="/login" className="inline-flex w-full">
                    <Button variant="outline-neon" className="w-full">
                      Torna al login
                    </Button>
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      placeholder="nome@esempio.com"
                      className="bg-background/60"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>

                  <Button variant="neon" type="submit" className="w-full gap-2" disabled={isLoading}>
                    {isLoading ? "Invio..." : "Invia link"}
                    {!isLoading && <ArrowRight className="w-4 h-4" />}
                  </Button>
                </form>
              )}

              {!isSent && (
                <p className="text-center text-sm text-muted-foreground mt-6">
                  Ricordi la password?{" "}
                  <Link href="/login" className="text-primary hover:underline">
                    Accedi
                  </Link>
                </p>
              )}
            </SurfaceContent>
          </Surface>
        </div>
      </div>
    </div>
  );
}
