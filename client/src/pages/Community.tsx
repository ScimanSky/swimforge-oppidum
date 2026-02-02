"use client"

import AppLayout from "@/components/AppLayout"
import { useMemo, useState } from "react"
import { Link } from "wouter"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import {
  Droplet,
  MessageCircle,
  Users,
  Trophy,
  ChevronRight,
  Clock,
  Plus,
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
  const [clubScope, setClubScope] = useState<"all" | "mine">("all")
  const [clubSearch, setClubSearch] = useState("")

  const profileQuery = trpc.profile.get.useQuery()
  const currentUserId = profileQuery.data?.userId

  const feedQuery = trpc.community.feed.useQuery({ limit: 20, scope: "global" })
  const clubsQuery = trpc.community.clubs.list.useQuery({
    scope: clubScope,
    search: clubSearch.trim() || undefined,
    limit: 12,
  })
  const challengesQuery = trpc.challenges.list.useQuery()

  const toggleSplash = trpc.community.toggleSplash.useMutation({
    onSuccess: () => feedQuery.refetch(),
    onError: (err) => toast.error(err.message || "Impossibile inviare uno Splash"),
  })

  const commentsQuery = trpc.community.comments.useQuery(
    { postId: openCommentsId ?? 0 },
    { enabled: !!openCommentsId }
  )

  const addComment = trpc.community.addComment.useMutation({
    onSuccess: (_data, variables) => {
      setCommentTextByPost((prev) => ({ ...prev, [variables.postId]: "" }))
      commentsQuery.refetch()
      feedQuery.refetch()
    },
    onError: (err) => toast.error(err.message || "Impossibile inviare il commento"),
  })

  const feedItems = useMemo(() => (feedQuery.data as any[]) || [], [feedQuery.data])
  const clubs = useMemo(() => (clubsQuery.data as any[]) || [], [clubsQuery.data])
  const challenges = useMemo(() => (challengesQuery.data as any[]) || [], [challengesQuery.data])

  const submitComment = (postId: number) => {
    const content = (commentTextByPost[postId] ?? "").trim()
    if (!content) return
    addComment.mutate({ postId, content })
  }

  return (
    <AppLayout>
      <div className="p-4 lg:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">
              Club
            </h1>
            <p className="text-muted-foreground mt-1">
              Connettiti con altri nuotatori e condividi le tue sessioni
            </p>
          </div>
        </div>

        <Tabs defaultValue="feed" className="space-y-6">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="feed">Feed</TabsTrigger>
            <TabsTrigger value="clubs">Club</TabsTrigger>
            <TabsTrigger value="challenges">Challenges</TabsTrigger>
          </TabsList>

          {/* Feed Tab */}
          <TabsContent value="feed" className="space-y-4">
            {feedQuery.isLoading ? (
              <Card className="bg-card border-border">
                <CardContent className="p-6 text-muted-foreground">
                  Caricamento feed...
                </CardContent>
              </Card>
            ) : feedItems.length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="p-6 text-center text-muted-foreground">
                  Nessun contenuto nel feed. Condividi la tua prossima sessione!
                </CardContent>
              </Card>
            ) : (
              feedItems.map((post) => {
                const name = post.user_name || post.user_email?.split("@")[0] || "Nuotatore"
                const initials = getInitials(name)
                const distance = formatDistance(post.activity_distance_meters)
                const duration = formatDuration(post.activity_duration_seconds)
                const pace = formatPace(post.activity_distance_meters, post.activity_duration_seconds)
                const activityType = post.activity_is_open_water ? "Open Water" : "Pool"
                const isOwner = currentUserId && post.user_id === currentUserId

                return (
                  <Card key={post.id} className="bg-card border-border">
                    <CardContent className="p-4">
                      {/* Post Header */}
                      <div className="flex items-start gap-3 mb-4">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={post.user_avatar || "/placeholder.svg"} alt={name} />
                          <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{name}</span>
                            {post.activity_source && (
                              <Badge variant="secondary" className="text-xs">
                                {post.activity_source}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatTimeAgo(post.created_at)}
                          </p>
                        </div>
                      </div>

                      {/* Activity Card */}
                      <div className="p-4 rounded-xl bg-secondary/30 mb-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium text-foreground">
                            {post.content || "Sessione condivisa"}
                          </h4>
                          <Badge
                            variant="secondary"
                            className={`text-xs ${
                              activityType === "Pool"
                                ? "bg-primary/20 text-primary"
                                : "bg-accent/20 text-accent"
                            }`}
                          >
                            {activityType}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-lg font-display font-bold text-foreground">
                              {distance}
                            </p>
                            <p className="text-xs text-muted-foreground">Distanza</p>
                          </div>
                          <div>
                            <p className="text-lg font-display font-bold text-foreground">
                              {duration}
                            </p>
                            <p className="text-xs text-muted-foreground">Durata</p>
                          </div>
                          <div>
                            <p className="text-lg font-display font-bold text-foreground">
                              {pace}
                            </p>
                            <p className="text-xs text-muted-foreground">Pace</p>
                          </div>
                        </div>
                      </div>

                      {/* Post Actions */}
                      <div className="flex items-center gap-4 pt-4 border-t border-border">
                        <button
                          onClick={() => {
                            if (isOwner) {
                              toast.info("Non puoi mettere Splash al tuo allenamento.")
                              return
                            }
                            toggleSplash.mutate({ postId: post.id })
                          }}
                          className={`flex items-center gap-1.5 text-sm transition-colors ${
                            post.has_splashed
                              ? "text-primary"
                              : "text-muted-foreground hover:text-foreground"
                          } ${isOwner ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          <Droplet
                            className={`w-4 h-4 ${post.has_splashed ? "fill-primary" : ""}`}
                          />
                          <span>{post.splash_count} Splash</span>
                        </button>

                        <button
                          onClick={() => setOpenCommentsId(openCommentsId === post.id ? null : post.id)}
                          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>{post.comment_count} Commenti</span>
                        </button>
                      </div>

                      {openCommentsId === post.id && (
                        <div className="mt-4 rounded-xl border border-border bg-background/60 p-4 space-y-3">
                          <div className="max-h-60 overflow-y-auto space-y-3">
                            {commentsQuery.isLoading && openCommentsId === post.id ? (
                              <div className="text-sm text-muted-foreground">Caricamento...</div>
                            ) : (commentsQuery.data ?? []).length > 0 ? (
                              (commentsQuery.data ?? []).map((comment: any) => (
                                <div key={comment.id} className="flex items-start gap-2">
                                  <Avatar className="h-8 w-8">
                                    <AvatarImage src={comment.user_avatar || "/placeholder.svg"} />
                                    <AvatarFallback>
                                      {getInitials(comment.user_name || comment.user_email || "SW")}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <p className="text-xs text-muted-foreground">
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
                          <div className="flex gap-2">
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
                            />
                            <Button
                              onClick={() => submitComment(post.id)}
                              disabled={addComment.isPending}
                            >
                              Invia
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })
            )}
          </TabsContent>

          {/* Clubs Tab */}
          <TabsContent value="clubs" className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-display font-bold text-foreground">
                  Club
                </h2>
                <p className="text-muted-foreground text-sm">Trova squadre o crea il tuo club</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={clubScope === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setClubScope("all")}
                >
                  Esplora
                </Button>
                <Button
                  variant={clubScope === "mine" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setClubScope("mine")}
                >
                  I miei
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Input
                placeholder="Cerca club..."
                value={clubSearch}
                onChange={(e) => setClubSearch(e.target.value)}
                className="max-w-sm bg-secondary/50 border-transparent"
              />
              <Button variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Crea Club
              </Button>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {clubsQuery.isLoading ? (
                <Card className="bg-card border-border">
                  <CardContent className="p-6 text-muted-foreground">Caricamento club...</CardContent>
                </Card>
              ) : clubs.length === 0 ? (
                <Card className="bg-card border-border">
                  <CardContent className="p-6 text-muted-foreground">Nessun club trovato.</CardContent>
                </Card>
              ) : (
                clubs.map((club: any) => (
                  <Card
                    key={club.id}
                    className="bg-card border-border overflow-hidden group hover:border-primary/50 transition-all"
                  >
                    <div className="relative h-32">
                      <img
                        src={club.cover_image_url || "/placeholder.svg"}
                        alt={club.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
                      <Badge className="absolute top-3 left-3 bg-secondary/80 text-secondary-foreground">
                        {club.visibility === "invite" ? "Su invito" : club.visibility === "private" ? "Privato" : "Pubblico"}
                      </Badge>
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-foreground mb-2">{club.name}</h3>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Users className="w-4 h-4" />
                          <span>{club.member_count} membri</span>
                        </div>
                        <Button size="sm" asChild>
                          <Link href={`/community/club/${club.id}`}>Apri</Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Challenges Tab */}
          <TabsContent value="challenges" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-bold text-foreground">
                Sfide Attive
              </h2>
              <Button variant="outline" size="sm" asChild>
                <Link href="/challenges">
                  Vedi tutte
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {challengesQuery.isLoading ? (
                <Card className="bg-card border-border">
                  <CardContent className="p-6 text-muted-foreground">Caricamento sfide...</CardContent>
                </Card>
              ) : challenges.length === 0 ? (
                <Card className="bg-card border-border">
                  <CardContent className="p-6 text-muted-foreground">Nessuna sfida attiva.</CardContent>
                </Card>
              ) : (
                challenges.map((challenge: any) => {
                  const rules = challenge.rules || {}
                  const target = typeof rules.target === "number" ? rules.target : null
                  const current = Number(challenge.current_progress || 0)
                  const progressPercent = target ? Math.min(100, Math.round((current / target) * 100)) : null
                  const endsIn = challenge.end_date
                    ? formatTimeAgo(challenge.end_date)
                    : "—"

                  return (
                    <Card key={challenge.id} className="bg-card border-border">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="w-12 h-12 rounded-xl bg-chart-4/10 flex items-center justify-center">
                            <Trophy className="w-6 h-6 text-chart-4" />
                          </div>
                          {challenge.prize_description && (
                            <Badge variant="outline" className="text-xs">
                              {challenge.prize_description}
                            </Badge>
                          )}
                        </div>

                        <h3 className="text-lg font-semibold text-foreground mb-1">
                          {challenge.name}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          {challenge.description || "Sfida attiva"}
                        </p>

                        <div className="mb-4">
                          <div className="flex items-center justify-between text-xs mb-2">
                            <span className="text-muted-foreground">Progresso</span>
                            <span className="text-foreground font-medium">
                              {progressPercent !== null ? `${progressPercent}%` : "—"}
                            </span>
                          </div>
                          <div className="h-2 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${progressPercent ?? 0}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Users className="w-4 h-4" />
                            <span>{challenge.participantCount ?? 0} partecipanti</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="w-4 h-4" />
                            <span>{endsIn}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  )
}
