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
import { Waves, Eye, EyeOff, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Login() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) return;
    window.location.href = "/home";
  }, [authLoading, isAuthenticated]);

  if (authLoading || isAuthenticated) {
    return <div className="min-h-screen bg-background" />;
  }

  const syncSupabaseUserMutation = trpc.auth.syncSupabaseUser.useMutation({
    onSuccess: (data) => {
      toast.success("Login effettuato con successo!");
      setTimeout(() => {
        window.location.href = data?.isNewUser ? "/settings?tab=profile&onboarding=1" : "/home";
      }, 100);
    },
    onError: (error) => {
      toast.error(error.message || "Errore durante il login");
    },
    onSettled: () => setIsLoading(false),
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      toast.error("Inserisci email e password");
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });

    if (error || !data.session) {
      toast.error(error?.message || "Errore durante il login");
      setIsLoading(false);
      return;
    }

    const user = data.user;
    syncSupabaseUserMutation.mutate({
      accessToken: data.session.access_token,
      user: {
        id: user?.id ?? "",
        email: user?.email ?? loginEmail,
        name:
          user?.user_metadata?.full_name ||
          user?.user_metadata?.name ||
          null,
      },
    });
  };

  const handleGoogleLogin = async () => {
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
        <Image src="/images/theme-v3/auth-bg.png" alt="Swimmer" fill className="object-cover" />
        <Image src="/images/theme-v3/overlay-caustics.png" alt="" fill className="object-cover opacity-20 mix-blend-screen" />
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
            Bentornato in acqua
          </h2>
          <p className="text-muted-foreground">
            Accedi per continuare a tracciare i tuoi progressi, sfidare gli amici e
            raggiungere i tuoi obiettivi.
          </p>
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
              <SurfaceTitle className="text-2xl font-display">Accedi</SurfaceTitle>
              <SurfaceDescription>Inserisci le tue credenziali per accedere</SurfaceDescription>
            </SurfaceHeader>
            <SurfaceContent className="space-y-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="nome@esempio.com"
                    className="min-h-[44px] rounded-xl border-0 bg-secondary"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    disabled={isLoading || isGoogleLoading}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Password</Label>
                    <Link
                      href="/forgot-password"
                      className="inline-flex min-h-[44px] items-center text-sm text-primary hover:underline"
                    >
                      Password dimenticata?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="La tua password"
                      className="min-h-[44px] rounded-xl border-0 bg-secondary pr-10"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      disabled={isLoading || isGoogleLoading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <Button
                  variant="neon"
                  type="submit"
                  className="min-h-[48px] w-full gap-2 rounded-xl"
                  disabled={isLoading || isGoogleLoading}
                >
                  {isLoading ? "Accesso..." : "Accedi"}
                  {!isLoading && <ArrowRight className="w-4 h-4" />}
                </Button>
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-2 text-muted-foreground">
                    oppure continua con
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <Button
                  type="button"
                  variant="outline-neon"
                  className="min-h-[48px] gap-2 rounded-xl bg-transparent"
                  onClick={handleGoogleLogin}
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
                  {isGoogleLoading ? "..." : "Google"}
                </Button>
              </div>

              <p className="text-center text-sm text-muted-foreground mt-6">
                Non hai un account?{" "}
                <Link href="/register" className="text-primary hover:underline">
                  Registrati
                </Link>
              </p>
            </SurfaceContent>
          </Surface>
        </div>
      </div>
    </div>
  );
}
