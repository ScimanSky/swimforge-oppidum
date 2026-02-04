"use client"

import AppLayout from "@/components/AppLayout"
import { useEffect, useMemo, useRef, useState } from "react"
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
import { trpc } from "@/lib/trpc"
import { supabase } from "@/lib/supabase"
import { formatDistanceToNow } from "date-fns"
import { it } from "date-fns/locale"
import { toast } from "sonner"
import GarminSection from "@/components/GarminSection"

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

const defaultNotificationState = notificationSettings.reduce(
  (acc, setting) => ({ ...acc, [setting.id]: setting.enabled }),
  {} as Record<string, boolean>
)

const defaultPreferencesState = {
  units: "metric" as "metric" | "imperial",
  paceFormat: "100m" as "100m" | "100y",
  language: "it" as "it" | "en" | "es" | "fr",
  timezone: "Europe/Rome",
}

const defaultPrivacyState = {
  profilePublic: true,
  activitiesPublic: true,
  showLeaderboards: true,
}

export default function Settings() {
  const { data: me } = trpc.auth.me.useQuery()
  const { data: profile } = trpc.profile.get.useQuery()
  const { data: activities } = trpc.activities.list.useQuery({ limit: 100, offset: 0, source: "all" })
  const { data: garminStatus } = trpc.garmin.status.useQuery(undefined, { staleTime: 5 * 60 * 1000 })
  const { data: stravaStatus } = trpc.strava.status.useQuery(undefined, { staleTime: 5 * 60 * 1000 })

  const displayName = me?.name || me?.email || "Utente"
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const activitiesBySource = useMemo(() => {
    const counts = { garmin: 0, strava: 0, manual: 0 }
    if (!activities) return counts
    activities.forEach((activity) => {
      if (activity.activitySource === "garmin") counts.garmin += 1
      if (activity.activitySource === "strava") counts.strava += 1
      if (activity.activitySource === "manual") counts.manual += 1
    })
    return counts
  }, [activities])

  const favoriteStroke = useMemo(() => {
    if (!activities || activities.length === 0) return "Non disponibile"
    const counts: Record<string, number> = {}
    activities.forEach((activity) => {
      const stroke = activity.strokeType || "mixed"
      counts[stroke] = (counts[stroke] || 0) + 1
    })
    const [top] = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const strokeKey = top?.[0] || "mixed"
    const labels: Record<string, string> = {
      freestyle: "Stile Libero",
      backstroke: "Dorso",
      breaststroke: "Rana",
      butterfly: "Farfalla",
      mixed: "Misto",
    }
    return labels[strokeKey] || "Misto"
  }, [activities])

  const preferredPool = useMemo(() => {
    const length = activities?.[0]?.poolLengthMeters
    if (!length) return "Non disponibile"
    return `${length}m ${length === 50 ? "(Olimpica)" : "(Corta)"}`
  }, [activities])

  const formatLastSync = (value?: Date | string | null) => {
    if (!value) return "Mai sincronizzato"
    const date = typeof value === "string" ? new Date(value) : value
    if (Number.isNaN(date.getTime())) return "Mai sincronizzato"
    return formatDistanceToNow(date, { addSuffix: true, locale: it })
  }

  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const coverInputRef = useRef<HTMLInputElement | null>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [isUploadingCover, setIsUploadingCover] = useState(false)
  const [profileDraft, setProfileDraft] = useState({
    avatarUrl: profile?.avatarUrl || "",
    coverUrl: profile?.coverUrl || "",
    bio: profile?.bio || "",
    location: profile?.location || "",
  })

  useEffect(() => {
    setProfileDraft({
      avatarUrl: profile?.avatarUrl || "",
      coverUrl: profile?.coverUrl || "",
      bio: profile?.bio || "",
      location: profile?.location || "",
    })
  }, [profile?.avatarUrl, profile?.coverUrl, profile?.bio, profile?.location])

  const utils = trpc.useContext()
  const updateProfileMutation = trpc.profile.update.useMutation({
    onSuccess: () => {
      void utils.profile.get.invalidate()
    },
  })
  const uploadMediaMutation = trpc.profile.uploadMedia.useMutation()

  const readFileAsBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(",")[1]
        if (!base64) {
          reject(new Error("Invalid file encoding"))
          return
        }
        resolve(base64)
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

  const uploadToProfileBucket = async (file: File, kind: "avatar" | "cover") => {
    if (!me?.id) {
      toast.error("Devi essere autenticato per caricare immagini.")
      return null
    }
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      toast.error("Formato non supportato. Usa JPG, PNG o WEBP.")
      return null
    }
    if (file.size > 200 * 1024) {
      toast.error("File troppo grande. Massimo 200KB.")
      return null
    }

    try {
      const extension = file.name.split(".").pop() || "png"
      const base64 = await readFileAsBase64(file)
      const { url } = await uploadMediaMutation.mutateAsync({
        kind,
        fileBase64: base64,
        mimeType: file.type,
        extension,
      })
      return url
    } catch (error: any) {
      const message = error?.message || "Upload fallito."
      const shouldFallback =
        /row-level security/i.test(message) ||
        /rls/i.test(message) ||
        /policy/i.test(message)
      if (shouldFallback) {
        try {
          const sessionResult = await supabase.auth.getSession()
          if (!sessionResult.data.session) {
            toast.error(
              "Upload fallito: il server non ha accesso allo storage. Verifica SUPABASE_SERVICE_ROLE_KEY su Render."
            )
            return null
          }
          const extension = file.name.split(".").pop() || "png"
          const filePath = `profiles/${me.id}/${kind}-${Date.now()}.${extension}`
          const { error: uploadError } = await supabase.storage
            .from("profile-media")
            .upload(filePath, file, { contentType: file.type, upsert: true })
          if (uploadError) {
            throw uploadError
          }
          const { data } = supabase.storage
            .from("profile-media")
            .getPublicUrl(filePath)
          return data.publicUrl
        } catch (fallbackError: any) {
          toast.error(
            fallbackError?.message ||
              "Upload fallito: controlla le policy di Supabase Storage."
          )
          return null
        }
      }
      toast.error(
        message || "Upload fallito: controlla le policy di Supabase Storage."
      )
      return null
    }
  }

  const handleAvatarUpload = async (file?: File | null) => {
    if (!file) return
    setIsUploadingAvatar(true)
    const url = await uploadToProfileBucket(file, "avatar")
    if (url) {
      setProfileDraft((prev) => ({ ...prev, avatarUrl: url }))
      await updateProfileMutation.mutateAsync({ avatarUrl: url })
      toast.success("Avatar aggiornato.")
    }
    setIsUploadingAvatar(false)
  }

  const handleCoverUpload = async (file?: File | null) => {
    if (!file) return
    setIsUploadingCover(true)
    const url = await uploadToProfileBucket(file, "cover")
    if (url) {
      setProfileDraft((prev) => ({ ...prev, coverUrl: url }))
      await updateProfileMutation.mutateAsync({ coverUrl: url })
      toast.success("Cover aggiornata.")
    }
    setIsUploadingCover(false)
  }

  const handleSaveProfile = async () => {
    await updateProfileMutation.mutateAsync({
      bio: profileDraft.bio || undefined,
      location: profileDraft.location || undefined,
    })
    toast.success("Profilo aggiornato.")
  }

  const [notifications, setNotifications] = useState(defaultNotificationState)
  const [preferences, setPreferences] = useState(defaultPreferencesState)
  const [privacySettings, setPrivacySettings] = useState(defaultPrivacyState)

  useEffect(() => {
    if (!profile) return
    setNotifications({
      ...defaultNotificationState,
      ...(profile.notificationSettings as Record<string, boolean> | undefined),
    })
    setPreferences({
      ...defaultPreferencesState,
      ...(profile.preferences as typeof defaultPreferencesState | undefined),
    })
    setPrivacySettings({
      ...defaultPrivacyState,
      ...(profile.privacySettings as typeof defaultPrivacyState | undefined),
    })
  }, [profile?.notificationSettings, profile?.preferences, profile?.privacySettings])

  const persistSettings = async (payload: Record<string, unknown>) => {
    try {
      await updateProfileMutation.mutateAsync(payload)
    } catch (error: any) {
      toast.error(error?.message || "Impossibile salvare le impostazioni.")
    }
  }

  const toggleNotification = async (id: string) => {
    const next = { ...notifications, [id]: !notifications[id] }
    setNotifications(next)
    await persistSettings({ notificationSettings: next })
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
              {/* Cover Image */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">Cover profilo</p>
                    <p className="text-sm text-muted-foreground">
                      JPG/PNG/WEBP · max 200KB
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => coverInputRef.current?.click()}
                    disabled={isUploadingCover}
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    {isUploadingCover ? "Caricamento..." : "Cambia cover"}
                  </Button>
                </div>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => handleCoverUpload(event.target.files?.[0])}
                />
                <div className="relative h-36 rounded-xl overflow-hidden bg-secondary">
                  {profileDraft.coverUrl ? (
                    <img
                      src={profileDraft.coverUrl}
                      alt="Cover profilo"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Nessuna cover caricata
                    </div>
                  )}
                </div>
              </div>

              {/* Avatar */}
              <div className="flex items-center gap-6">
                <div className="relative">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={profileDraft.avatarUrl || "/images/ai_coach_avatar.webp"} alt={displayName} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <Button
                    size="icon"
                    className="absolute bottom-0 right-0 h-8 w-8 rounded-full"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                  >
                    <Camera className="w-4 h-4" />
                  </Button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => handleAvatarUpload(event.target.files?.[0])}
                  />
                </div>
                <div>
                  <p className="font-medium text-foreground">Foto Profilo</p>
                  <p className="text-sm text-muted-foreground">JPG/PNG/WEBP · max 200KB</p>
                </div>
              </div>

              {/* Form Fields */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={displayName} className="bg-secondary border-0" disabled />
                </div>
                <div className="space-y-2">
                  <Label>Cognome</Label>
                  <Input value="Non impostato" className="bg-secondary border-0" disabled />
                </div>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input value={me?.email ? `@${me.email.split("@")[0]}` : "Non impostato"} className="bg-secondary border-0" disabled />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={me?.email || ""} className="bg-secondary border-0" disabled />
                </div>
                <div className="space-y-2">
                  <Label>Citta</Label>
                  <Input
                    value={profileDraft.location}
                    onChange={(event) =>
                      setProfileDraft((prev) => ({ ...prev, location: event.target.value }))
                    }
                    className="bg-secondary border-0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data di Nascita</Label>
                  <Input type="date" value="" className="bg-secondary border-0" disabled />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Bio</Label>
                <textarea
                  className="w-full h-24 p-3 rounded-lg bg-secondary border-0 text-foreground resize-none focus:ring-2 focus:ring-ring"
                  value={profileDraft.bio}
                  onChange={(event) =>
                    setProfileDraft((prev) => ({ ...prev, bio: event.target.value }))
                  }
                />
              </div>

              <Button onClick={handleSaveProfile} disabled={updateProfileMutation.isPending}>
                {updateProfileMutation.isPending ? "Salvataggio..." : "Salva Modifiche"}
              </Button>
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
                  <Input
                    value={profile?.aiSkillLabel || profile?.levelTitle || "Non disponibile"}
                    className="bg-secondary border-0"
                    disabled
                  />
                </div>
                <div className="space-y-2">
                  <Label>Stile Preferito</Label>
                  <Input value={favoriteStroke} className="bg-secondary border-0" disabled />
                </div>
                <div className="space-y-2">
                  <Label>Lunghezza Piscina Preferita</Label>
                  <Input value={preferredPool} className="bg-secondary border-0" disabled />
                </div>
                <div className="space-y-2">
                  <Label>Categoria Master</Label>
                  <Input value="Non impostato" className="bg-secondary border-0" disabled />
                </div>
              </div>
              <Button disabled>Salva Profilo Nuotatore</Button>
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
              {[
                {
                  name: "Garmin Connect",
                  connected: garminStatus?.connected ?? false,
                  lastSync: garminStatus?.lastSync ?? null,
                  activities: activitiesBySource.garmin,
                },
                {
                  name: "Strava",
                  connected: stravaStatus?.connected ?? false,
                  lastSync: stravaStatus?.lastSync ?? null,
                  activities: activitiesBySource.strava,
                },
                {
                  name: "Apple Health",
                  connected: false,
                  lastSync: null,
                  activities: 0,
                  disabled: true,
                },
              ].map((account) => (
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
                          Ultimo sync {formatLastSync(account.lastSync)} · {account.activities} attivita
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {account.disabled ? "Disponibile prossimamente" : "Non connesso"}
                        </p>
                      )}
                    </div>
                  </div>
                  {account.connected ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 text-sm text-accent">
                        <Check className="w-4 h-4" />
                        Connesso
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <a href="/profile">Gestisci</a>
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" disabled={account.disabled} asChild={!account.disabled}>
                      {account.disabled ? "In arrivo" : <a href="/profile">Connetti</a>}
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <GarminSection garminConnected={garminStatus?.connected ?? false} />

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
                    <p className="font-medium text-foreground">Dispositivo corrente</p>
                    <p className="text-sm text-muted-foreground">Gestione dispositivi in arrivo</p>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">Attivo</div>
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
                <Select
                  value={preferences.units}
                  onValueChange={(value) => {
                    const next = { ...preferences, units: value as "metric" | "imperial" }
                    setPreferences(next)
                    void persistSettings({ preferences: next })
                  }}
                >
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
                <Select
                  value={preferences.paceFormat}
                  onValueChange={(value) => {
                    const next = { ...preferences, paceFormat: value as "100m" | "100y" }
                    setPreferences(next)
                    void persistSettings({ preferences: next })
                  }}
                >
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
                <Select
                  value={preferences.language}
                  onValueChange={(value) => {
                    const next = { ...preferences, language: value as "it" | "en" | "es" | "fr" }
                    setPreferences(next)
                    void persistSettings({ preferences: next })
                  }}
                >
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
                <Select
                  value={preferences.timezone}
                  onValueChange={(value) => {
                    const next = { ...preferences, timezone: value }
                    setPreferences(next)
                    void persistSettings({ preferences: next })
                  }}
                >
                  <SelectTrigger className="w-48 bg-secondary border-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Europe/Rome">Europe/Rome (UTC+1)</SelectItem>
                    <SelectItem value="Europe/London">Europe/London (UTC)</SelectItem>
                    <SelectItem value="America/New_York">America/New_York (UTC-5)</SelectItem>
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
                <Switch
                  checked={privacySettings.profilePublic}
                  onCheckedChange={(value) => {
                    const next = { ...privacySettings, profilePublic: value }
                    setPrivacySettings(next)
                    void persistSettings({ privacySettings: next })
                  }}
                />
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-foreground">Attivita Pubbliche</p>
                  <p className="text-sm text-muted-foreground">
                    Mostra le tue attivita nel feed della community
                  </p>
                </div>
                <Switch
                  checked={privacySettings.activitiesPublic}
                  onCheckedChange={(value) => {
                    const next = { ...privacySettings, activitiesPublic: value }
                    setPrivacySettings(next)
                    void persistSettings({ privacySettings: next })
                  }}
                />
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-foreground">Mostra nelle Classifiche</p>
                  <p className="text-sm text-muted-foreground">
                    Partecipa alle classifiche pubbliche
                  </p>
                </div>
                <Switch
                  checked={privacySettings.showLeaderboards}
                  onCheckedChange={(value) => {
                    const next = { ...privacySettings, showLeaderboards: value }
                    setPrivacySettings(next)
                    void persistSettings({ privacySettings: next })
                  }}
                />
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
                <Button variant="outline" className="gap-2 bg-transparent" disabled>
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
                <Button variant="outline" className="gap-2 text-destructive bg-transparent" disabled>
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
                <Button variant="destructive" className="gap-2" disabled>
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
