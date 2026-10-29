import { assetUrl } from "@/lib/asset-base";
import AppLayout from "@/components/AppLayout"
import { useEffect, useId, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Metric, type MetricProps } from "@/components/corsia/Metric"
import { LoadError, LoadingSkeleton } from "@/components/corsia/LoadState"
import { FieldError, fieldAria } from "@/components/auth/form-fields"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Camera,
  Check,
  Download,
  Trash2,
  LogOut,
  AlertTriangle,
} from "lucide-react"
import { trpc } from "@/lib/trpc"
import { supabase } from "@/lib/supabase"
import { registerPushToken, unregisterPushToken } from "@/lib/push"
import { clearNativeSessionToken } from "@/lib/session-token"
import { UNAUTHED_ERR_MSG } from "@shared/const"
import { ONBOARDING_FORCE_QUERY_PARAM } from "@/lib/onboarding"
import { useSettingsTab } from "@/hooks/useSettingsTab"
import { prefersReducedMotion } from "@/hooks/usePrefersReducedMotion"
import { homePathForPlatform } from "@/lib/navigation"
import { isNativePlatform } from "@/lib/platform"
import { formatInteger } from "@/lib/format"
import { errorToastMessage } from "@/lib/trpc-errors"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { it } from "date-fns/locale"
import { toast } from "sonner"
import GarminSection from "@/components/GarminSection"
import GarminSyncCountPicker from "@/components/GarminSyncCountPicker"
import { garminSyncButtonLabel, useGarminSyncCount } from "@/lib/garmin-sync-count"
import { Link as RouterLink, useLocation } from "wouter"

const notificationSettings = [
  {
    id: "in_app_notifications",
    title: "Notifiche nell'app",
    description: "Mostra la campanella e gli avvisi direttamente dentro SwimForge",
    enabled: true,
  },
  {
    id: "activity_sync",
    title: "Sincronizzazione attività",
    description: "Notifica quando nuove attività vengono sincronizzate",
    enabled: true,
  },
  {
    id: "weekly_summary",
    title: "Riepilogo settimanale",
    description: "Ricevi un riepilogo delle tue prestazioni ogni lunedì",
    enabled: true,
  },
  {
    id: "ai_insights",
    title: "Suggerimenti AI",
    description: "Notifiche quando l'AI ha nuovi suggerimenti per te",
    enabled: true,
  },
  {
    id: "challenges",
    title: "Sfide e competizioni",
    description: "Aggiornamenti sulle sfide a cui partecipi",
    enabled: true,
  },
  {
    id: "social",
    title: "Attività social",
    description: "Quando qualcuno ti segue o reagisce alle tue attività",
    enabled: false,
  },
  {
    id: "friends_activity",
    title: "Attività degli amici",
    description: "Quando i tuoi amici completano un allenamento",
    enabled: false,
  },
  {
    id: "badges",
    title: "Badge e traguardi",
    description: "Quando sblocchi nuovi badge o livelli",
    enabled: true,
  },
  {
    id: "marketing",
    title: "Novità e aggiornamenti",
    description: "Notizie sulle nuove funzioni di SwimForge",
    enabled: false,
  },
]

const RESET_APP_ALLOWED_EMAIL =
  String(import.meta.env.VITE_RESET_APP_ALLOWED_EMAIL ?? "admin@swimforge.it")
    .trim()
    .toLowerCase()

const defaultNotificationState = notificationSettings.reduce(
  (acc, setting) => ({ ...acc, [setting.id]: setting.enabled }),
  {} as Record<string, boolean>
)

const defaultPreferencesState = {
  units: "metric" as "metric" | "imperial",
  paceFormat: "100m" as "100m" | "100y",
  language: "it" as "it" | "en" | "es" | "fr",
  timezone: "Europe/Rome",
  autoplayVideos: true,
}

const defaultPrivacyState = {
  profilePublic: true,
  activitiesPublic: true,
  showLeaderboards: true,
  allowPrivateForwards: true,
  forwardsFollowersOnly: false,
}

const consentItems = [
  {
    type: "health_data_processing",
    title: "Trattamento dati salute",
    description: "Necessario per frequenza cardiaca, VO2max, stress, calorie e sync completo Garmin/Strava.",
  },
  {
    type: "garmin_sync",
    title: "Sincronizzazione Garmin",
    description: "Autorizza l'importazione e il trattamento dei dati da Garmin Connect.",
  },
  {
    type: "strava_sync",
    title: "Sincronizzazione Strava",
    description: "Autorizza l'importazione e il trattamento dei dati da Strava.",
  },
  {
    type: "marketing_communications",
    title: "Comunicazioni marketing",
    description: "Novità prodotto e comunicazioni promozionali.",
  },
  {
    type: "cookie_analytics",
    title: "Cookie analitici",
    description: "Consenso ai cookie analitici opzionali.",
  },
] as const

/** A query with no data and no error: still loading, or paused offline (isLoading is false then). */
const awaitingData = (query: { data?: unknown; isError: boolean }) => query.data === undefined && !query.isError

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const coerceBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true
    if (value.toLowerCase() === "false") return false
  }
  if (typeof value === "number") {
    if (value === 1) return true
    if (value === 0) return false
  }
  return undefined
}

const normalizeNotificationSettings = (
  input: unknown
): Record<string, boolean> => {
  const base = { ...defaultNotificationState }
  if (!isRecord(input)) return base
  for (const [key, raw] of Object.entries(input)) {
    const coerced = coerceBoolean(raw)
    if (coerced !== undefined) {
      base[key] = coerced
    }
  }
  return base
}

const strokeOptions = [
  { value: "auto", label: "Automatico (dalle attività)" },
  { value: "freestyle", label: "Stile libero" },
  { value: "backstroke", label: "Dorso" },
  { value: "breaststroke", label: "Rana" },
  { value: "butterfly", label: "Farfalla" },
  { value: "mixed", label: "Misto" },
]

export default function Settings() {
  const [, setLocation] = useLocation()
  const { activeTab, selectTab: updateTabInUrl, onboarding } = useSettingsTab()

  const garminHeadingRef = useRef<HTMLHeadingElement | null>(null)
  // «Collega/Gestisci Garmin Connect»: scroll to the Garmin card (at once with reduced motion)
  // and move the focus to its title, so keyboard and screen reader users land there too.
  const scrollToGarminControls = () => {
    if (activeTab !== "connections") {
      updateTabInUrl("connections")
    }
    if (typeof window === "undefined") return
    window.setTimeout(() => {
      const target = document.getElementById("garmin-connection-controls")
      target?.scrollIntoView?.({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" })
      garminHeadingRef.current?.focus({ preventScroll: true })
    }, 120)
  }

  const utils = trpc.useUtils()
  const meQuery = trpc.auth.me.useQuery()
  const me = meQuery.data
  const deleteAccountStatusQuery = trpc.auth.deleteAccountStatus.useQuery()
  const profileQuery = trpc.profile.get.useQuery()
  const profile = profileQuery.data
  const activitiesQuery = trpc.activities.list.useQuery({ limit: 100, offset: 0, source: "all" })
  const activities = activitiesQuery.data
  const garminStatusQuery = trpc.garmin.status.useQuery(undefined, { staleTime: 5 * 60 * 1000 })
  const garminStatus = garminStatusQuery.data
  const stravaStatusQuery = trpc.strava.status.useQuery(undefined, { staleTime: 5 * 60 * 1000 })
  const stravaStatus = stravaStatusQuery.data
  const consentsQuery = trpc.consent.list.useQuery(undefined, { staleTime: 30_000 })

  type GarminSyncResult = { synced?: number; error?: string; detectedPbs?: unknown[] }

  const [garminSyncCount, setGarminSyncCount] = useGarminSyncCount()
  const garminSyncMutation = trpc.garmin.sync.useMutation({
    onSuccess: (data: GarminSyncResult) => {
      if (data?.error) {
        toast.error(data.error)
        return
      }
      if ((data?.synced ?? 0) === 0) {
        toast.info("Nessuna nuova nuotata da sincronizzare")
      } else {
        toast.success(`${data?.synced} attività sincronizzate!`)
      }
      if (Array.isArray(data?.detectedPbs) && data.detectedPbs.length > 0) {
        toast.success(`Nuovi PB rilevati: ${data.detectedPbs.length}`)
      }
      utils.activities.list.invalidate()
      utils.profile.get.invalidate()
      // Swim metrics (Statistiche, Coach, the profile's streak) and personal records.
      void utils.statistics.invalidate()
      void utils.records.invalidate()
    },
    onError: (error) => {
      toast.error(errorToastMessage(error, "Sincronizzazione non riuscita."))
    },
  })

  const displayName = me?.name || me?.email || "Utente"
  const deleteRequiresPassword = deleteAccountStatusQuery.data?.requiresPassword ?? true
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
    if (!activities || activities.length === 0) return null
    const counts: Record<string, number> = {}
    activities.forEach((activity) => {
      const stroke = activity.strokeType || "mixed"
      counts[stroke] = (counts[stroke] || 0) + 1
    })
    const [top] = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const strokeKey = top?.[0] || "mixed"
    const labels: Record<string, string> = {
      freestyle: "Stile libero",
      backstroke: "Dorso",
      breaststroke: "Rana",
      butterfly: "Farfalla",
      mixed: "Misto",
    }
    return labels[strokeKey] || "Misto"
  }, [activities])
  // Summary at the top: only the figures that have data (Corsia: a metric without data is not shown).
  const summaryMetrics = useMemo(() => {
    const metrics: MetricProps[] = []
    if (profile) {
      metrics.push({ value: formatInteger(Number(profile.totalXp ?? 0)), label: "XP totale", tone: "xp" })
    }
    if (garminStatus && stravaStatus) {
      const connected = Number(Boolean(garminStatus.connected)) + Number(Boolean(stravaStatus.connected))
      metrics.push({ value: String(connected), unit: "di 2", label: "Integrazioni attive" })
    }
    if (activities) {
      const totalActivities = activitiesBySource.garmin + activitiesBySource.strava + activitiesBySource.manual
      metrics.push({ value: formatInteger(totalActivities), label: "Attività importate" })
    }
    if (favoriteStroke) metrics.push({ value: favoriteStroke, label: "Stile più nuotato" })
    return metrics
  }, [activities, activitiesBySource, favoriteStroke, garminStatus, profile, stravaStatus])
  const summaryLoading =
    awaitingData(profileQuery) ||
    awaitingData(activitiesQuery) ||
    awaitingData(garminStatusQuery) ||
    awaitingData(stravaStatusQuery)

  const preferredPool = useMemo(() => {
    const length = activities?.[0]?.poolLengthMeters
    if (!length) return "Non disponibile"
    return `${length}m ${length === 50 ? "(olimpica)" : "(corta)"}`
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

  const updateProfileMutation = trpc.profile.update.useMutation({
    onSuccess: () => {
      void utils.profile.get.invalidate()
      void utils.auth.me.invalidate()
    },
  })
  const uploadMediaMutation = trpc.profile.uploadMedia.useMutation()
  const logoutAllDevicesMutation = trpc.auth.logoutAllDevices.useMutation({
    onSuccess: async () => {
      try {
        await supabase.auth.signOut()
      } catch {
        // no-op
      }
      localStorage.removeItem("swimforge:autoSync:dashboardReady")
      localStorage.removeItem("swimforge:autoSync:last")
      clearNativeSessionToken()
      toast.success("Sei stato disconnesso da tutti i dispositivi.")
      window.location.href = "/login"
    },
    onError: (error) => {
      // Still signed in (not an expired session): restore the push registration removed
      // before the call. A wrong password is UNAUTHORIZED too, but keeps the session.
      if (error.message !== UNAUTHED_ERR_MSG) void registerPushToken()
      toast.error(errorToastMessage(error, "Impossibile disconnettere tutte le sessioni."))
    },
  })
  const deleteAccountMutation = trpc.auth.deleteAccount.useMutation({
    onSuccess: async (data) => {
      try {
        await supabase.auth.signOut()
      } catch {
        // no-op
      }
      localStorage.removeItem("swimforge:autoSync:dashboardReady")
      localStorage.removeItem("swimforge:autoSync:last")
      clearNativeSessionToken()
      if (data.emailSent) {
        toast.success("Account eliminato. Ti abbiamo inviato un'email di conferma.")
      } else {
        toast.warning("Account eliminato. Email di conferma non inviata.")
      }
      window.location.href = "/"
    },
    onError: (error) => {
      // Still signed in (not an expired session): restore the push registration removed
      // before the call. A wrong password is UNAUTHORIZED too, but keeps the session.
      if (error.message !== UNAUTHED_ERR_MSG) void registerPushToken()
      // A wrong password is UNAUTHORIZED with its own Italian message: shown under the field.
      if (error.data?.code === "UNAUTHORIZED" && error.message !== UNAUTHED_ERR_MSG) {
        setDeletePasswordError(error.message || "Password non corretta")
        return
      }
      toast.error(errorToastMessage(error, "Impossibile eliminare l'account."))
    },
  })
  const setConsentMutation = trpc.consent.set.useMutation({
    onError: (error) => toast.error(errorToastMessage(error, "Impossibile aggiornare il consenso.")),
  })
  const resetAppForLaunchMutation = trpc.auth.resetAppForLaunch.useMutation({
    onSuccess: async () => {
      try {
        await supabase.auth.signOut()
      } catch {
        // no-op
      }
      localStorage.clear()
      toast.success("Reset completato. App pronta al lancio.")
      window.location.href = "/"
    },
    onError: (error) => {
      toast.error(errorToastMessage(error, "Reset non riuscito."))
    },
  })
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  // True while the push token is removed before logout-all / delete (buttons disabled).
  const [isUnregistering, setIsUnregistering] = useState(false)
  const [deletePassword, setDeletePassword] = useState("")
  const [deletePasswordError, setDeletePasswordError] = useState<string | null>(null)
  const deletePasswordId = useId()
  useEffect(() => {
    if (deletePasswordError) document.getElementById(deletePasswordId)?.focus()
  }, [deletePasswordError, deletePasswordId])
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetConfirmationText, setResetConfirmationText] = useState("")
  const [consentState, setConsentState] = useState<Record<string, boolean>>({})
  const isDevResetAccount = (me?.email ?? "").toLowerCase() === RESET_APP_ALLOWED_EMAIL

  useEffect(() => {
    const next: Record<string, boolean> = {}
    for (const item of consentItems) {
      next[item.type] = Boolean((consentsQuery.data as any)?.byType?.[item.type]?.granted)
    }
    setConsentState(next)
  }, [consentsQuery.data])

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
	    const allowedTypes = ["image/jpeg", "image/png", "image/webp"] as const
      type AllowedMimeType = (typeof allowedTypes)[number]
      const isAllowedMimeType = (value: string): value is AllowedMimeType =>
        (allowedTypes as readonly string[]).includes(value)

	    if (!isAllowedMimeType(file.type)) {
	      toast.error("Formato non supportato. Usa JPG, PNG o WEBP.")
	      return null
	    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File troppo grande. Massimo 20MB.")
      return null
    }

	    try {
        const allowedExtensions = ["jpg", "jpeg", "png", "webp"] as const
        type AllowedExtension = (typeof allowedExtensions)[number]
        const rawExtension = file.name.split(".").pop()?.toLowerCase()
        const extension: AllowedExtension =
          rawExtension && (allowedExtensions as readonly string[]).includes(rawExtension)
            ? (rawExtension as AllowedExtension)
            : file.type === "image/jpeg"
              ? "jpg"
              : "png"
	      const base64 = await readFileAsBase64(file)
	      const { url } = await uploadMediaMutation.mutateAsync({
	        kind,
	        fileBase64: base64,
	        mimeType: file.type,
	        extension,
	      })
	      return url
	    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Upload fallito."
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
        } catch (fallbackError: unknown) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : undefined
          toast.error(
            fallbackMessage ||
              "Upload fallito: controlla le policy di Supabase Storage."
          )
          return null
        }
      }
      toast.error(errorToastMessage(error, "Caricamento non riuscito. Riprova."))
      return null
    }
  }

  const handleAvatarUpload = async (file?: File | null) => {
    if (!file) return
    setIsUploadingAvatar(true)
    try {
      const url = await uploadToProfileBucket(file, "avatar")
      if (url) {
        setProfileDraft((prev) => ({ ...prev, avatarUrl: url }))
        await updateProfileMutation.mutateAsync({ avatarUrl: url })
        toast.success("Avatar aggiornato.")
      }
    } catch (error: unknown) {
      toast.error(errorToastMessage(error, "Impossibile aggiornare la foto profilo."))
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleCoverUpload = async (file?: File | null) => {
    if (!file) return
    setIsUploadingCover(true)
    try {
      const url = await uploadToProfileBucket(file, "cover")
      if (url) {
        setProfileDraft((prev) => ({ ...prev, coverUrl: url }))
        await updateProfileMutation.mutateAsync({ coverUrl: url })
        toast.success("Cover aggiornata.")
      }
    } catch (error: unknown) {
      toast.error(errorToastMessage(error, "Impossibile aggiornare la cover."))
    } finally {
      setIsUploadingCover(false)
    }
  }

  const handleSaveProfile = async () => {
    const normalizedUsername = profileDraft.username
      .trim()
      .replace(/^@+/, "")
    const normalizedEmail = profileDraft.email.trim()
    try {
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
    } catch (error: unknown) {
      toast.error(errorToastMessage(error, "Impossibile salvare il profilo."))
    }
  }

  const handleSaveSwimmerProfile = async () => {
    const poolLengthValue = Number(profileDraft.preferredPoolLengthMeters)
    const preferredPoolLengthMeters = Number.isFinite(poolLengthValue) && poolLengthValue > 0
      ? Math.round(poolLengthValue)
      : null

    try {
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
    } catch (error: unknown) {
      toast.error(errorToastMessage(error, "Impossibile salvare il profilo nuotatore."))
    }
  }

  const [notifications, setNotifications] = useState(defaultNotificationState)
  const [preferences, setPreferences] = useState(defaultPreferencesState)
  const [privacySettings, setPrivacySettings] = useState(defaultPrivacyState)

  useEffect(() => {
    if (!profile) return
    setNotifications(normalizeNotificationSettings(profile.notificationSettings))
    if (isRecord(profile.preferences)) {
      const units =
        profile.preferences.units === "metric" || profile.preferences.units === "imperial"
          ? profile.preferences.units
          : undefined
      const paceFormat =
        profile.preferences.paceFormat === "100m" || profile.preferences.paceFormat === "100y"
          ? profile.preferences.paceFormat
          : undefined
      const language =
        profile.preferences.language === "it" ||
        profile.preferences.language === "en" ||
        profile.preferences.language === "es" ||
        profile.preferences.language === "fr"
          ? profile.preferences.language
          : undefined
      const timezone = typeof profile.preferences.timezone === "string" ? profile.preferences.timezone : undefined
      const autoplayVideos = coerceBoolean(profile.preferences.autoplayVideos)

      setPreferences({
        ...defaultPreferencesState,
        ...(units ? { units } : {}),
        ...(paceFormat ? { paceFormat } : {}),
        ...(language ? { language } : {}),
        ...(timezone ? { timezone } : {}),
        ...(autoplayVideos !== undefined ? { autoplayVideos } : {}),
      })
    } else {
      setPreferences(defaultPreferencesState)
    }

    if (isRecord(profile.privacySettings)) {
      const profilePublic = coerceBoolean(profile.privacySettings.profilePublic)
      const activitiesPublic = coerceBoolean(profile.privacySettings.activitiesPublic)
      const showLeaderboards = coerceBoolean(profile.privacySettings.showLeaderboards)
      const allowPrivateForwards = coerceBoolean(profile.privacySettings.allowPrivateForwards)
      const forwardsFollowersOnly = coerceBoolean(profile.privacySettings.forwardsFollowersOnly)

      setPrivacySettings({
        ...defaultPrivacyState,
        ...(profilePublic !== undefined ? { profilePublic } : {}),
        ...(activitiesPublic !== undefined ? { activitiesPublic } : {}),
        ...(showLeaderboards !== undefined ? { showLeaderboards } : {}),
        ...(allowPrivateForwards !== undefined ? { allowPrivateForwards } : {}),
        ...(forwardsFollowersOnly !== undefined ? { forwardsFollowersOnly } : {}),
      })
    } else {
      setPrivacySettings(defaultPrivacyState)
    }
  }, [profile?.notificationSettings, profile?.preferences, profile?.privacySettings])

  const persistSettings = async (payload: Record<string, unknown>) => {
    try {
      await updateProfileMutation.mutateAsync(payload)
    } catch (error: unknown) {
      toast.error(errorToastMessage(error, "Impossibile salvare le impostazioni."))
    }
  }

  const toggleNotification = async (id: string) => {
    // Defense in depth: ensure we're not persisting legacy string values.
    const next = { ...normalizeNotificationSettings(notifications), [id]: !notifications[id] }
    setNotifications(next)
    await persistSettings({ notificationSettings: next })
    if (id === "marketing") {
      const marketingEnabled = Boolean(next.marketing)
      setConsentState((prev) => ({ ...prev, marketing_communications: marketingEnabled }))
      try {
        await setConsentMutation.mutateAsync({
          consentType: "marketing_communications",
          granted: marketingEnabled,
        })
        await consentsQuery.refetch()
      } catch {
        // mutation already handled by onError
      }
    }
  }

  // The marketing consent also saves the notification settings: never from the defaults, only
  // once the profile's own settings are here (the switch is disabled until then).
  const consentNeedsProfile = (consentType: typeof consentItems[number]["type"]) =>
    consentType === "marketing_communications" && !profile

  const toggleConsent = async (consentType: typeof consentItems[number]["type"], granted: boolean) => {
    if (consentNeedsProfile(consentType)) return
    setConsentState((prev) => ({ ...prev, [consentType]: granted }))
    try {
      await setConsentMutation.mutateAsync({ consentType, granted })
      await consentsQuery.refetch()
      if (consentType === "marketing_communications") {
        const next = { ...normalizeNotificationSettings(notifications), marketing: granted }
        setNotifications(next)
        await persistSettings({ notificationSettings: next })
      }
    } catch {
      setConsentState((prev) => ({ ...prev, [consentType]: !granted }))
    }
  }

  const handleExportData = async () => {
    try {
      const payload = await utils.auth.exportMyData.fetch()
      const now = new Date()
      const fileName = `swimforge-data-export-${now.toISOString().slice(0, 10)}.json`
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      toast.success("Esportazione completata.")
    } catch (error: unknown) {
      toast.error(errorToastMessage(error, "Impossibile esportare i dati."))
    }
  }

  const handleLogoutAllDevices = async () => {
    if (isUnregistering || logoutAllDevicesMutation.isPending) return
    // Before the server call: push.unregister needs the session.
    setIsUnregistering(true)
    try {
      await unregisterPushToken()
    } finally {
      setIsUnregistering(false)
    }
    logoutAllDevicesMutation.mutate()
  }

  const isDeletingAccount = isUnregistering || deleteAccountMutation.isPending

  const handleDeleteAccount = async () => {
    if (deleteRequiresPassword && !deletePassword.trim()) {
      setDeletePasswordError("Inserisci la password per confermare l'eliminazione.")
      document.getElementById(deletePasswordId)?.focus()
      return
    }
    setDeletePasswordError(null)
    if (isDeletingAccount) return
    // Before the server call: push.unregister needs the session.
    setIsUnregistering(true)
    try {
      await unregisterPushToken()
    } finally {
      setIsUnregistering(false)
    }
    deleteAccountMutation.mutate(
      deleteRequiresPassword ? { password: deletePassword.trim() } : {}
    )
  }

  // No data yet and no error: loading, or paused offline (isLoading is false then).
  const profileLoading = awaitingData(meQuery) || awaitingData(profileQuery)
  const profileFailed = (meQuery.isError && !me) || (profileQuery.isError && !profile)
  const retryProfile = () => {
    if (meQuery.isError) void meQuery.refetch()
    if (profileQuery.isError) void profileQuery.refetch()
  }
  // Tabs whose values come from profile.get: never shown with defaults that a toggle would save.
  const profileGate = (label: string): ReactNode =>
    profileLoading ? (
      <LoadingSkeleton label={label} count={3} itemClassName="h-24 w-full rounded-2xl" />
    ) : profileFailed ? (
      <LoadError onRetry={retryProfile} />
    ) : null

  const statusesLoading = awaitingData(garminStatusQuery) || awaitingData(stravaStatusQuery)
  const statusesFailed = (garminStatusQuery.isError && !garminStatus) || (stravaStatusQuery.isError && !stravaStatus)
  const accounts = [
    {
      name: "Garmin Connect",
      connected: garminStatus?.connected ?? false,
      lastSync: garminStatus?.lastSync ?? null,
      activities: activitiesBySource.garmin,
      // Connect, sync and disconnect are in the Garmin card below.
      manage: true,
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
      comingSoon: true,
    },
  ]

  return (
    <AppLayout>
      <div className="space-y-4">
        <SummarySection metrics={summaryMetrics} loading={summaryLoading} />

        {onboarding && (
          <Section title="Benvenuto su SwimForge">
            <p className="mt-1 text-[15px] text-muted-foreground">
              {activeTab === "profile"
                ? "Passo 1 di 2: completa il profilo (foto, cover e dati). Poi passa a Connessioni per collegare Garmin."
                : "Passo 2 di 2: collega Garmin Connect e avvia la prima sincronizzazione."}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {activeTab !== "connections" ? (
                <Button onClick={() => updateTabInUrl("connections")}>Vai a Connessioni</Button>
              ) : (
                <>
                  <GarminSyncCountPicker
                    value={garminSyncCount}
                    onChange={setGarminSyncCount}
                    disabled={!garminStatus?.connected || garminSyncMutation.isPending}
                  />
                  <Button
                    onClick={() => garminSyncMutation.mutate({ daysBack: 30, maxActivities: garminSyncCount })}
                    disabled={!garminStatus?.connected || garminSyncMutation.isPending}
                  >
                    {garminSyncMutation.isPending ? "Sincronizzazione…" : garminSyncButtonLabel(garminSyncCount)}
                  </Button>
                </>
              )}
              <Button asChild variant="outline">
                <RouterLink href={homePathForPlatform(isNativePlatform())}>Vai alla home</RouterLink>
              </Button>
            </div>
          </Section>
        )}

        <Tabs value={activeTab} onValueChange={updateTabInUrl} className="gap-4">
          <TabsList aria-label="Sezioni delle impostazioni">
            <TabsTrigger value="profile">Profilo</TabsTrigger>
            <TabsTrigger value="connections">Connessioni</TabsTrigger>
            <TabsTrigger value="notifications">Notifiche</TabsTrigger>
            <TabsTrigger value="preferences">Preferenze</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-4">
            {profileGate("Caricamento del profilo…") ?? (
              <>
                <Section title="Informazioni profilo" description="Aggiorna le informazioni del tuo profilo pubblico.">
                  <div className="mt-4 space-y-5">
                    {/* Cover Image */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">Cover profilo</p>
                          <p className="text-sm text-muted-foreground">JPG, PNG o WEBP · max 20 MB</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => coverInputRef.current?.click()}
                          disabled={isUploadingCover}
                        >
                          <Camera aria-hidden />
                          {isUploadingCover ? "Caricamento…" : "Cambia cover"}
                        </Button>
                      </div>
                      <input
                        ref={coverInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        aria-hidden
                        tabIndex={-1}
                        onChange={(event) => handleCoverUpload(event.target.files?.[0])}
                      />
                      <div className="h-36 overflow-hidden rounded-xl bg-raised">
                        {profileDraft.coverUrl ? (
                          <img src={profileDraft.coverUrl} alt="Cover profilo" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                    </div>

                    {/* Avatar */}
                    <div className="flex items-center gap-5">
                      <div className="relative">
                        <Avatar className="size-24 border border-border">
                          <AvatarImage src={profileDraft.avatarUrl || assetUrl("/images/ai_coach_avatar.webp")} alt="" />
                          <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                        <Button
                          size="icon"
                          className="absolute -bottom-1 -right-1 rounded-full"
                          aria-label="Cambia foto profilo"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={isUploadingAvatar}
                        >
                          <Camera aria-hidden />
                        </Button>
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          aria-hidden
                          tabIndex={-1}
                          onChange={(event) => handleAvatarUpload(event.target.files?.[0])}
                        />
                      </div>
                      <div>
                        <p className="font-semibold">Foto profilo</p>
                        <p className="text-sm text-muted-foreground">
                          {isUploadingAvatar ? "Caricamento…" : "JPG, PNG o WEBP · max 20 MB"}
                        </p>
                      </div>
                    </div>

                    {/* Form Fields */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <TextField
                        label="Nome"
                        autoComplete="given-name"
                        value={profileDraft.name}
                        onChange={(value) => setProfileDraft((prev) => ({ ...prev, name: value }))}
                      />
                      <TextField
                        label="Cognome"
                        autoComplete="family-name"
                        value={profileDraft.lastName}
                        onChange={(value) => setProfileDraft((prev) => ({ ...prev, lastName: value }))}
                      />
                      <TextField
                        label="Username"
                        autoComplete="username"
                        value={profileDraft.username}
                        onChange={(value) => setProfileDraft((prev) => ({ ...prev, username: value }))}
                      />
                      <SelectField
                        label="Nome da mostrare"
                        value={displayNamePreference}
                        onChange={(value) => {
                          const next = value === "nickname" ? "nickname" : "full"
                          setDisplayNamePreference(next)
                          localStorage.setItem("swimforge:dashboardDisplayName", next)
                          toast.success("Preferenza aggiornata.")
                        }}
                        options={[
                          { value: "full", label: "Nome e cognome" },
                          { value: "nickname", label: "Username" },
                        ]}
                      />
                      <TextField
                        label="Email"
                        type="email"
                        autoComplete="email"
                        value={profileDraft.email}
                        onChange={(value) => setProfileDraft((prev) => ({ ...prev, email: value }))}
                      />
                      <TextField
                        label="Città"
                        autoComplete="address-level2"
                        value={profileDraft.location}
                        onChange={(value) => setProfileDraft((prev) => ({ ...prev, location: value }))}
                      />
                      <TextField
                        label="Data di nascita"
                        type="date"
                        autoComplete="bday"
                        value={profileDraft.birthDate}
                        onChange={(value) => setProfileDraft((prev) => ({ ...prev, birthDate: value }))}
                      />
                    </div>

                    <BioField
                      value={profileDraft.bio}
                      onChange={(value) => setProfileDraft((prev) => ({ ...prev, bio: value }))}
                    />

                    <Button onClick={handleSaveProfile} disabled={updateProfileMutation.isPending}>
                      {updateProfileMutation.isPending ? "Salvataggio…" : "Salva modifiche"}
                    </Button>
                  </div>
                </Section>

                {/* Swimming Profile */}
                <Section title="Profilo nuotatore" description="Informazioni specifiche per il nuoto.">
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Livello</p>
                        <p className="text-[15px]">{profile?.aiSkillLabel || profile?.levelTitle || "Non disponibile"}</p>
                      </div>
                      <SelectField
                        label="Stile preferito"
                        value={profileDraft.preferredStroke || "auto"}
                        onChange={(value) => setProfileDraft((prev) => ({ ...prev, preferredStroke: value }))}
                        options={strokeOptions}
                        hint={favoriteStroke ? `Il più nuotato: ${favoriteStroke}` : undefined}
                      />
                      <TextField
                        label="Lunghezza della piscina preferita (m)"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        placeholder={preferredPool}
                        value={profileDraft.preferredPoolLengthMeters}
                        onChange={(value) =>
                          setProfileDraft((prev) => ({ ...prev, preferredPoolLengthMeters: value }))
                        }
                      />
                      <TextField
                        label="Categoria master"
                        value={profileDraft.masterCategory}
                        onChange={(value) => setProfileDraft((prev) => ({ ...prev, masterCategory: value }))}
                      />
                    </div>
                    <Button onClick={handleSaveSwimmerProfile} disabled={updateProfileMutation.isPending}>
                      {updateProfileMutation.isPending ? "Salvataggio…" : "Salva profilo nuotatore"}
                    </Button>
                  </div>
                </Section>
              </>
            )}
          </TabsContent>

          {/* Connections Tab */}
          <TabsContent value="connections" className="space-y-4">
            <Section
              title="Account collegati"
              description="Collega i tuoi dispositivi e le tue app per sincronizzare le attività in automatico."
            >
              {statusesLoading ? (
                <LoadingSkeleton
                  label="Caricamento degli account collegati…"
                  count={3}
                  className="mt-4 space-y-2"
                  itemClassName="h-16 w-full rounded-xl"
                />
              ) : statusesFailed ? (
                <LoadError
                  variant="inline"
                  className="mt-4"
                  onRetry={() => {
                    if (garminStatusQuery.isError) void garminStatusQuery.refetch()
                    if (stravaStatusQuery.isError) void stravaStatusQuery.refetch()
                  }}
                />
              ) : (
                <ul className="mt-4 divide-y divide-border">
                  {accounts.map((account) => (
                    <li
                      key={account.name}
                      className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold">{account.name}</p>
                        <p className="break-words text-sm text-muted-foreground">
                          {account.connected
                            ? `Ultima sincronizzazione ${formatLastSync(account.lastSync)} · ${formatInteger(account.activities)} attività`
                            : account.comingSoon
                              ? "Disponibile prossimamente"
                              : "Non collegato"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {account.connected ? (
                          <span className="inline-flex items-center gap-1 text-sm font-semibold text-success">
                            <Check className="size-4" aria-hidden />
                            Collegato
                          </span>
                        ) : null}
                        {account.manage ? (
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={scrollToGarminControls}
                            aria-label={account.connected ? "Gestisci Garmin Connect" : "Collega Garmin Connect"}
                          >
                            {account.connected ? "Gestisci" : "Collega"}
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <div id="garmin-connection-controls" className="scroll-mt-20">
              <GarminSection garminConnected={garminStatus?.connected ?? false} headingRef={garminHeadingRef} />
            </div>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-4">
            {profileGate("Caricamento delle notifiche…") ?? (
              <Section title="Notifiche" description="Scegli quali notifiche ricevere.">
                <div className="mt-2 divide-y divide-border">
                  {notificationSettings.map((setting) => (
                    <SwitchRow
                      key={setting.id}
                      title={setting.title}
                      description={setting.description}
                      checked={Boolean(notifications[setting.id])}
                      onChange={() => toggleNotification(setting.id)}
                    />
                  ))}
                </div>
              </Section>
            )}
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences" className="space-y-4">
            {profileGate("Caricamento delle preferenze…") ?? (
              <>
                <Section title="Unità e video">
                  <div className="mt-2 divide-y divide-border">
                    <SelectRow
                      title="Unità di misura"
                      description="Chilometri e metri, oppure miglia e iarde"
                      value={preferences.units}
                      onChange={(value) => {
                        const next = { ...preferences, units: value as "metric" | "imperial" }
                        setPreferences(next)
                        void persistSettings({ preferences: next })
                      }}
                      options={[
                        { value: "metric", label: "Metrico" },
                        { value: "imperial", label: "Imperiale" },
                      ]}
                    />
                    <SelectRow
                      title="Formato del passo"
                      description="Come mostrare il ritmo"
                      value={preferences.paceFormat}
                      onChange={(value) => {
                        const next = { ...preferences, paceFormat: value as "100m" | "100y" }
                        setPreferences(next)
                        void persistSettings({ preferences: next })
                      }}
                      options={[
                        { value: "100m", label: "min/100m" },
                        { value: "100y", label: "min/100yd" },
                      ]}
                    />
                    <SwitchRow
                      title="Riproduzione automatica dei video"
                      description="Avvia automaticamente i video nel feed quando sono visibili."
                      checked={preferences.autoplayVideos}
                      onChange={(value) => {
                        const next = { ...preferences, autoplayVideos: value }
                        setPreferences(next)
                        void persistSettings({ preferences: next })
                      }}
                    />
                    <div className="flex flex-col gap-3 py-3 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold">Tour guidato dell&apos;app</p>
                        <p className="text-sm text-muted-foreground">
                          Rivedi il video introduttivo e il tour interattivo dei punti principali.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 self-start sm:self-auto"
                        onClick={() => {
                          if (typeof window !== "undefined") {
                            window.dispatchEvent(new CustomEvent("swimforge:onboarding:start"))
                          }
                          setLocation(`${homePathForPlatform(isNativePlatform())}?${ONBOARDING_FORCE_QUERY_PARAM}=1`)
                        }}
                      >
                        Rivedi il tour
                      </Button>
                    </div>
                  </div>
                </Section>

                <Section title="Lingua e regione">
                  <div className="mt-2 divide-y divide-border">
                    <SelectRow
                      title="Lingua"
                      value={preferences.language}
                      onChange={(value) => {
                        const next = { ...preferences, language: value as "it" | "en" | "es" | "fr" }
                        setPreferences(next)
                        void persistSettings({ preferences: next })
                      }}
                      options={[
                        { value: "it", label: "Italiano" },
                        { value: "en", label: "English" },
                        { value: "es", label: "Español" },
                        { value: "fr", label: "Français" },
                      ]}
                    />
                    <SelectRow
                      title="Fuso orario"
                      value={preferences.timezone}
                      onChange={(value) => {
                        const next = { ...preferences, timezone: value }
                        setPreferences(next)
                        void persistSettings({ preferences: next })
                      }}
                      options={[
                        { value: "Europe/Rome", label: "Europe/Rome (UTC+1)" },
                        { value: "Europe/London", label: "Europe/London (UTC)" },
                        { value: "America/New_York", label: "America/New_York (UTC-5)" },
                      ]}
                    />
                  </div>
                </Section>
              </>
            )}
          </TabsContent>

          {/* Privacy Tab */}
          <TabsContent value="privacy" className="space-y-4">
            {profileGate("Caricamento della privacy…") ?? (
              <Section title="Privacy del profilo">
                <div className="mt-2 divide-y divide-border">
                  <SwitchRow
                    title="Profilo pubblico"
                    description="Permetti ad altri utenti di vedere il tuo profilo"
                    checked={privacySettings.profilePublic}
                    onChange={(value) => {
                      const next = { ...privacySettings, profilePublic: value }
                      setPrivacySettings(next)
                      void persistSettings({ privacySettings: next })
                    }}
                  />
                  <SwitchRow
                    title="Attività pubbliche"
                    description="Mostra le tue attività nel feed della community"
                    checked={privacySettings.activitiesPublic}
                    onChange={(value) => {
                      const next = { ...privacySettings, activitiesPublic: value }
                      setPrivacySettings(next)
                      void persistSettings({ privacySettings: next })
                    }}
                  />
                  <SwitchRow
                    title="Mostra nelle classifiche"
                    description="Partecipa alle classifiche pubbliche"
                    checked={privacySettings.showLeaderboards}
                    onChange={(value) => {
                      const next = { ...privacySettings, showLeaderboards: value }
                      setPrivacySettings(next)
                      void persistSettings({ privacySettings: next })
                    }}
                  />
                  <SwitchRow
                    title="Consenti inoltri privati"
                    description="Permetti che i post vengano inoltrati in chat privata"
                    checked={privacySettings.allowPrivateForwards}
                    onChange={(value) => {
                      const next = {
                        ...privacySettings,
                        allowPrivateForwards: value,
                      }
                      setPrivacySettings(next)
                      void persistSettings({ privacySettings: next })
                    }}
                  />
                  <SwitchRow
                    title="Inoltri solo ai follower"
                    description="Limita gli inoltri privati ai soli utenti che ti seguono"
                    checked={privacySettings.forwardsFollowersOnly}
                    disabled={!privacySettings.allowPrivateForwards}
                    onChange={(value) => {
                      const next = { ...privacySettings, forwardsFollowersOnly: value }
                      setPrivacySettings(next)
                      void persistSettings({ privacySettings: next })
                    }}
                  />
                </div>
              </Section>
            )}

            <Section
              title="Consensi GDPR"
              description="Gestisci i consensi opzionali. Termini e Privacy sono obbligatori per usare il servizio."
            >
              {consentsQuery.isLoading ? (
                <LoadingSkeleton
                  label="Caricamento dei consensi…"
                  count={4}
                  className="mt-4 space-y-2"
                  itemClassName="h-12 w-full rounded-xl"
                />
              ) : consentsQuery.isError && !consentsQuery.data ? (
                <LoadError variant="inline" className="mt-4" onRetry={() => void consentsQuery.refetch()} />
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="space-y-2">
                    <RequiredConsent
                      title="Termini di Servizio"
                      status="Obbligatorio · accettato"
                      version={(consentsQuery.data as any)?.versions?.terms_acceptance ?? "v1.1"}
                    />
                    <RequiredConsent
                      title="Privacy Policy"
                      status="Obbligatorio · accettata"
                      version={(consentsQuery.data as any)?.versions?.privacy_policy ?? "v1.1"}
                    />
                  </div>
                  <div className="divide-y divide-border">
                    {consentItems.map((item) => (
                      <SwitchRow
                        key={item.type}
                        title={item.title}
                        description={item.description}
                        checked={Boolean(consentState[item.type])}
                        disabled={setConsentMutation.isPending || consentNeedsProfile(item.type)}
                        onChange={(value) => void toggleConsent(item.type, value)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <RouterLink href="/privacy">Apri la Privacy Policy</RouterLink>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <RouterLink href="/terms">Apri i Termini</RouterLink>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <RouterLink href="/cookies">Cookie Policy</RouterLink>
                </Button>
              </div>
            </Section>

            <Section title="Dati e account">
              <div className="mt-2 divide-y divide-border">
                <ActionRow
                  title="Esporta i dati"
                  description="Scarica tutti i tuoi dati in formato JSON"
                  action={
                    <Button variant="outline" onClick={handleExportData}>
                      <Download aria-hidden />
                      Esporta
                    </Button>
                  }
                />
                <ActionRow
                  title="Esci da tutti i dispositivi"
                  description="Disconnetti tutte le sessioni attive"
                  action={
                    <Button
                      variant="outline"
                      className="text-danger"
                      onClick={() => void handleLogoutAllDevices()}
                      disabled={isUnregistering || logoutAllDevicesMutation.isPending}
                    >
                      <LogOut aria-hidden />
                      {isUnregistering || logoutAllDevicesMutation.isPending ? "Uscita…" : "Esci ovunque"}
                    </Button>
                  }
                />
                <ActionRow
                  title="Elimina account"
                  titleClassName="text-danger"
                  description="Elimina per sempre il tuo account e tutti i dati"
                  action={
                    <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                      <Trash2 aria-hidden />
                      Elimina
                    </Button>
                  }
                />
                {isDevResetAccount ? (
                  <ActionRow
                    title="Reset dell'app per il lancio (solo dev)"
                    titleClassName="text-warning"
                    description="Cancella tutti i dati di test (attività, club, post, notifiche, chat, sfide). L'account dev resta attivo."
                    action={
                      <Button variant="outline" className="text-warning" onClick={() => setResetDialogOpen(true)}>
                        <AlertTriangle aria-hidden />
                        Reset app
                      </Button>
                    }
                  />
                ) : null}
              </div>
            </Section>
          </TabsContent>
        </Tabs>

        <Dialog
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            // While the deletion runs, Esc, a tap outside and the X do not close it.
            if (!open && isDeletingAccount) return
            setDeleteDialogOpen(open)
            if (!open) {
              setDeletePassword("")
              setDeletePasswordError(null)
            }
          }}
        >
          <DialogContent className="rounded-2xl bg-card shadow-none" showCloseButton={!isDeletingAccount}>
            <DialogHeader>
              <DialogTitle className="text-[17px] font-bold text-danger">Conferma eliminazione account</DialogTitle>
              <DialogDescription>
                {deleteRequiresPassword
                  ? "Questa azione è irreversibile. Inserisci la password per confermare."
                  : "Questa azione è irreversibile. Conferma per eliminare definitivamente l'account."}
              </DialogDescription>
            </DialogHeader>
            {deleteRequiresPassword ? (
              <div className="space-y-2">
                <Label htmlFor={deletePasswordId}>Password</Label>
                <Input
                  id={deletePasswordId}
                  type="password"
                  value={deletePassword}
                  onChange={(event) => {
                    setDeletePassword(event.target.value)
                    setDeletePasswordError(null)
                  }}
                  autoComplete="current-password"
                  {...fieldAria(deletePasswordId, deletePasswordError ?? undefined)}
                />
                <FieldError fieldId={deletePasswordId} error={deletePasswordError ?? undefined} />
                <p className="text-sm text-muted-foreground">
                  Dopo l&apos;eliminazione riceverai un&apos;email di conferma.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Questo account usa un accesso esterno (Google, Apple o simili): non serve una password.
                Dopo l&apos;eliminazione riceverai un&apos;email di conferma.
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={isDeletingAccount}
              >
                Annulla
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleDeleteAccount()}
                disabled={isDeletingAccount || (deleteRequiresPassword && deletePassword.trim().length === 0)}
              >
                {isDeletingAccount ? "Eliminazione…" : "Conferma eliminazione"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={resetDialogOpen}
          onOpenChange={(open) => {
            setResetDialogOpen(open)
            if (!open) setResetConfirmationText("")
          }}
        >
          <DialogContent className="rounded-2xl bg-card shadow-none">
            <DialogHeader>
              <DialogTitle className="text-[17px] font-bold text-warning">Conferma reset completo app (solo dev)</DialogTitle>
              <DialogDescription>
                Operazione irreversibile: verranno eliminati tutti i dati di test. L&apos;account dev rimane attivo.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="reset-app-confirmation">
                Scrivi esattamente: <span className="font-mono">RESET APP</span>
              </Label>
              <Input
                id="reset-app-confirmation"
                value={resetConfirmationText}
                onChange={(event) => setResetConfirmationText(event.target.value)}
                placeholder="RESET APP"
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setResetDialogOpen(false)}>
                Annulla
              </Button>
              <Button
                variant="destructive"
                disabled={resetConfirmationText.trim() !== "RESET APP" || resetAppForLaunchMutation.isPending}
                onClick={() => {
                  resetAppForLaunchMutation.mutate({ confirmation: resetConfirmationText.trim() })
                }}
              >
                {resetAppForLaunchMutation.isPending ? "Reset in corso…" : "Conferma reset"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  )
}

const sectionTitle = "text-[17px] font-bold"

/** A settings card: h2 title (the page title is the shell's «Impostazioni»), optional line. */
function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="surface-panel p-4">
      <h2 id={titleId} className={sectionTitle}>
        {title}
      </h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      {children}
    </section>
  )
}

/** XP, integrations, imported swims and favourite stroke as Corsia metrics. */
function SummarySection({ metrics, loading }: { metrics: MetricProps[]; loading: boolean }) {
  if (metrics.length === 0 && loading) {
    return (
      <LoadingSkeleton
        label="Caricamento del riepilogo…"
        count={4}
        className="surface-panel grid grid-cols-2 gap-4 p-4 sm:grid-cols-4"
        itemClassName="h-12"
      />
    )
  }
  if (metrics.length === 0) return null
  return (
    <section aria-label="Riepilogo" className="surface-panel p-4">
      <ul className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        {metrics.map((metric) => (
          <li key={metric.label}>
            <Metric {...metric} size="sm" />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** A setting with a switch: the title names the switch, the line describes it. */
function SwitchRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string
  description?: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  const titleId = useId()
  const descriptionId = useId()
  return (
    <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
      <div>
        <p id={titleId} className="font-semibold">
          {title}
        </p>
        {description ? (
          <p id={descriptionId} className="text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <Switch
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  )
}

/** A setting with a choice: the title names the select. */
function SelectRow({
  title,
  description,
  value,
  onChange,
  options,
}: {
  title: string
  description?: string
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<{ value: string; label: string }>
}) {
  const titleId = useId()
  const descriptionId = useId()
  return (
    <div className="flex flex-col gap-2 py-3 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p id={titleId} className="font-semibold">
          {title}
        </p>
        {description ? (
          <p id={descriptionId} className="text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          className="w-full sm:w-56"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** A labelled text field of the profile form. */
function TextField({
  label,
  value,
  onChange,
  ...input
}: {
  label: string
  value: string
  onChange: (value: string) => void
} & Omit<ComponentProps<typeof Input>, "id" | "value" | "onChange">) {
  const id = useId()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} {...input} />
    </div>
  )
}

/** A labelled select of the profile form, with an optional hint below. */
function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<{ value: string; label: string }>
  hint?: string
}) {
  const id = useId()
  const hintId = useId()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} aria-describedby={hint ? hintId : undefined} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function BioField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Bio</Label>
      <Textarea id={id} rows={4} className="resize-none" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

/** Terms and Privacy: always accepted to use the service, with the accepted version. */
function RequiredConsent({ title, status, version }: { title: string; status: string; version: string }) {
  return (
    <div className="rounded-xl bg-raised p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{title}</p>
        <span className="text-sm font-semibold text-success">{status}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Versione: {version}</p>
    </div>
  )
}

/** An account action: title and line on the left, its button on the right (below on phones). */
function ActionRow({
  title,
  titleClassName,
  description,
  action,
}: {
  title: string
  titleClassName?: string
  description: string
  action: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 py-3 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className={cn("font-semibold", titleClassName)}>{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  )
}
