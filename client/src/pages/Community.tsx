"use client"

import AppLayout from "@/components/AppLayout"
import { useId, useMemo, useRef, useState } from "react"
import { usePaged } from "@/hooks/usePaged"
import { Link } from "wouter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Chip } from "@/components/corsia/Chip"
import { Pager } from "@/components/corsia/Pager"
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
import { Plus, Search, UserCheck, UserPlus } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"

const sectionTitle = "text-[17px] font-bold"

const visibilityLabel = (visibility?: string) =>
  visibility === "invite" ? "Privato" : visibility === "private" ? "Segreto" : "Pubblico"

export default function Community() {
  const clubsTitleId = useId()
  const peopleTitleId = useId()
  const fieldId = useId()
  const [clubScope, setClubScope] = useState<"all" | "mine">("all")
  const [clubSearch, setClubSearch] = useState("")
  const [userSearch, setUserSearch] = useState("")
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

  const clubs = (clubsQuery.data as any[] | undefined) ?? []
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
  const clubsListRef = useRef<HTMLUListElement>(null)
  const {
    page: clubsPage,
    setPage: setClubsPage,
    totalPages: clubsTotalPages,
    pageItems: pagedClubs,
  } = usePaged(clubs, 6, [clubScope, clubSearch])

  const createClubDialog = (
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogTrigger asChild>
        <Button className="shrink-0">
          <Plus className="size-4" aria-hidden />
          Crea club
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crea il tuo club</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-name`}>Nome club</Label>
            <Input
              id={`${fieldId}-name`}
              value={createDraft.name}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Es. SwimForge Milano"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-description`}>Descrizione</Label>
            <Textarea
              id={`${fieldId}-description`}
              value={createDraft.description}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="Scrivi due righe per presentare il club"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-visibility`}>Visibilità</Label>
            <Select
              value={createDraft.visibility}
              onValueChange={(value) =>
                setCreateDraft((prev) => ({ ...prev, visibility: value }))
              }
            >
              <SelectTrigger id={`${fieldId}-visibility`}>
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
            <Label htmlFor={`${fieldId}-cover`}>Copertina (opzionale)</Label>
            <Input
              id={`${fieldId}-cover`}
              value={createDraft.coverImageUrl}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, coverImageUrl: event.target.value }))
              }
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-website`}>Sito web (opzionale)</Label>
            <Input
              id={`${fieldId}-website`}
              value={createDraft.websiteUrl}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, websiteUrl: event.target.value }))
              }
              placeholder="https://..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Annulla
            </Button>
            <Button
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
              {createClub.isPending ? "Creazione..." : "Crea club"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )

  return (
    <AppLayout>
      <div className="space-y-6">
        <section aria-labelledby={clubsTitleId} className="space-y-3">
          {/* The «Club» sub-tab already names this section: the heading is for screen readers. */}
          <h2 id={clubsTitleId} className="sr-only">
            Club
          </h2>
          <div className="flex items-center justify-between gap-3">
            <Tabs
              value={clubScope}
              onValueChange={(value) => setClubScope(value as "all" | "mine")}
              className="min-w-0"
            >
              <TabsList aria-label="Quali club" className="w-fit">
                <TabsTrigger value="all">Esplora</TabsTrigger>
                <TabsTrigger value="mine">I miei</TabsTrigger>
              </TabsList>
            </Tabs>
            {createClubDialog}
          </div>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              aria-label="Cerca club"
              placeholder="Cerca club..."
              value={clubSearch}
              onChange={(e) => setClubSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {clubsQuery.isLoading ? (
            <p role="status" className="surface-panel p-4 text-sm text-muted-foreground">
              Caricamento club...
            </p>
          ) : clubs.length === 0 ? (
            <p className="surface-panel p-4 text-sm text-muted-foreground">Nessun club trovato.</p>
          ) : (
            <ul ref={clubsListRef} className="grid scroll-mt-20 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pagedClubs.map((club: any) => {
                const thumbnail = (club.logo_url || club.logoUrl || club.cover_image_url || undefined) as
                  | string
                  | undefined
                const memberCount = Number(club.member_count ?? 0)
                return (
                  <li key={club.id} className="surface-panel flex flex-col p-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="size-12 rounded-xl">
                        <AvatarImage src={thumbnail} alt="" className="object-cover" />
                        <AvatarFallback className="rounded-xl bg-raised text-sm font-semibold">
                          {String(club.name || "C").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-bold text-foreground">{club.name}</h3>
                        <p className="text-sm text-muted-foreground tabular-nums">
                          {memberCount === 1 ? "1 membro" : `${memberCount} membri`} ·{" "}
                          {visibilityLabel(club.visibility)}
                        </p>
                      </div>
                      {club.is_member ? (
                        <Chip tone="action">Membro</Chip>
                      ) : club.member_status === "pending" ? (
                        <Chip>In attesa</Chip>
                      ) : null}
                    </div>
                    <p className="mt-3 line-clamp-2 flex-1 text-sm text-muted-foreground">
                      {club.description || "Allenati insieme, condividi progressi e obiettivi."}
                    </p>
                    <Button variant="outline" size="sm" className="mt-3 self-start" asChild>
                      <Link href={`/community/club/${club.id}`} aria-label={`Apri ${club.name}`}>
                        Apri
                      </Link>
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
          <Pager
            page={clubsPage}
            totalPages={clubsTotalPages}
            onChange={setClubsPage}
            listRef={clubsListRef}
            label="Pagine dei club"
          />
        </section>

        <section aria-labelledby={peopleTitleId} className="surface-panel p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id={peopleTitleId} className={sectionTitle}>
              Trova nuotatori
            </h2>
            <span className="text-sm text-muted-foreground">
              {discoverMode ? "Risultati" : "Suggeriti"}
            </span>
          </div>

          <div className="relative mt-3">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              aria-label="Cerca persone"
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder="Nome, username o email"
              className="pl-9"
            />
          </div>

          {isDiscoverLoading ? (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              Caricamento nuotatori...
            </p>
          ) : discoverUsers.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {discoverMode ? "Nessun utente trovato." : "Nessun suggerimento disponibile al momento."}
            </p>
          ) : (
            <ul className="mt-2">
              {discoverUsers.slice(0, 8).map((user: any) => {
                const displayName = user.username || user.name || `Utente #${user.userId}`
                const subtitleParts = [
                  user.username ? `@${user.username}` : null,
                  user.level != null ? `Livello ${user.level}` : null,
                ].filter(Boolean)
                const isFollowing = Boolean(user.isFollowing)
                const isPending = pendingFollowUserId === user.userId

                return (
                  <li
                    key={user.userId}
                    className="flex items-center gap-3 border-t border-border py-3 first:border-t-0 last:pb-0"
                  >
                    <Link href={`/u/${user.userId}`} tabIndex={-1} aria-hidden>
                      <Avatar className="size-10">
                        <AvatarImage src={user.avatarUrl || ""} alt="" />
                        <AvatarFallback className="bg-raised text-xs font-semibold">
                          {getInitials(displayName)}
                        </AvatarFallback>
                      </Avatar>
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/u/${user.userId}`}
                        className="block truncate text-sm font-semibold text-foreground hover:underline"
                      >
                        {displayName}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {subtitleParts.length > 0 ? subtitleParts.join(" · ") : "Nuovo nuotatore"}
                      </p>
                    </div>
                    <Button
                      variant={isFollowing ? "ghost" : "outline"}
                      size="sm"
                      className="shrink-0"
                      disabled={isFollowing || isPending || followUser.isPending}
                      onClick={() => followUser.mutate({ userId: Number(user.userId) })}
                    >
                      {isFollowing ? (
                        <>
                          <UserCheck className="size-4" aria-hidden />
                          Seguito
                        </>
                      ) : (
                        <>
                          <UserPlus className="size-4" aria-hidden />
                          {isPending ? "..." : "Segui"}
                        </>
                      )}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </AppLayout>
  )
}
