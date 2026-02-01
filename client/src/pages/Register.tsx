"use client";

import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Waves, Eye, EyeOff, ArrowRight, Check } from "lucide-react";

const features = [
  "Sincronizza automaticamente da Garmin e Strava",
  "AI Coach personalizzato per migliorare",
  "Sfida amici e guadagna badge",
  "Analisi avanzate delle performance",
];

export default function Register() {
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState(1);

  return (
    <div className="min-h-screen bg-background flex">
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

          <Card className="bg-card border-border">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-display">Crea Account</CardTitle>
              <CardDescription>
                {step === 1
                  ? "Inserisci i tuoi dati per registrarti"
                  : "Configura il tuo profilo nuotatore"}
              </CardDescription>
              <div className="flex items-center justify-center gap-2 mt-4">
                <div className={`w-8 h-1 rounded ${step >= 1 ? "bg-primary" : "bg-muted"}`} />
                <div className={`w-8 h-1 rounded ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {step === 1 ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Nome</Label>
                      <Input placeholder="Marco" className="bg-secondary border-0" />
                    </div>
                    <div className="space-y-2">
                      <Label>Cognome</Label>
                      <Input placeholder="Rossi" className="bg-secondary border-0" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      placeholder="nome@esempio.com"
                      className="bg-secondary border-0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Minimo 8 caratteri"
                        className="bg-secondary border-0 pr-10"
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

                  <div className="flex items-start gap-2">
                    <Checkbox id="terms" className="mt-1" />
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

                  <Button className="w-full gap-2" onClick={() => setStep(2)}>
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
                      variant="outline"
                      className="flex-1 bg-transparent"
                      onClick={() => setStep(1)}
                    >
                      Indietro
                    </Button>
                    <Link href="/dashboard" className="flex-1">
                      <Button className="w-full gap-2">
                        Crea Account
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </>
              )}

              {step === 1 && (
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

                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="outline" className="gap-2 bg-transparent">
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
                    <Button variant="outline" className="gap-2 bg-transparent">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                      </svg>
                      GitHub
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
