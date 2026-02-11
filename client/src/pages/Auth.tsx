import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Surface, SurfaceContent, SurfaceDescription, SurfaceFooter, SurfaceHeader, SurfaceTitle } from "@/components/ui/surface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Waves, Mail, Lock, User } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Auth() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  
  // Register form state
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
      toast.success("Login effettuato con successo!");
      setTimeout(() => {
        window.location.href = data?.isNewUser ? "/settings?tab=profile&onboarding=1" : "/dashboard";
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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerEmail || !registerPassword) {
      toast.error("Inserisci email e password");
      return;
    }
    if (registerPassword !== confirmPassword) {
      toast.error("Le password non coincidono");
      return;
    }
    if (registerPassword.length < 6) {
      toast.error("La password deve essere di almeno 6 caratteri");
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: registerEmail,
      password: registerPassword,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: registerName || undefined,
          name: registerName || undefined,
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
          email: data.user?.email ?? registerEmail,
          name: registerName || null,
        },
      });
      return;
    }

    setEmailSent(true);
    setIsLoading(false);
    toast.success("Controlla la tua email per confermare la registrazione.");
  };

  const handleGoogleLogin = async () => {
    try {
      setIsGoogleLoading(true);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        toast.error("Errore durante l'accesso con Google");
        console.error(error);
        setIsGoogleLoading(false);
      }
      // Il redirect avverrà automaticamente, quindi non serve setIsGoogleLoading(false)
    } catch (error) {
      toast.error("Errore durante l'accesso con Google");
      console.error(error);
      setIsGoogleLoading(false);
    }
  };

  return (
    <AppLayout className="flex items-center justify-center p-4" withShell={false}>
    <div className="w-full flex items-center justify-center relative">
      <ThemeToggleButton className="absolute right-2 top-2 z-20" />
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      <Surface className="relative z-10 w-full max-w-md bg-card/90 border-border/70 backdrop-blur-xl glass-panel">
        <SurfaceHeader className="text-center space-y-4">
          <div className="mx-auto">
            <img src="/swimforge-logo.png" alt="SwimForge" className="h-28 md:h-32 w-auto" />
          </div>
          <SurfaceTitle className="text-2xl font-bold neon-gradient-text">SwimForge</SurfaceTitle>
          <SurfaceDescription className="text-muted-foreground">
            Accedi o registrati per iniziare a tracciare i tuoi progressi
          </SurfaceDescription>
        </SurfaceHeader>

        <SurfaceContent>
          {/* Google Sign In Button */}
          <div className="space-y-4 mb-6">
            <Button
              type="button"
              variant="outline-neon"
              className="w-full"
              onClick={handleGoogleLogin}
              disabled={isGoogleLoading || isLoading}
            >
              {isGoogleLoading ? (
                "Reindirizzamento..."
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
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
                  Continua con Google
                </>
              )}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Oppure</span>
              </div>
            </div>
          </div>

            <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">
                Accedi
              </TabsTrigger>
              <TabsTrigger value="register">
                Registrati
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-muted-foreground">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="la.tua@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-10 bg-background/60"
                      disabled={isLoading || isGoogleLoading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-muted-foreground">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-10 bg-background/60"
                      disabled={isLoading || isGoogleLoading}
                    />
                  </div>
                </div>

                <Button 
                  type="submit" 
                  variant="neon"
                  className="w-full"
                  disabled={isLoading || isGoogleLoading}
                >
                  {isLoading ? "Accesso in corso..." : "Accedi"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register" className="mt-6">
              {emailSent ? (
                <div className="space-y-3 text-center text-sm text-muted-foreground">
                  Ti abbiamo inviato una mail di conferma a
                  <span className="text-foreground font-medium"> {registerEmail}</span>.
                  <div className="text-xs text-muted-foreground">
                    Clicca sul link ricevuto per attivare l&apos;account.
                  </div>
                </div>
              ) : (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-name" className="text-muted-foreground">Nome (opzionale)</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="register-name"
                        type="text"
                        placeholder="Il tuo nome"
                        value={registerName}
                        onChange={(e) => setRegisterName(e.target.value)}
                        className="pl-10 bg-background/60"
                        disabled={isLoading || isGoogleLoading}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                  <Label htmlFor="register-email" className="text-muted-foreground">Email</Label>
                  <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="la.tua@email.com"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        className="pl-10 bg-background/60"
                        disabled={isLoading || isGoogleLoading}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                  <Label htmlFor="register-password" className="text-muted-foreground">Password</Label>
                  <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="Minimo 8 caratteri"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        className="pl-10 bg-background/60"
                        disabled={isLoading || isGoogleLoading}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-muted-foreground">Conferma Password</Label>
                  <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="confirm-password"
                        type="password"
                        placeholder="Ripeti la password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10 bg-background/60"
                        disabled={isLoading || isGoogleLoading}
                      />
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    variant="neon"
                    className="w-full"
                    disabled={isLoading || isGoogleLoading}
                  >
                    {isLoading ? "Registrazione in corso..." : "Registrati"}
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </SurfaceContent>

        <SurfaceFooter className="text-center text-sm text-muted-foreground">
          <p className="w-full">
            Traccia i tuoi progressi nel nuoto con SwimForge
          </p>
        </SurfaceFooter>
      </Surface>
    </div>
    </AppLayout>
  );
}
