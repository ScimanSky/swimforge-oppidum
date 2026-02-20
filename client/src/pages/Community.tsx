"use client"

import AppLayout from "@/components/AppLayout"
import { useEffect, useMemo, useState } from "react"
import { Link } from "wouter"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
} from "lucide-react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"

export default function Community() {
  const [clubScope, setClubScope] = useState<"all" | "mine">("all")
  const [clubSearch, setClubSearch] = useState("")
  const [clubsPage, setClubsPage] = useState(1)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
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

  const clubs = useMemo(() => (clubsQuery.data as any[]) || [], [clubsQuery.data])
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
        <section className="surface-panel relative mx-auto max-w-4xl overflow-hidden">
          <div className="absolute inset-0">
            <img
              src="/images/theme-v3/community-bg.png"
              alt=""
              className="h-full w-full object-cover opacity-[0.34]"
              loading="lazy"
            />
            <img
              src="/images/theme-v3/overlay-caustics.png"
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-[0.18] mix-blend-screen"
              loading="lazy"
            />
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
                  <Button variant="outline-neon" asChild>
                    <Link href="/home">Torna al Feed</Link>
                  </Button>
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
                    <img
                      src={club.cover_image_url || "/images/theme-v3/club-hero-bg.png"}
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
      </div>
    </AppLayout>
  )
}
