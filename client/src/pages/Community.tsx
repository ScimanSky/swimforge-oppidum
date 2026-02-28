"use client"

import AppLayout from "@/components/AppLayout"
import { useEffect, useMemo, useState } from "react"
import { Link } from "wouter"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getInitials } from "@/lib/format"
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
  Users,
  Plus,
  Sparkles,
  ChevronRight,
  Search,
  UserCheck,
  UserPlus,
} from "lucide-react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"

export default function Community() {
  const [clubScope, setClubScope] = useState<"all" | "mine">("all")
  const [clubSearch, setClubSearch] = useState("")
  const [userSearch, setUserSearch] = useState("")
  const [clubsPage, setClubsPage] = useState(1)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [pendingFollowUserId, setPendingFollowUserId] = useState<number | null>(null)
  const [createDraft, setCreateDraft] = useState({
    name: "",
    description: "",
    visibility: "public",
    coverImageUrl: "",
    websiteUrl: "",
  })

  const clubsQuery = trpc.community.clubs.list.useQuery({
    scope: clubScope,
    search: clubSearch.trim() || undefined,
    limit: 100,
  })
  const utils = trpc.useUtils()
  const normalizedUserSearch = userSearch.trim()
  const discoverMode = normalizedUserSearch.length > 0
  const suggestedUsersQuery = trpc.community.users.suggested.useQuery(
    { limit: 10 },
    { staleTime: 60_000 }
  )
  const userSearchQuery = trpc.community.users.search.useQuery(
    { query: normalizedUserSearch, limit: 20 },
    { enabled: discoverMode, staleTime: 30_000 }
  )

  const createClub = trpc.community.clubs.create.useMutation({
    onSuccess: (data) => {
      toast.success("Club creato!")
      setIsCreateOpen(false)
      setCreateDraft({ name: "", description: "", visibility: "public", coverImageUrl: "", websiteUrl: "" })
      setClubScope("mine")
      clubsQuery.refetch()
      if (data?.clubId) {
        toast.info("Apri il club dalla lista per gestirlo.")
      }
    },
    onError: (err) => toast.error(err.message || "Impossibile creare il club"),
  })

  const followUser = trpc.community.users.toggleFollow.useMutation({
    onMutate: ({ userId }) => {
      setPendingFollowUserId(userId)
    },
    onSuccess: (result) => {
      if (result.following) {
        toast.success("Profilo seguito")
      } else {
        toast.info("Follow rimosso")
      }
      void Promise.all([
        utils.community.users.suggested.invalidate(),
        utils.community.users.search.invalidate(),
        utils.community.users.followStarter.invalidate(),
        utils.community.feed.invalidate(),
      ])
    },
    onError: (error) => {
      toast.error(error.message || "Impossibile seguire questo profilo.")
    },
    onSettled: () => {
      setPendingFollowUserId(null)
    },
  })

  const clubs = useMemo(() => (clubsQuery.data as any[]) || [], [clubsQuery.data])
  const discoverUsers = useMemo(() => {
    const rows = discoverMode
      ? ((userSearchQuery.data as any[] | undefined) ?? [])
      : ((suggestedUsersQuery.data as any[] | undefined) ?? []);
    const seen = new Set<number>();
    return rows.filter((row) => {
      const id = Number(row?.userId ?? 0);
      if (!Number.isFinite(id) || id <= 0 || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [discoverMode, suggestedUsersQuery.data, userSearchQuery.data])
  const isDiscoverLoading = discoverMode ? userSearchQuery.isLoading : suggestedUsersQuery.isLoading
  const clubsPageSize = 6
  const clubsTotalPages = Math.max(1, Math.ceil(clubs.length / clubsPageSize))
  const pagedClubs = useMemo(() => {
    const start = (clubsPage - 1) * clubsPageSize
    return clubs.slice(start, start + clubsPageSize)
  }, [clubs, clubsPage])

  useEffect(() => {
    setClubsPage(1)
  }, [clubScope, clubSearch, clubs.length])

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
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Sito web (opzionale)</p>
            <Input
              value={createDraft.websiteUrl}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, websiteUrl: event.target.value }))
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
                  websiteUrl: createDraft.websiteUrl.trim() || undefined,
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

  return (
    <AppLayout>
      <div className="compact-shell space-y-4 lg:space-y-2">
        <section className="surface-panel relative w-full overflow-hidden">
          <div className="absolute inset-0">
            <div className="h-full w-full bg-[linear-gradient(132deg,#101820_0%,#15232d_45%,#0f171f_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(70%_80%_at_18%_0%,color-mix(in_oklch,var(--electric-cyan)_34%,transparent)_0%,transparent_70%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(60%_70%_at_85%_10%,color-mix(in_oklch,var(--electric-lime)_24%,transparent)_0%,transparent_66%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(60%_70%_at_60%_90%,color-mix(in_oklch,var(--electric-cyan)_16%,transparent)_0%,transparent_72%)]" />
          </div>
          <div className="relative p-2.5 sm:p-3">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-background/60 px-3 py-1 text-xs text-muted-foreground">
                    <Sparkles className="size-4 text-primary" />
                    Club Hub
                  </div>
                  <h1 className="mt-1 text-xl font-display font-bold neon-gradient-text sm:text-2xl">Club</h1>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {createClubDialog}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
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
                <Input
                  placeholder="Cerca club..."
                  value={clubSearch}
                  onChange={(e) => setClubSearch(e.target.value)}
                  className="h-9 bg-background/60"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="surface-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-display font-semibold text-foreground">Trova nuotatori</h2>
              <p className="text-xs text-muted-foreground">
                Cerca per nome, username o email e aggiungi amici al volo.
              </p>
            </div>
            <Badge className="border-border/70 bg-background/70 text-foreground">
              {discoverMode ? "Ricerca persone" : "Suggeriti"}
            </Badge>
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder="Cerca persone..."
              className="h-10 bg-background/60 pl-9"
            />
          </div>

          <div className="mt-3 space-y-2">
            {isDiscoverLoading ? (
              <p className="text-sm text-muted-foreground">Caricamento nuotatori...</p>
            ) : discoverUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {discoverMode ? "Nessun utente trovato." : "Nessun suggerimento disponibile al momento."}
              </p>
            ) : (
              discoverUsers.slice(0, 8).map((user: any) => {
                const displayName = user.username || user.name || `Utente #${user.userId}`
                const subtitleParts = [
                  user.username ? `@${user.username}` : null,
                  user.level != null ? `Livello ${user.level}` : null,
                ].filter(Boolean)
                const isFollowing = Boolean(user.isFollowing)
                const isPending = pendingFollowUserId === user.userId

                return (
                  <div
                    key={user.userId}
                    className="flex items-center gap-3 rounded-xl border border-border/55 bg-background/35 p-2.5"
                  >
                    <Link href={`/u/${user.userId}`}>
                      <Avatar className="size-10 cursor-pointer border border-border/60">
                        <AvatarImage src={user.avatarUrl || ""} alt={displayName} />
                        <AvatarFallback className="text-xs font-semibold">
                          {getInitials(displayName)}
                        </AvatarFallback>
                      </Avatar>
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href={`/u/${user.userId}`} className="block truncate text-sm font-semibold text-foreground hover:underline">
                        {displayName}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {subtitleParts.length > 0 ? subtitleParts.join(" · ") : "Nuovo nuotatore"}
                      </p>
                    </div>
                    <Button
                      variant={isFollowing ? "ghost-neon" : "outline-neon"}
                      size="sm"
                      className="shrink-0 gap-1"
                      disabled={isFollowing || isPending || followUser.isPending}
                      onClick={() => followUser.mutate({ userId: Number(user.userId) })}
                    >
                      {isFollowing ? (
                        <>
                          <UserCheck className="size-3.5" />
                          Seguito
                        </>
                      ) : (
                        <>
                          <UserPlus className="size-3.5" />
                          {isPending ? "..." : "Segui"}
                        </>
                      )}
                    </Button>
                  </div>
                )
              })
            )}
          </div>
        </section>

        {/* Clubs Section */}
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clubsQuery.isLoading ? (
              <div className="surface-panel p-6 text-muted-foreground">Caricamento club...</div>
            ) : clubs.length === 0 ? (
              <div className="surface-panel p-6 text-muted-foreground">Nessun club trovato.</div>
            ) : (
              pagedClubs.map((club: any) => (
                <div key={club.id} className="surface-panel overflow-hidden">
                  <div className="relative h-32">
                    {club.cover_image_url ? (
                      <img
                        src={club.cover_image_url}
                        alt={club.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full w-full bg-[linear-gradient(132deg,#163047_0%,#1f3f5c_50%,#11283b_100%)]" />
                    )}
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
                    <Avatar className="absolute -bottom-5 left-3 h-10 w-10 border-2 border-background shadow-md">
                      <AvatarImage src={(club.logo_url || club.logoUrl || undefined) as string | undefined} alt={club.name} />
                      <AvatarFallback className="text-xs font-semibold">
                        {String(club.name || "C").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="p-4 pt-7">
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
      </div>
    </AppLayout>
  )
}
