import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Waves, Mail, Lock, User } from "lucide-react";

export default function Auth() {
  const [, navigate] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  
  // Register form state
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      toast.success("Login effettuato con successo!");
      navigate("/dashboard");
      window.location.reload();
    },
    onError: (error) => {
      toast.error(error.message || "Errore durante il login");
    },
    onSettled: () => setIsLoading(false),
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      toast.success("Registrazione completata! Benvenuto in SwimForge!");
      navigate("/dashboard");
      window.location.reload();
    },
    onError: (error) => {
      toast.error(error.message || "Errore durante la registrazione");
    },
    onSettled: () => setIsLoading(false),
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      toast.error("Inserisci email e password");
      return;
    }
    setIsLoading(true);
    loginMutation.mutate({ email: loginEmail, password: loginPassword });
  };

  const handleRegister = (e: React.FormEvent) => {
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
    registerMutation.mutate({ 
      email: registerEmail, 
      password: registerPassword,
      name: registerName || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md bg-slate-900/80 border-blue-500/30 backdrop-blur-xl relative z-10">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-full flex items-center justify-center">
            <Waves className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold text-white">SwimForge Oppidum</CardTitle>
          <CardDescription className="text-slate-400">
            Accedi o registrati per iniziare a tracciare i tuoi progressi
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-slate-800/50">
              <TabsTrigger value="login" className="data-[state=active]:bg-blue-600">
                Accedi
              </TabsTrigger>
              <TabsTrigger value="register" className="data-[state=active]:bg-blue-600">
                Registrati
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-slate-300">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="la.tua@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-slate-300">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600"
                  disabled={isLoading}
                >
                  {isLoading ? "Accesso in corso..." : "Accedi"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register" className="mt-6">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="register-name" className="text-slate-300">Nome (opzionale)</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      id="register-name"
                      type="text"
                      placeholder="Il tuo nome"
                      value={registerName}
                      onChange={(e) => setRegisterName(e.target.value)}
                      className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="register-email" className="text-slate-300">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="la.tua@email.com"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="register-password" className="text-slate-300">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      id="register-password"
                      type="password"
                      placeholder="Minimo 6 caratteri"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-slate-300">Conferma Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="Ripeti la password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600"
                  disabled={isLoading}
                >
                  {isLoading ? "Registrazione in corso..." : "Registrati"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>

        <CardFooter className="text-center text-sm text-slate-500">
          <p className="w-full">
            Traccia i tuoi progressi nel nuoto con SwimForge
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
