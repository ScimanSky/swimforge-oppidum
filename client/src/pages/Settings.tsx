"use client"

import AppLayout from "@/components/AppLayout"
import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  User,
  Bell,
  Link,
  Shield,
  Palette,
  Globe,
  Camera,
  Check,
  ExternalLink,
  Trash2,
  LogOut,
  Smartphone,
} from "lucide-react"

const connectedAccounts = [
  {
    name: "Garmin Connect",
    icon: "/images/garmin-logo.png",
    connected: true,
    lastSync: "5 min fa",
    activities: 234,
  },
  {
    name: "Strava",
    icon: "/images/strava-logo.png",
    connected: true,
    lastSync: "1 ora fa",
    activities: 189,
  },
  {
    name: "Apple Health",
    icon: "/images/apple-health-logo.png",
    connected: false,
    lastSync: null,
    activities: 0,
  },
]

const notificationSettings = [
  {
    id: "activity_sync",
    title: "Sincronizzazione Attivita",
    description: "Notifica quando nuove attivita vengono sincronizzate",
    enabled: true,
  },
  {
    id: "weekly_summary",
    title: "Riepilogo Settimanale",
    description: "Ricevi un report delle tue performance ogni lunedi",
    enabled: true,
  },
  {
    id: "ai_insights",
    title: "Insights AI",
    description: "Notifiche quando l'AI ha nuovi suggerimenti per te",
    enabled: true,
  },
  {
    id: "challenges",
    title: "Sfide e Competizioni",
    description: "Aggiornamenti sulle sfide a cui partecipi",
    enabled: true,
  },
  {
    id: "social",
    title: "Attivita Social",
    description: "Quando qualcuno ti segue o reagisce alle tue attivita",
    enabled: false,
  },
  {
    id: "friends_activity",
    title: "Attivita Amici",
    description: "Quando i tuoi amici completano un allenamento",
    enabled: false,
  },
  {
    id: "badges",
    title: "Badge e Achievement",
    description: "Quando sblocchi nuovi badge o livelli",
    enabled: true,
  },
  {
    id: "marketing",
    title: "Novita e Aggiornamenti",
    description: "News su nuove funzionalita di SwimForge",
    enabled: false,
  },
]

export default function Settings() {
  const [notifications, setNotifications] = useState(
    notificationSettings.reduce(
      (acc, setting) => ({ ...acc, [setting.id]: setting.enabled }),
      {} as Record<string, boolean>
    )
  )

  const toggleNotification = (id: string) => {
    setNotifications((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <AppLayout>
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Impostazioni</h1>
        <p className="text-muted-foreground">Gestisci il tuo account e le preferenze</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="bg-secondary flex-wrap h-auto gap-1">
          <TabsTrigger value="profile" className="gap-2">
            <User className="w-4 h-4" />
            Profilo
          </TabsTrigger>
          <TabsTrigger value="connections" className="gap-2">
            <Link className="w-4 h-4" />
            Connessioni
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="w-4 h-4" />
            Notifiche
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2">
            <Palette className="w-4 h-4" />
            Preferenze
          </TabsTrigger>
          <TabsTrigger value="privacy" className="gap-2">
            <Shield className="w-4 h-4" />
            Privacy
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="mt-6 space-y-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-display">Informazioni Profilo</CardTitle>
              <CardDescription>Aggiorna le informazioni del tuo profilo pubblico</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar */}
              <div className="flex items-center gap-6">
                <div className="relative">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src="/images/athlete-1.jpg" alt="Profile" />
                    <AvatarFallback>MR</AvatarFallback>
                  </Avatar>
                  <Button
                    size="icon"
                    className="absolute bottom-0 right-0 h-8 w-8 rounded-full"
                  >
                    <Camera className="w-4 h-4" />
                  </Button>
                </div>
                <div>
                  <p className="font-medium text-foreground">Foto Profilo</p>
                  <p className="text-sm text-muted-foreground">JPG, PNG. Max 5MB.</p>
                </div>
              </div>

              {/* Form Fields */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input defaultValue="Marco" className="bg-secondary border-0" />
                </div>
                <div className="space-y-2">
                  <Label>Cognome</Label>
                  <Input defaultValue="Rossi" className="bg-secondary border-0" />
                </div>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input defaultValue="@marcorossi" className="bg-secondary border-0" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" defaultValue="marco@example.com" className="bg-secondary border-0" />
                </div>
                <div className="space-y-2">
                  <Label>Citta</Label>
                  <Input defaultValue="Milano" className="bg-secondary border-0" />
                </div>
                <div className="space-y-2">
                  <Label>Data di Nascita</Label>
                  <Input type="date" defaultValue="1990-05-15" className="bg-secondary border-0" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Bio</Label>
                <textarea
                  className="w-full h-24 p-3 rounded-lg bg-secondary border-0 text-foreground resize-none focus:ring-2 focus:ring-ring"
                  defaultValue="Nuotatore appassionato. Master M30. Obiettivo: migliorare ogni giorno."
                />
              </div>

              <Button>Salva Modifiche</Button>
            </CardContent>
          </Card>

          {/* Swimming Profile */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-display">Profilo Nuotatore</CardTitle>
              <CardDescription>Informazioni specifiche per il nuoto</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Livello</Label>
                  <Select defaultValue="intermediate">
                    <SelectTrigger className="bg-secondary border-0">
                      <SelectValue />
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
                  <Select defaultValue="freestyle">
                    <SelectTrigger className="bg-secondary border-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="freestyle">Stile Libero</SelectItem>
                      <SelectItem value="backstroke">Dorso</SelectItem>
                      <SelectItem value="breaststroke">Rana</SelectItem>
                      <SelectItem value="butterfly">Farfalla</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Lunghezza Piscina Preferita</Label>
                  <Select defaultValue="25">
                    <SelectTrigger className="bg-secondary border-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25m (Corta)</SelectItem>
                      <SelectItem value="50">50m (Olimpica)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Categoria Master</Label>
                  <Select defaultValue="m30">
                    <SelectTrigger className="bg-secondary border-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="m25">M25</SelectItem>
                      <SelectItem value="m30">M30</SelectItem>
                      <SelectItem value="m35">M35</SelectItem>
                      <SelectItem value="m40">M40</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button>Salva Profilo Nuotatore</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Connections Tab */}
        <TabsContent value="connections" className="mt-6 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-display">Account Collegati</CardTitle>
              <CardDescription>
                Collega i tuoi dispositivi e app per sincronizzare automaticamente le attivita
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {connectedAccounts.map((account) => (
                <div
                  key={account.name}
                  className="flex items-center justify-between p-4 rounded-lg bg-secondary/30"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-background flex items-center justify-center">
                      <Globe className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{account.name}</p>
                      {account.connected ? (
                        <p className="text-sm text-muted-foreground">
                          Sincronizzato {account.lastSync} - {account.activities} attivita
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Non connesso</p>
                      )}
                    </div>
                  </div>
                  {account.connected ? (
                    <div className="flex items-center gap-2">
                      <Badge className="bg-accent/10 text-accent border-0">
                        <Check className="w-3 h-3 mr-1" />
                        Connesso
                      </Badge>
                      <Button variant="outline" size="sm">
                        Disconnetti
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm">Connetti</Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-display">Dispositivi</CardTitle>
              <CardDescription>Gestisci i dispositivi collegati al tuo account</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Smartphone className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">iPhone 15 Pro</p>
                    <p className="text-sm text-muted-foreground">Ultimo accesso: Oggi, 10:30</p>
                  </div>
                </div>
                <Badge variant="secondary">Questo dispositivo</Badge>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-muted">
                    <Globe className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Chrome su MacBook</p>
                    <p className="text-sm text-muted-foreground">Ultimo accesso: Ieri, 18:45</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-destructive">
                  Rimuovi
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="mt-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-display">Preferenze Notifiche</CardTitle>
              <CardDescription>Scegli quali notifiche ricevere</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {notificationSettings.map((setting) => (
                <div
                  key={setting.id}
                  className="flex items-center justify-between py-3 border-b border-border last:border-0"
                >
                  <div>
                    <p className="font-medium text-foreground">{setting.title}</p>
                    <p className="text-sm text-muted-foreground">{setting.description}</p>
                  </div>
                  <Switch
                    checked={notifications[setting.id]}
                    onCheckedChange={() => toggleNotification(setting.id)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="mt-6 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-display">Unita di Misura</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Sistema Metrico</p>
                  <p className="text-sm text-muted-foreground">Chilometri, metri, kg</p>
                </div>
                <Select defaultValue="metric">
                  <SelectTrigger className="w-32 bg-secondary border-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="metric">Metrico</SelectItem>
                    <SelectItem value="imperial">Imperiale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Formato Pace</p>
                  <p className="text-sm text-muted-foreground">Come visualizzare il ritmo</p>
                </div>
                <Select defaultValue="100m">
                  <SelectTrigger className="w-32 bg-secondary border-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="100m">min/100m</SelectItem>
                    <SelectItem value="100y">min/100yd</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-display">Lingua e Regione</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Lingua</p>
                </div>
                <Select defaultValue="it">
                  <SelectTrigger className="w-40 bg-secondary border-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="it">Italiano</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Espanol</SelectItem>
                    <SelectItem value="fr">Francais</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Fuso Orario</p>
                </div>
                <Select defaultValue="rome">
                  <SelectTrigger className="w-48 bg-secondary border-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rome">Europe/Rome (UTC+1)</SelectItem>
                    <SelectItem value="london">Europe/London (UTC)</SelectItem>
                    <SelectItem value="ny">America/New_York (UTC-5)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Privacy Tab */}
        <TabsContent value="privacy" className="mt-6 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-display">Privacy Profilo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-foreground">Profilo Pubblico</p>
                  <p className="text-sm text-muted-foreground">
                    Permetti ad altri utenti di vedere il tuo profilo
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-foreground">Attivita Pubbliche</p>
                  <p className="text-sm text-muted-foreground">
                    Mostra le tue attivita nel feed della community
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-foreground">Mostra nelle Classifiche</p>
                  <p className="text-sm text-muted-foreground">
                    Partecipa alle classifiche pubbliche
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border border-destructive/50">
            <CardHeader>
              <CardTitle className="font-display text-destructive">Zona Pericolosa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-destructive/5">
                <div>
                  <p className="font-medium text-foreground">Esporta Dati</p>
                  <p className="text-sm text-muted-foreground">
                    Scarica tutti i tuoi dati in formato JSON
                  </p>
                </div>
                <Button variant="outline" className="gap-2 bg-transparent">
                  <ExternalLink className="w-4 h-4" />
                  Esporta
                </Button>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-destructive/5">
                <div>
                  <p className="font-medium text-foreground">Logout da Tutti i Dispositivi</p>
                  <p className="text-sm text-muted-foreground">
                    Disconnetti tutte le sessioni attive
                  </p>
                </div>
                <Button variant="outline" className="gap-2 text-destructive bg-transparent">
                  <LogOut className="w-4 h-4" />
                  Logout
                </Button>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-destructive/10">
                <div>
                  <p className="font-medium text-destructive">Elimina Account</p>
                  <p className="text-sm text-muted-foreground">
                    Elimina permanentemente il tuo account e tutti i dati
                  </p>
                </div>
                <Button variant="destructive" className="gap-2">
                  <Trash2 className="w-4 h-4" />
                  Elimina
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </AppLayout>
  )
}