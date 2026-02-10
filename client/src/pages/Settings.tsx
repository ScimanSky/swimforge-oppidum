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
import { useLocation } from "wouter"

const notificationSettings = [
  {
    id: "in_app_notifications",
    title: "Notifiche in App",
    description: "Mostra la campanella e gli avvisi direttamente dentro SwimForge",
    enabled: true,
  },
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

const strokeOptions = [
  { value: "auto", label: "Auto (da attivita)" },
  { value: "freestyle", label: "Stile libero" },
  { value: "backstroke", label: "Dorso" },
  { value: "breaststroke", label: "Rana" },
  { value: "butterfly", label: "Farfalla" },
  { value: "mixed", label: "Misto" },
]

export default function Settings() {
  const [location, setLocation] = useLocation()

  const urlParams = useMemo(() => {
    const query = location.split("?")[1] ?? ""
    return new URLSearchParams(query)
  }, [location])

  const onboarding = urlParams.get("onboarding") === "1"

  const tabFromUrl = useMemo(() => {
    const tab = urlParams.get("tab")
    const allowed = new Set(["profile", "connections", "notifications", "preferences", "privacy"])
    return tab && allowed.has(tab) ? tab : "profile"
  }, [urlParams])

  const [activeTab, setActiveTab] = useState(tabFromUrl)

  useEffect(() => {
    setActiveTab(tabFromUrl)
  }, [tabFromUrl])

  const updateTabInUrl = (nextTab: string) => {
    const basePath = location.split("?")[0] || "/settings"
    const nextParams = new URLSearchParams(urlParams)
    nextParams.set("tab", nextTab)
    setActiveTab(nextTab)
    setLocation(`${basePath}?${nextParams.toString()}`)
  }

  const utils = trpc.useUtils()
  const { data: me } = trpc.auth.me.useQuery()
  const { data: profile } = trpc.profile.get.useQuery()
  const { data: activities } = trpc.activities.list.useQuery({ limit: 100, offset: 0, source: "all" })
  const { data: garminStatus } = trpc.garmin.status.useQuery(undefined, { staleTime: 5 * 60 * 1000 })
  const { data: stravaStatus } = trpc.strava.status.useQuery(undefined, { staleTime: 5 * 60 * 1000 })

  type GarminSyncResult = { synced?: number; error?: string }

  const garminSyncMutation = trpc.garmin.sync.useMutation({
    onSuccess: (data: GarminSyncResult) => {
      if (data?.error) {
        toast.error(data.error)
        return
      }
      toast.success(`${data?.synced ?? 0} attività sincronizzate!`)
      utils.activities.list.invalidate()
      utils.profile.get.invalidate()
    },
    onError: (error) => {
      toast.error("Errore nella sincronizzazione: " + error.message)
    },
  })

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
  const [displayNamePreference, setDisplayNamePreference] = useState<"full" | "nickname">("full")
  const [profileDraft, setProfileDraft] = useState({
    name: me?.name || "",
    email: me?.email || "",
    lastName: profile?.lastName || "",
    username: profile?.username || (me?.email ? me.email.split("@")[0] : ""),
    birthDate: profile?.birthDate || "",
    avatarUrl: profile?.avatarUrl || "",
    coverUrl: profile?.coverUrl || "",
    bio: profile?.bio || "",
    location: profile?.location || "",
    preferredStroke: profile?.preferredStroke || "auto",
    preferredPoolLengthMeters: profile?.preferredPoolLengthMeters
      ? String(profile.preferredPoolLengthMeters)
      : "",
    masterCategory: profile?.masterCategory || "",
  })

  useEffect(() => {
    setProfileDraft({
      name: me?.name || "",
      email: me?.email || "",
      lastName: profile?.lastName || "",
      username: profile?.username || (me?.email ? me.email.split("@")[0] : ""),
      birthDate: profile?.birthDate || "",
      avatarUrl: profile?.avatarUrl || "",
      coverUrl: profile?.coverUrl || "",
      bio: profile?.bio || "",
      location: profile?.location || "",
      preferredStroke: profile?.preferredStroke || "auto",
      preferredPoolLengthMeters: profile?.preferredPoolLengthMeters
        ? String(profile.preferredPoolLengthMeters)
        : "",
      masterCategory: profile?.masterCategory || "",
    })
  }, [
    me?.name,
    me?.email,
    profile?.avatarUrl,
    profile?.coverUrl,
    profile?.bio,
    profile?.location,
    profile?.lastName,
    profile?.username,
    profile?.birthDate,
    profile?.preferredStroke,
    profile?.preferredPoolLengthMeters,
    profile?.masterCategory,
  ])

  useEffect(() => {
    const stored = localStorage.getItem("swimforge:dashboardDisplayName")
    if (stored === "nickname") setDisplayNamePreference("nickname")
  }, [])

  const utils = trpc.useContext()
  const updateProfileMutation = trpc.profile.update.useMutation({
    onSuccess: () => {
      void utils.profile.get.invalidate()
      void utils.auth.me.invalidate()
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
    const normalizedUsername = profileDraft.username
      .trim()
      .replace(/^@+/, "")
    const normalizedEmail = profileDraft.email.trim()
    await updateProfileMutation.mutateAsync({
      name: profileDraft.name.trim() || undefined,
      email: normalizedEmail || undefined,
      bio: profileDraft.bio || undefined,
      location: profileDraft.location || undefined,
      lastName: profileDraft.lastName.trim() || undefined,
      username: normalizedUsername || undefined,
      birthDate: profileDraft.birthDate || null,
    })
    toast.success("Profilo aggiornato.")
  }

  const handleSaveSwimmerProfile = async () => {
    const poolLengthValue = Number(profileDraft.preferredPoolLengthMeters)
    const preferredPoolLengthMeters = Number.isFinite(poolLengthValue) && poolLengthValue > 0
      ? Math.round(poolLengthValue)
      : null

    await updateProfileMutation.mutateAsync({
      preferredStroke:
        profileDraft.preferredStroke === "auto"
          ? null
          : (profileDraft.preferredStroke as
              | "freestyle"
              | "backstroke"
              | "breaststroke"
              | "butterfly"
              | "mixed"),
      preferredPoolLengthMeters,
      masterCategory: profileDraft.masterCategory.trim() || undefined,
    })
    toast.success("Profilo nuotatore aggiornato.")
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
        <h1 className="text-2xl font-display font-bold neon-gradient-text">Impostazioni</h1>
        <p className="text-muted-foreground">Gestisci il tuo account e le preferenze</p>
      </div>

      {onboarding && (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="font-medium text-foreground">Benvenuto su SwimForge</p>
              {activeTab === "profile" ? (
                <p className="text-sm text-muted-foreground">
                  Step 1: completa il profilo (foto, cover e dati). Poi passa a Connessioni per collegare Garmin.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Step 2: collega Garmin Connect e avvia la prima sincronizzazione.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {activeTab !== "connections" ? (
                <Button variant="neon" onClick={() => updateTabInUrl("connections")}>
                  Vai a Connessioni
                </Button>
              ) : (
                <Button
                  variant="neon"
                  onClick={() => garminSyncMutation.mutate({ daysBack: 30 })}
                  disabled={!garminStatus?.connected || garminSyncMutation.isPending}
                >
                  {garminSyncMutation.isPending ? "Sincronizzazione..." : "Sincronizza Garmin"}
                </Button>
              )}
              <Button variant="outline-neon" onClick={() => (window.location.href = "/dashboard")}>
                Vai alla Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={updateTabInUrl}>
        <div className="grid gap-6 xl:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
          <div className="xl:sticky xl:top-24 h-fit">
            <Card className="bg-card border-border glass-panel">
              <CardHeader>
                <CardTitle className="font-display text-base">Sezioni</CardTitle>
                <CardDescription>Scegli l&apos;area da aggiornare</CardDescription>
              </CardHeader>
              <CardContent>
                <TabsList className="flex h-auto w-full flex-col items-stretch gap-2">
                  <TabsTrigger value="profile" className="h-auto w-full flex-none justify-start gap-2">
                    <User className="w-4 h-4" />
                    Profilo
                  </TabsTrigger>
                  <TabsTrigger value="connections" className="h-auto w-full flex-none justify-start gap-2">
                    <Link className="w-4 h-4" />
                    Connessioni
                  </TabsTrigger>
                  <TabsTrigger value="notifications" className="h-auto w-full flex-none justify-start gap-2">
                    <Bell className="w-4 h-4" />
                    Notifiche
                  </TabsTrigger>
                  <TabsTrigger value="preferences" className="h-auto w-full flex-none justify-start gap-2">
                    <Palette className="w-4 h-4" />
                    Preferenze
                  </TabsTrigger>
                  <TabsTrigger value="privacy" className="h-auto w-full flex-none justify-start gap-2">
                    <Shield className="w-4 h-4" />
                    Privacy
                  </TabsTrigger>
                </TabsList>
              </CardContent>
            </Card>
          </div>

          <div className="min-w-0">
            {/* Profile Tab */}
            <TabsContent value="profile" className="space-y-6">
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
                    variant="outline-neon"
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
                <div className="relative h-36 rounded-xl overflow-hidden bg-background/60">
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
                  <Avatar className="h-24 w-24 border border-border">
                    <AvatarImage src={profileDraft.avatarUrl || "/images/ai_coach_avatar.webp"} alt={displayName} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <Button
                    size="icon"
                    variant="neon"
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
                  <Input
                    value={profileDraft.name}
                    onChange={(event) =>
                      setProfileDraft((prev) => ({ ...prev, name: event.target.value }))
                    }
                    className="bg-background/60"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cognome</Label>
                  <Input
                    value={profileDraft.lastName}
                    onChange={(event) =>
                      setProfileDraft((prev) => ({ ...prev, lastName: event.target.value }))
                    }
                    className="bg-background/60"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input
                    value={profileDraft.username}
                    onChange={(event) =>
                      setProfileDraft((prev) => ({ ...prev, username: event.target.value }))
                    }
                    className="bg-background/60"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nome in dashboard</Label>
                  <Select
                    value={displayNamePreference}
                    onValueChange={(value) => {
                      const next = value === "nickname" ? "nickname" : "full"
                      setDisplayNamePreference(next)
                      localStorage.setItem("swimforge:dashboardDisplayName", next)
                      toast.success("Preferenza aggiornata.")
                    }}
                  >
                    <SelectTrigger className="bg-background/60">
                      <SelectValue placeholder="Seleziona preferenza" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Nome e Cognome</SelectItem>
                      <SelectItem value="nickname">Nickname</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={profileDraft.email}
                    onChange={(event) =>
                      setProfileDraft((prev) => ({ ...prev, email: event.target.value }))
                    }
                    className="bg-background/60"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Citta</Label>
                  <Input
                    value={profileDraft.location}
                    onChange={(event) =>
                      setProfileDraft((prev) => ({ ...prev, location: event.target.value }))
                    }
                    className="bg-background/60"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data di Nascita</Label>
                  <Input
                    type="date"
                    value={profileDraft.birthDate}
                    onChange={(event) =>
                      setProfileDraft((prev) => ({ ...prev, birthDate: event.target.value }))
                    }
                    className="bg-background/60"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Bio</Label>
                <textarea
                  className="h-24 w-full resize-none rounded-lg bg-background/60 p-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={profileDraft.bio}
                  onChange={(event) =>
                    setProfileDraft((prev) => ({ ...prev, bio: event.target.value }))
                  }
                />
              </div>

              <Button variant="neon" onClick={handleSaveProfile} disabled={updateProfileMutation.isPending}>
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
                    className="bg-background/60"
                    disabled
                  />
                </div>
                <div className="space-y-2">
                  <Label>Stile Preferito</Label>
                  <Select
                    value={profileDraft.preferredStroke || "auto"}
                    onValueChange={(value) =>
                      setProfileDraft((prev) => ({ ...prev, preferredStroke: value }))
                    }
                  >
                    <SelectTrigger className="bg-background/60">
                      <SelectValue placeholder="Seleziona stile" />
                    </SelectTrigger>
                    <SelectContent>
                      {strokeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Suggerito: {favoriteStroke}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Lunghezza Piscina Preferita</Label>
                  <Input
                    type="number"
                    min={1}
                    value={profileDraft.preferredPoolLengthMeters}
                    onChange={(event) =>
                      setProfileDraft((prev) => ({
                        ...prev,
                        preferredPoolLengthMeters: event.target.value,
                      }))
                    }
                    placeholder={preferredPool}
                    className="bg-background/60"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Categoria Master</Label>
                  <Input
                    value={profileDraft.masterCategory}
                    onChange={(event) =>
                      setProfileDraft((prev) => ({ ...prev, masterCategory: event.target.value }))
                    }
                    className="bg-background/60"
                  />
                </div>
              </div>
              <Button variant="neon" onClick={handleSaveSwimmerProfile} disabled={updateProfileMutation.isPending}>
                {updateProfileMutation.isPending ? "Salvataggio..." : "Salva Profilo Nuotatore"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Connections Tab */}
        <TabsContent value="connections" className="space-y-4">
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
                  className="flex items-center justify-between rounded-lg border border-border bg-background/60 p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary/40">
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
                      <Button variant="outline-neon" size="sm" asChild>
                        <a href="/profile">Gestisci</a>
                      </Button>
                    </div>
                  ) : (
                    <Button variant="neon" size="sm" disabled={account.disabled} asChild={!account.disabled}>
                      {account.disabled ? "In arrivo" : <a href="/profile">Connetti</a>}
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <GarminSection garminConnected={garminStatus?.connected ?? false} />
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
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
        <TabsContent value="preferences" className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-display">Unita di Misura</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                  <SelectTrigger className="w-32 bg-background/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="metric">Metrico</SelectItem>
                    <SelectItem value="imperial">Imperiale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                  <SelectTrigger className="w-32 bg-background/60">
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
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                  <SelectTrigger className="w-40 bg-background/60">
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
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                  <SelectTrigger className="w-48 bg-background/60">
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
        <TabsContent value="privacy" className="space-y-4">
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
                <Button variant="outline-neon" className="gap-2 bg-transparent" disabled>
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
                <Button variant="outline-neon" className="gap-2 text-destructive bg-transparent" disabled>
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
          </div>
        </div>
      </Tabs>
    </div>
    </AppLayout>
  )
}
