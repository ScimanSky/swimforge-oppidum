"use client"

import AppLayout from "@/components/AppLayout"
import { useEffect, useMemo, useState } from "react"
import { Link } from "wouter"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MetricOrb } from "@/components/metrics/MetricOrb"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AnimatePresence, motion } from "framer-motion"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Droplet,
  MessageCircle,
  Users,
  Plus,
  Sparkles,
  ChevronRight,
} from "lucide-react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"

const formatDistance = (meters?: number | null) => {
  if (!meters) return "—"
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
}

const formatDuration = (seconds?: number | null) => {
  if (!seconds) return "—"
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes} min`
}

const formatPace = (meters?: number | null, seconds?: number | null) => {
  if (!meters || !seconds || meters <= 0) return "—"
  const pace = seconds / (meters / 100)
  if (!Number.isFinite(pace)) return "—"
  const minutes = Math.floor(pace / 60)
  const secs = Math.round(pace % 60)
  return `${minutes}:${secs.toString().padStart(2, "0")}/100m`
}

const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString)
  const diffMs = Date.now() - date.getTime()
  const isFuture = diffMs < 0
  const diffMinutes = Math.floor(Math.abs(diffMs) / 60000)
  if (diffMinutes < 1) return isFuture ? "tra poco" : "adesso"
  if (diffMinutes < 60) return isFuture ? `tra ${diffMinutes} min` : `${diffMinutes} min fa`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return isFuture ? `tra ${diffHours}h` : `${diffHours}h fa`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return isFuture ? `tra ${diffDays}g` : `${diffDays}g fa`
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" })
}

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "SW"

export default function Community() {
  const [commentTextByPost, setCommentTextByPost] = useState<Record<number, string>>({})
  const [openCommentsId, setOpenCommentsId] = useState<number | null>(null)
  const [desktopSection, setDesktopSection] = useState<"feed" | "clubs">("feed")
  const [isDesktopWide, setIsDesktopWide] = useState(false)
  const [clubScope, setClubScope] = useState<"all" | "mine">("all")
  const [clubSearch, setClubSearch] = useState("")
  const [feedPage, setFeedPage] = useState(1)
  const [clubsPage, setClubsPage] = useState(1)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState({
    name: "",
    description: "",
    visibility: "public",
    coverImageUrl: "",
  })

  const profileQuery = trpc.profile.get.useQuery()
  const currentUserId = profileQuery.data?.userId

  const feedQuery = trpc.community.feed.useQuery({ limit: 20, scope: "global" })
  const clubsQuery = trpc.community.clubs.list.useQuery({
    scope: clubScope,
    search: clubSearch.trim() || undefined,
    limit: 12,
  })
  const toggleSplash = trpc.community.toggleSplash.useMutation({
    onSuccess: (data: any) => {
      if (Number(data?.actionXp?.awardedXp ?? 0) > 0) {
        toast.success(`+${data.actionXp.awardedXp} XP Action`)
      }
      feedQuery.refetch()
    },
    onError: (err) => toast.error(err.message || "Impossibile inviare uno Splash"),
  })

  const commentsQuery = trpc.community.comments.useQuery(
    { postId: openCommentsId ?? 0 },
    { enabled: !!openCommentsId }
  )

  const addComment = trpc.community.addComment.useMutation({
    onSuccess: (data: any, variables) => {
      if (Number(data?.actionXp?.awardedXp ?? 0) > 0) {
        toast.success(`+${data.actionXp.awardedXp} XP Action`)
      }
      setCommentTextByPost((prev) => ({ ...prev, [variables.postId]: "" }))
      commentsQuery.refetch()
      feedQuery.refetch()
    },
    onError: (err) => toast.error(err.message || "Impossibile inviare il commento"),
  })

  const createClub = trpc.community.clubs.create.useMutation({
    onSuccess: (data) => {
      toast.success("Club creato!")
      setIsCreateOpen(false)
      setCreateDraft({ name: "", description: "", visibility: "public", coverImageUrl: "" })
      setClubScope("mine")
      clubsQuery.refetch()
      if (data?.clubId) {
        toast.info("Apri il club dalla lista per gestirlo.")
      }
    },
    onError: (err) => toast.error(err.message || "Impossibile creare il club"),
  })

  const feedItems = useMemo(() => (feedQuery.data as any[]) || [], [feedQuery.data])
  const clubs = useMemo(() => (clubsQuery.data as any[]) || [], [clubsQuery.data])
  const feedPageSize = isDesktopWide ? 1 : 2
  const clubsPageSize = isDesktopWide ? 3 : 4
  const feedTotalPages = Math.max(1, Math.ceil(feedItems.length / feedPageSize))
  const clubsTotalPages = Math.max(1, Math.ceil(clubs.length / clubsPageSize))
  const pagedFeedItems = useMemo(() => {
    const start = (feedPage - 1) * feedPageSize
    return feedItems.slice(start, start + feedPageSize)
  }, [feedItems, feedPage])
  const pagedClubs = useMemo(() => {
    const start = (clubsPage - 1) * clubsPageSize
    return clubs.slice(start, start + clubsPageSize)
  }, [clubs, clubsPage])

  useEffect(() => {
    setFeedPage(1)
  }, [feedItems.length])

  useEffect(() => {
    if (typeof window === "undefined") return
    const media = window.matchMedia("(min-width: 1280px)")
    const sync = () => setIsDesktopWide(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    setClubsPage(1)
  }, [clubScope, clubSearch, clubs.length])
  const communityOrbs = useMemo(() => {
    const totalMembers = clubs.reduce((sum, club) => sum + Number(club.member_count || 0), 0)
    const totalSplashes = feedItems.reduce((sum, post) => sum + Number(post.splash_count || 0), 0)
    const totalComments = feedItems.reduce((sum, post) => sum + Number(post.comment_count || 0), 0)

    return [
      {
        label: "Post nel feed",
        value: feedItems.length,
        progress: Math.min(100, Math.round((feedItems.length / 20) * 100)),
        helper: "Ultimo caricamento",
        icon: <MessageCircle className="size-4" />,
        tone: "cyan" as const,
      },
      {
        label: "Club visibili",
        value: clubs.length,
        progress: Math.min(100, Math.round((clubs.length / 12) * 100)),
        helper: clubScope === "mine" ? "Solo i tuoi club" : "Tutti i club",
        icon: <Users className="size-4" />,
        tone: "lime" as const,
      },
      {
        label: "Membri attivi",
        value: totalMembers.toLocaleString(),
        progress: Math.min(100, Math.round((totalMembers / 500) * 100)),
        helper: "Somma club in vista",
        icon: <Sparkles className="size-4" />,
        tone: "amber" as const,
      },
      {
        label: "Interazioni",
        value: totalSplashes + totalComments,
        progress: Math.min(100, Math.round(((totalSplashes + totalComments) / 150) * 100)),
        helper: `${totalSplashes} splash • ${totalComments} commenti`,
        icon: <Droplet className="size-4" />,
        tone: "sky" as const,
      },
    ]
  }, [clubs, feedItems, clubScope])

  const submitComment = (postId: number) => {
    const content = (commentTextByPost[postId] ?? "").trim()
    if (!content) return
    addComment.mutate({ postId, content })
  }

  const createClubDialog = (
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogTrigger asChild>
        <Button variant="neon" className="gap-2">
          <Plus className="h-4 w-4" />
          Crea club
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crea il tuo club</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Nome club</p>
            <Input
              value={createDraft.name}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Es. SwimForge Milano"
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Descrizione</p>
            <Textarea
              value={createDraft.description}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="Scrivi due righe per presentare il club"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Visibilità</p>
            <Select
              value={createDraft.visibility}
              onValueChange={(value) =>
                setCreateDraft((prev) => ({ ...prev, visibility: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona visibilità" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Pubblico</SelectItem>
                {/* "invite" means visible but requires approval; label it as "Privato" for users */}
                <SelectItem value="private">Segreto</SelectItem>
                <SelectItem value="invite">Privato</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Cover (opzionale)</p>
            <Input
              value={createDraft.coverImageUrl}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, coverImageUrl: event.target.value }))
              }
              placeholder="https://..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline-neon" onClick={() => setIsCreateOpen(false)}>
              Annulla
            </Button>
            <Button
              variant="neon"
              onClick={() =>
                createClub.mutate({
                  name: createDraft.name.trim(),
                  description: createDraft.description.trim() || undefined,
                  coverImageUrl: createDraft.coverImageUrl.trim() || undefined,
                  visibility: createDraft.visibility as "public" | "private" | "invite",
                  isPrivate: createDraft.visibility === "private",
                })
              }
              disabled={createClub.isPending || createDraft.name.trim().length < 3}
            >
              {createClub.isPending ? "Creazione..." : "Crea Club"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )

  const renderFeed = () => {
    if (feedQuery.isLoading) {
      return (
        <div className="surface-panel p-6 text-muted-foreground">Caricamento feed...</div>
      )
    }

    if (feedItems.length === 0) {
      return (
        <div className="surface-panel p-8 text-center text-muted-foreground">
          Nessun contenuto nel feed. Condividi la tua prossima sessione!
        </div>
      )
    }

    return (
      <>
      <div className="space-y-4">
        {pagedFeedItems.map((post, index) => {
          const name = post.user_name || post.user_email?.split("@")[0] || "Nuotatore"
          const initials = getInitials(name)
          const distance = formatDistance(post.activity_distance_meters)
          const duration = formatDuration(post.activity_duration_seconds)
          const pace = formatPace(post.activity_distance_meters, post.activity_duration_seconds)
          const activityType = post.activity_is_open_water ? "Open Water" : "Pool"
          const isOwner = currentUserId && post.user_id === currentUserId

          return (
            <motion.div
              key={post.id}
              className="stream-node"
              initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.35, ease: "easeOut", delay: Math.min(index * 0.035, 0.25) }}
            >
              <div className="surface-panel p-3.5">
                  {/* Post Header */}
                  <div className="flex items-start gap-3 mb-4">
                    <Avatar className="w-10 h-10 border border-border">
                      <AvatarImage src={post.user_avatar || ""} alt={name} />
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/u/${post.user_id}`}
                          className="font-semibold text-foreground truncate hover:underline"
                        >
                          {name}
                        </Link>
                        {post.activity_source ? (
                          <Badge variant="neon" className="text-[10px]">
                            {post.activity_source}
                          </Badge>
                        ) : null}
                        <Badge
                          variant="outline"
                          className={
                            activityType === "Pool"
                              ? "border-primary/40 text-primary text-[10px]"
                              : "border-accent/40 text-accent text-[10px]"
                          }
                        >
                          {activityType}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatTimeAgo(post.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Activity Bento */}
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="rounded-2xl border border-border/80 bg-background/60 p-3">
                      <p className="text-sm font-display font-bold text-foreground">{distance}</p>
                      <p className="text-[10px] text-muted-foreground">Distanza</p>
                    </div>
                    <div className="rounded-2xl border border-border/80 bg-background/60 p-3">
                      <p className="text-sm font-display font-bold text-foreground">{duration}</p>
                      <p className="text-[10px] text-muted-foreground">Durata</p>
                    </div>
                    <div className="rounded-2xl border border-border/80 bg-background/60 p-3">
                      <p className="text-sm font-display font-bold text-foreground">{pace}</p>
                      <p className="text-[10px] text-muted-foreground">Pace</p>
                    </div>
                  </div>

                  {post.content ? (
                    <p className="mt-4 text-sm text-foreground whitespace-pre-wrap">{post.content}</p>
                  ) : null}

                  {/* Actions */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      variant={post.has_splashed ? "neon" : "outline-neon"}
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        if (isOwner) {
                          toast.info("Non puoi mettere Splash al tuo allenamento.")
                          return
                        }
                        toggleSplash.mutate({ postId: post.id })
                      }}
                      disabled={isOwner || toggleSplash.isPending}
                    >
                      <Droplet className={post.has_splashed ? "h-4 w-4 fill-primary-foreground" : "h-4 w-4"} />
                      Splash
                      <span className="tabular-nums opacity-90">({post.splash_count || 0})</span>
                    </Button>

                    <Button
                      variant="ghost-neon"
                      size="sm"
                      className="gap-2"
                      onClick={() => setOpenCommentsId(openCommentsId === post.id ? null : post.id)}
                    >
                      <MessageCircle className="h-4 w-4" />
                      Commenti
                      <span className="tabular-nums opacity-75">({post.comment_count || 0})</span>
                    </Button>

                    {post.activity_id && !isOwner ? (
                      <Badge variant="outline" className="ml-auto text-[10px]">
                        Sessione pubblica
                      </Badge>
                    ) : null}
                  </div>

                  <AnimatePresence initial={false}>
                    {openCommentsId === post.id ? (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 rounded-2xl border border-border bg-background/60 p-4 space-y-3">
                          <div className="space-y-3">
                            {commentsQuery.isLoading && openCommentsId === post.id ? (
                              <div className="text-sm text-muted-foreground">Caricamento...</div>
                            ) : (commentsQuery.data ?? []).length > 0 ? (
                              (commentsQuery.data ?? []).slice(0, 3).map((comment: any) => (
                                <div key={comment.id} className="flex items-start gap-2">
                                  <Avatar className="h-8 w-8 border border-border">
                                    <AvatarImage src={comment.user_avatar || ""} />
                                    <AvatarFallback>
                                      {getInitials(comment.user_name || comment.user_email || "SW")}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0">
                                    <p className="text-xs text-muted-foreground truncate">
                                      {comment.user_name || comment.user_email}
                                    </p>
                                    <p className="text-sm text-foreground">{comment.content}</p>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-sm text-muted-foreground">Nessun commento ancora.</div>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Input
                              placeholder="Scrivi un commento..."
                              value={commentTextByPost[post.id] || ""}
                              onChange={(e) =>
                                setCommentTextByPost((prev) => ({
                                  ...prev,
                                  [post.id]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  submitComment(post.id)
                                }
                              }}
                              className="bg-background/70"
                            />
                            <Button
                              variant="neon"
                              onClick={() => submitComment(post.id)}
                              disabled={addComment.isPending}
                            >
                              Invia
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
              </div>
            </motion.div>
          )
        })}
      </div>
      {feedItems.length > feedPageSize && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-border/60 bg-card/50 px-3 py-2">
          <p className="text-xs text-muted-foreground">Pagina {feedPage} di {feedTotalPages}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline-neon"
              onClick={() => setFeedPage((prev) => Math.max(1, prev - 1))}
              disabled={feedPage === 1}
            >
              Indietro
            </Button>
            <Button
              size="sm"
              variant="outline-neon"
              onClick={() => setFeedPage((prev) => Math.min(feedTotalPages, prev + 1))}
              disabled={feedPage === feedTotalPages}
            >
              Avanti
            </Button>
          </div>
        </div>
      )}
      </>
    )
  }

  const renderClubs = (variant: "sidebar" | "grid") => {
    const wrapperClass =
      variant === "sidebar"
        ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-1"
        : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-display font-bold text-foreground truncate">Club</h2>
            <p className="text-muted-foreground text-sm">Trova squadre o crea il tuo club</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={clubScope === "all" ? "neon" : "outline-neon"}
              size="sm"
              onClick={() => setClubScope("all")}
            >
              Esplora
            </Button>
            <Button
              variant={clubScope === "mine" ? "neon" : "outline-neon"}
              size="sm"
              onClick={() => setClubScope("mine")}
            >
              I miei
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            placeholder="Cerca club..."
            value={clubSearch}
            onChange={(e) => setClubSearch(e.target.value)}
            className="bg-background/60"
          />
          <div className="shrink-0">{createClubDialog}</div>
        </div>

        <div className={wrapperClass}>
          {clubsQuery.isLoading ? (
            <div className="surface-panel p-6 text-muted-foreground">Caricamento club...</div>
          ) : clubs.length === 0 ? (
            <div className="surface-panel p-6 text-muted-foreground">Nessun club trovato.</div>
          ) : (
            pagedClubs.map((club: any) => (
              <div key={club.id} className="surface-panel overflow-hidden">
                <div className="relative h-32">
                  <img
                    src={club.cover_image_url || "/images/pool-lanes.jpg"}
                    alt={club.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/85 to-transparent" />
                  <Badge className="absolute left-3 top-3 bg-background/70 text-foreground border border-border/80">
                    {club.visibility === "invite"
                      ? "Privato"
                      : club.visibility === "private"
                      ? "Segreto"
                      : "Pubblico"}
                  </Badge>
                  {club.is_member ? (
                    <Badge className="absolute right-3 top-3 bg-primary/20 text-primary border border-primary/35">
                      Membro
                    </Badge>
                  ) : club.member_status === "pending" ? (
                    <Badge className="absolute right-3 top-3 bg-accent/20 text-accent border border-accent/35">
                      In attesa
                    </Badge>
                  ) : null}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{club.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {club.description || "Allenati insieme, condividi progressi e obiettivi."}
                      </p>
                    </div>
                    <Button variant="outline-neon" size="icon-sm" asChild>
                      <Link href={`/community/club/${club.id}`}>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      {club.member_count} membri
                    </span>
                    <Button variant="neon" size="sm" asChild>
                      <Link href={`/community/club/${club.id}`}>Apri</Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {clubs.length > clubsPageSize && (
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/50 px-3 py-2">
            <p className="text-xs text-muted-foreground">Pagina {clubsPage} di {clubsTotalPages}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline-neon"
                onClick={() => setClubsPage((prev) => Math.max(1, prev - 1))}
                disabled={clubsPage === 1}
              >
                Indietro
              </Button>
              <Button
                size="sm"
                variant="outline-neon"
                onClick={() => setClubsPage((prev) => Math.min(clubsTotalPages, prev + 1))}
                disabled={clubsPage === clubsTotalPages}
              >
                Avanti
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <AppLayout>
      <div className="compact-shell space-y-4 lg:space-y-2 lg:h-full lg:overflow-hidden">
        <section className="surface-panel relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(70%_80%_at_18%_0%,color-mix(in_oklch,var(--electric-cyan)_34%,transparent)_0%,transparent_70%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(60%_70%_at_85%_10%,color-mix(in_oklch,var(--electric-lime)_24%,transparent)_0%,transparent_66%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(60%_70%_at_60%_90%,color-mix(in_oklch,var(--electric-cyan)_16%,transparent)_0%,transparent_72%)]" />
          </div>
          <div className="relative p-6">
            <div className="flex flex-col gap-5">
              <div>
                <div className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-background/60 px-3 py-1 text-xs text-muted-foreground">
                  <Sparkles className="size-4 text-primary" />
                  Social Hub
                </div>
                <h1 className="mt-3 text-3xl font-display font-bold neon-gradient-text">Community</h1>
                <p className="mt-1 text-muted-foreground">
                  Passa tra Feed e Club con un click, mantenendo la vista pulita e focalizzata.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {communityOrbs.map((item) => (
                  <MetricOrb
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    progress={item.progress}
                    helper={item.helper}
                    icon={item.icon}
                    tone={item.tone}
                    size="sm"
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                {createClubDialog}
                <Button variant="outline-neon" asChild>
                  <Link href="/leaderboard">Leaderboard</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Mobile: tabs */}
        <div className="lg:hidden">
          <Tabs defaultValue="feed" className="space-y-6">
            <TabsList className="w-full">
              <TabsTrigger value="feed" className="flex items-center gap-2">
                Feed
              </TabsTrigger>
              <TabsTrigger value="clubs" className="flex items-center gap-2">
                Club
              </TabsTrigger>
            </TabsList>
            <TabsContent value="feed" className="space-y-4">
              {renderFeed()}
            </TabsContent>
            <TabsContent value="clubs" className="space-y-4">
              {renderClubs("grid")}
            </TabsContent>
          </Tabs>
        </div>

        {/* Desktop: stream layout */}
        <div className="hidden lg:block">
          <div className="stream-shell lg:h-full lg:gap-2">
            <section className="stream-main lg:gap-2">
              <div className="stream-node">
                <div className="surface-panel p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-display font-bold text-foreground">
                        {desktopSection === "feed" ? "Feed" : "Club"}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {desktopSection === "feed"
                          ? "Allenamenti pubblici e aggiornamenti"
                          : "Scopri club, membri e accessi rapidi"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {desktopSection === "feed" ? `${feedItems.length} post` : `${clubs.length} club`}
                      </Badge>
                      {desktopSection === "feed" ? (
                        <Button
                          variant="outline-neon"
                          size="sm"
                          onClick={() => setDesktopSection("clubs")}
                        >
                          Vai a Club
                        </Button>
                      ) : (
                        <Button
                          variant="outline-neon"
                          size="sm"
                          onClick={() => setDesktopSection("feed")}
                        >
                          Vai al Feed
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {desktopSection === "feed" ? renderFeed() : renderClubs("grid")}
            </section>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
