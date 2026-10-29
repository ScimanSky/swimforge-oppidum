"use client"

import { assetUrl } from "@/lib/asset-base";
import AppLayout from "@/components/AppLayout"
import { useId, useMemo, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Chip } from "@/components/corsia/Chip"
import { LoadError, LoadingSkeleton } from "@/components/corsia/LoadState"
import { Metric } from "@/components/corsia/Metric"
import { Pager } from "@/components/corsia/Pager"
import { RankRow } from "@/components/corsia/RankRow"
import { Clock, Gift, Plus, Target, Users } from "lucide-react"
import { Link } from "wouter"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { usePaged } from "@/hooks/usePaged"
import {
  CHALLENGE_DURATION_LABELS,
  CHALLENGE_OBJECTIVE_LABELS,
  CHALLENGE_TYPE_LABELS,
  challengeObjectiveLabel,
  challengeProgressParts,
  challengeProgressPercent,
  dayStreak,
} from "@/lib/challenges"
import { formatDistance, formatInteger, toFiniteNumber } from "@/lib/format"
import { rankEntries } from "@/lib/ranking"

const formatDaysLeft = (endDate: string | Date) => {
  const end = new Date(endDate)
  const diff = Math.ceil((end.getTime() - Date.now()) / 86400000)
  if (!Number.isFinite(diff)) return null
  if (diff <= 0) return "Scaduta"
  return diff === 1 ? "Manca 1 giorno" : `Mancano ${diff} giorni`
}

const participantsLabel = (count: number) =>
  count === 1 ? "1 partecipante" : `${formatInteger(count)} partecipanti`

/** Icon + text line of a challenge card. */
function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <span className="shrink-0 text-muted-foreground [&_svg]:size-4" aria-hidden>
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </li>
  )
}

function EmptyCard({ children }: { children: ReactNode }) {
  return <p className="surface-panel p-4 text-sm text-muted-foreground">{children}</p>
}

const getClassicChallengeImage = (challenge: any): string => {
  const badgeImageUrl =
    typeof challenge?.badge_image_url === "string" && challenge.badge_image_url.trim().length > 0
      ? challenge.badge_image_url.trim()
      : null
  if (badgeImageUrl) return badgeImageUrl

  if (challenge?.type === "open_water") return "/images/open-water.jpg"

  switch (challenge?.objective) {
    case "consistency":
      return "/images/swimmers_team_community.webp"
    case "avg_pace":
      return "/images/expert_swimmer_advanced.webp"
    case "total_time":
      return "/images/hero-swimmer.jpg"
    case "longest_session":
      return "/images/monthly_challenge_target.webp"
    case "total_sessions":
      return "/images/swimmer_action_hero.webp"
    case "total_distance":
    default:
      return "/images/pool-lanes.jpg"
  }
}

type ChallengeType = "open_water" | "pool" | "both"
type ChallengeObjective =
  | "total_sessions"
  | "consistency"
  | "total_distance"
  | "avg_pace"
  | "total_time"
  | "longest_session"
type ChallengeDuration = "3_days" | "1_week" | "2_weeks" | "1_month"

type ChallengeCreateDraft = {
  name: string
  description: string
  type: ChallengeType
  objective: ChallengeObjective
  duration: ChallengeDuration
  startDate: string
}

export default function Challenges() {
  const fieldId = useId()
  const [activeTab, setActiveTab] = useState("active")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  // «Abbandona» asks first; focus goes back to the button that asked.
  const [leaveTarget, setLeaveTarget] = useState<{ id: number; name: string } | null>(null)
  const leaveOpenerRef = useRef<HTMLButtonElement | null>(null)
  const isDesktopWide = useMediaQuery("(min-width: 1280px)", false)
  const activeListRef = useRef<HTMLUListElement>(null)
  const availableListRef = useRef<HTMLUListElement>(null)
  const leaderboardListRef = useRef<HTMLOListElement>(null)
  const [createDraft, setCreateDraft] = useState<ChallengeCreateDraft>({
    name: "",
    description: "",
    type: "pool",
    objective: "total_distance",
    duration: "1_week",
    startDate: new Date().toISOString().split("T")[0],
  })

  const profileQuery = trpc.profile.get.useQuery()
  const activitiesQuery = trpc.activities.list.useQuery({ limit: 100, offset: 0, source: "all" })
  const badgesQuery = trpc.badges.userBadges.useQuery()
  const challengesQuery = trpc.challenges.list.useQuery()
  const createChallenge = trpc.challenges.create.useMutation({
    onSuccess: () => {
      toast.success("Sfida creata!")
      setIsCreateOpen(false)
      setCreateDraft((prev) => ({ ...prev, name: "", description: "" }))
      challengesQuery.refetch()
    },
    onError: (err) => toast.error(err.message || "Impossibile creare la sfida"),
  })
  const leaderboardQuery = trpc.leaderboard.get.useQuery(
    {
      orderBy: "totalXp",
      period: "week",
      limit: 5,
    },
    {
      staleTime: 15_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
    }
  )

  const joinChallenge = trpc.challenges.join.useMutation({
    onSuccess: () => challengesQuery.refetch(),
    onError: (err) => toast.error(err.message || "Impossibile partecipare alla sfida"),
  })
  const leaveChallenge = trpc.challenges.leave.useMutation({
    onSuccess: (result) => {
      // The server reports a failed delete as { success: false }, not as an error.
      if (result && result.success === false) toast.error("Impossibile abbandonare la sfida")
      challengesQuery.refetch()
    },
    onError: (err) => toast.error(err.message || "Impossibile abbandonare la sfida"),
  })
  const isJoining = (id: number) =>
    joinChallenge.isPending && joinChallenge.variables?.challengeId === id
  const isLeaving = (id: number) =>
    leaveChallenge.isPending && leaveChallenge.variables?.challengeId === id

  const challenges = (challengesQuery.data ?? []) as any[]
  const activeChallenges = challenges.filter(
    (challenge) => challenge.status === "active" && challenge.isParticipant
  )
  const pendingChallenges = challenges.filter(
    (challenge) => challenge.status === "pending" && challenge.isParticipant
  )
  const availableChallenges = challenges.filter(
    // Allow joining both pending (not started) and active (already running) challenges.
    (challenge) =>
      (challenge.status === "pending" || challenge.status === "active") &&
      !challenge.isParticipant
  )
  const participatingChallenges = [...activeChallenges, ...pendingChallenges]

  const leaderboard = (leaderboardQuery.data ?? []) as any[]
  // Weekly ranking, sorted by periodXp (a number, or a bigint string): ties share a position,
  // swimmers without XP this week have none and come last.
  const weeklyXp = (entry: any) => toFiniteNumber(entry.periodXp) ?? 0
  const rankedLeaderboard = rankEntries(leaderboard, weeklyXp)
  // Switching tab starts every list from its first page; leaving or joining a challenge, or
  // crossing 1280px (page sizes change), keeps each list on a page that still exists.
  const activePaging = usePaged(participatingChallenges, isDesktopWide ? 1 : 2, [activeTab])
  const availablePaging = usePaged(availableChallenges, isDesktopWide ? 2 : 3, [activeTab])
  const leaderboardPaging = usePaged(rankedLeaderboard, isDesktopWide ? 3 : 4, [activeTab])

  // Local calendar days (a swim at 00:30 is today, not yesterday in UTC).
  const streak = useMemo(() => {
    const days = (activitiesQuery.data ?? [])
      .map((activity) => new Date(activity.activityDate))
      .filter((date) => !Number.isNaN(date.getTime()))
    return dayStreak(days)
  }, [activitiesQuery.data])
  const challengesLoading = challengesQuery.isPending
  const challengesFailed = !challengesQuery.data && challengesQuery.isError
  const leaderboardLoading = leaderboardQuery.isPending
  const leaderboardFailed = !leaderboardQuery.data && leaderboardQuery.isError

  const myUserId = profileQuery.data?.userId
  const participatingCount = activeChallenges.length + pendingChallenges.length
  // A metric without data is not shown.
  const summaryMetrics = [
    challengesQuery.data
      ? { label: "Le tue sfide", value: formatInteger(participatingCount) }
      : null,
    badgesQuery.data ? { label: "Badge", value: formatInteger(badgesQuery.data.length) } : null,
    activitiesQuery.data
      ? { label: "Giorni di fila", value: formatInteger(streak) }
      : null,
    profileQuery.data
      ? { label: "XP totali", value: formatInteger(profileQuery.data.totalXp ?? 0), unit: "XP", tone: "xp" as const }
      : null,
  ].filter((metric) => metric !== null)

  const createDialog = (
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogTrigger asChild>
        <Button className="shrink-0">
          <Plus className="size-4" aria-hidden />
          Crea sfida
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crea sfida</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-name`}>Nome sfida</Label>
            <Input
              id={`${fieldId}-name`}
              value={createDraft.name}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Es. Settimana sprint"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-description`}>Descrizione</Label>
            <Textarea
              id={`${fieldId}-description`}
              className="min-h-[90px]"
              value={createDraft.description}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="Descrivi l'obiettivo della sfida"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-type`}>Tipo</Label>
              <Select
                value={createDraft.type}
                onValueChange={(value) =>
                  setCreateDraft((prev) => ({ ...prev, type: value as ChallengeType }))
                }
              >
                <SelectTrigger id={`${fieldId}-type`}>
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pool">{CHALLENGE_TYPE_LABELS.pool}</SelectItem>
                  <SelectItem value="open_water">{CHALLENGE_TYPE_LABELS.open_water}</SelectItem>
                  <SelectItem value="both">{CHALLENGE_TYPE_LABELS.both}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-objective`}>Obiettivo</Label>
              <Select
                value={createDraft.objective}
                onValueChange={(value) =>
                  setCreateDraft((prev) => ({ ...prev, objective: value as ChallengeObjective }))
                }
              >
                <SelectTrigger id={`${fieldId}-objective`}>
                  <SelectValue placeholder="Obiettivo" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CHALLENGE_OBJECTIVE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-duration`}>Durata</Label>
              <Select
                value={createDraft.duration}
                onValueChange={(value) =>
                  setCreateDraft((prev) => ({ ...prev, duration: value as ChallengeDuration }))
                }
              >
                <SelectTrigger id={`${fieldId}-duration`}>
                  <SelectValue placeholder="Durata" />
                </SelectTrigger>
                <SelectContent>
                  {(["1_week", "2_weeks", "1_month"] as const).map((value) => (
                    <SelectItem key={value} value={value}>
                      {CHALLENGE_DURATION_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-start`}>Data inizio</Label>
              <Input
                id={`${fieldId}-start`}
                type="date"
                value={createDraft.startDate}
                onChange={(event) =>
                  setCreateDraft((prev) => ({ ...prev, startDate: event.target.value }))
                }
              />
            </div>
          </div>
          <Button
            className="w-full"
            onClick={() => createChallenge.mutate(createDraft)}
            disabled={createChallenge.isPending || !createDraft.name.trim()}
          >
            {createChallenge.isPending ? "Creazione..." : "Crea sfida"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )

  return (
    <AppLayout>
      <div className="space-y-4">
        {summaryMetrics.length > 0 ? (
          <section aria-label="Riepilogo" className="surface-panel p-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
              {summaryMetrics.map(({ label, ...metric }) => (
                <Metric key={label} size="responsive" label={label} {...metric} />
              ))}
            </div>
          </section>
        ) : null}

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="gap-3"
        >
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList aria-label="Sfide">
              <TabsTrigger value="active">
                Attive
                {challengesQuery.data ? (
                  <span className="tabular-nums">({participatingCount})</span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="available">Disponibili</TabsTrigger>
              <TabsTrigger value="completed">Concluse</TabsTrigger>
              <TabsTrigger value="leaderboard">Classifica</TabsTrigger>
            </TabsList>
            <div className="flex justify-end">{createDialog}</div>
          </div>

          <TabsContent value="active" className="space-y-3">
            {challengesLoading ? (
              <LoadingSkeleton label="Caricamento delle sfide…" count={2} itemClassName="h-48 w-full rounded-2xl" />
            ) : challengesFailed ? (
              <LoadError onRetry={() => void challengesQuery.refetch()} />
            ) : participatingChallenges.length === 0 ? (
              <EmptyCard>Nessuna sfida attiva. Esplora le sfide disponibili.</EmptyCard>
            ) : null}
            {activePaging.pageItems.length > 0 ? (
              <ul ref={activeListRef} className="scroll-mt-20 space-y-3">
                {activePaging.pageItems.map((challenge) => {
                  const groupProgress = ((challenge.leaderboard ?? []) as Array<{ progress: number }>).map(
                    (item) => Number(item.progress) || 0
                  )
                  const progressValue = Number(challenge.current_progress ?? 0)
                  // Against the best of the group (for pace the lowest is the best).
                  const progressPercent = challengeProgressPercent(
                    challenge.objective,
                    progressValue,
                    groupProgress
                  )
                  const progress = challengeProgressParts(challenge.objective, progressValue)
                  const daysLeft = formatDaysLeft(challenge.end_date)

                  return (
                    <li key={challenge.id} className="surface-panel p-4">
                      <div className="flex items-start gap-3">
                        <img
                          src={assetUrl(getClassicChallengeImage(challenge))}
                          alt=""
                          loading="lazy"
                          className="size-12 shrink-0 rounded-xl bg-raised object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base font-bold text-foreground">{challenge.name}</h3>
                          {challenge.description ? (
                            <p className="line-clamp-2 text-sm text-muted-foreground">
                              {challenge.description}
                            </p>
                          ) : null}
                        </div>
                        <Chip tone={challenge.status === "pending" ? "neutral" : "action"}>
                          {challenge.status === "pending" ? "In arrivo" : "Attiva"}
                        </Chip>
                      </div>

                      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Fact icon={<Target />}>{challengeObjectiveLabel(challenge.objective)}</Fact>
                        <Fact icon={<Users />}>{participantsLabel(Number(challenge.participantCount ?? 0))}</Fact>
                        {daysLeft ? <Fact icon={<Clock />}>{daysLeft}</Fact> : null}
                        <Fact icon={<Gift />}>{challenge.prize_description || "Badge esclusivo"}</Fact>
                      </ul>

                      <div className="mt-4 space-y-2">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm text-muted-foreground">Il tuo progresso</span>
                          <span className="font-display text-xl font-bold leading-none tabular-nums">
                            {progress.value}
                            {progress.unit ? (
                              <>
                                {" "}
                                <span className="text-sm font-semibold text-muted-foreground">
                                  {progress.unit}
                                </span>
                              </>
                            ) : null}
                          </span>
                        </div>
                        <Progress
                          value={progressPercent}
                          className="h-2"
                          aria-label={`Progresso: ${challenge.name}`}
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/challenges/${challenge.id}`} aria-label={`Dettagli: ${challenge.name}`}>
                            Dettagli
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isLeaving(challenge.id)}
                          onClick={(event) => {
                            leaveOpenerRef.current = event.currentTarget
                            setLeaveTarget({ id: challenge.id, name: challenge.name })
                          }}
                        >
                          Abbandona
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : null}
            <Pager
              page={activePaging.page}
              totalPages={activePaging.totalPages}
              onChange={activePaging.setPage}
              listRef={activeListRef}
              label="Pagine delle sfide attive"
            />
          </TabsContent>

          <TabsContent value="available" className="space-y-3">
            {challengesLoading ? (
              <LoadingSkeleton label="Caricamento delle sfide…" count={3} itemClassName="h-28 w-full rounded-2xl" />
            ) : challengesFailed ? (
              <LoadError onRetry={() => void challengesQuery.refetch()} />
            ) : availableChallenges.length === 0 ? (
              <EmptyCard>Nessuna sfida disponibile al momento.</EmptyCard>
            ) : null}
            {availablePaging.pageItems.length > 0 ? (
              <ul ref={availableListRef} className="scroll-mt-20 space-y-3">
                {availablePaging.pageItems.map((challenge) => (
                  <li key={challenge.id} className="surface-panel p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-foreground">{challenge.name}</h3>
                        {challenge.description ? (
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {challenge.description}
                          </p>
                        ) : null}
                      </div>
                      <Chip>{challengeObjectiveLabel(challenge.objective)}</Chip>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="size-4" aria-hidden />
                        {participantsLabel(Number(challenge.participantCount ?? 0))}
                      </p>
                      <Button
                        size="sm"
                        disabled={isJoining(challenge.id)}
                        onClick={() => joinChallenge.mutate({ challengeId: challenge.id })}
                        aria-label={`Partecipa: ${challenge.name}`}
                      >
                        Partecipa
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            <Pager
              page={availablePaging.page}
              totalPages={availablePaging.totalPages}
              onChange={availablePaging.setPage}
              listRef={availableListRef}
              label="Pagine delle sfide disponibili"
            />
          </TabsContent>

          <TabsContent value="completed">
            <EmptyCard>Nessuna sfida conclusa al momento.</EmptyCard>
          </TabsContent>

          <TabsContent value="leaderboard" className="space-y-3">
            {/* The query is weekly (period "week", sorted by periodXp): so are the numbers. */}
            <h2 className="text-sm font-semibold text-muted-foreground">Questa settimana</h2>
            {leaderboardLoading ? (
              <LoadingSkeleton label="Caricamento della classifica…" />
            ) : leaderboardFailed ? (
              <LoadError onRetry={() => void leaderboardQuery.refetch()} />
            ) : leaderboard.length === 0 ? (
              <EmptyCard>Nessuna classifica disponibile.</EmptyCard>
            ) : (
              <ol ref={leaderboardListRef} aria-label="Classifica" className="scroll-mt-20 space-y-2">
                {leaderboardPaging.pageItems.map(({ entry, rank }, index) => {
                  const profile = entry.profile ?? entry
                  const name = entry.name ?? profile.name ?? "Nuotatore"
                  const rawUserId = profile.userId ?? entry.userId
                  const userId = Number(rawUserId)
                  const hasProfileLink = Number.isFinite(userId) && userId > 0
                  const distance = Number(profile.totalDistanceMeters ?? 0)

                  return (
                    <li key={entry.userId ?? entry.id ?? index} value={rank ?? undefined}>
                      <RankRow
                        rank={rank}
                        name={name}
                        avatarUrl={profile.avatarUrl ?? profile.profileImage}
                        subtitle={distance > 0 ? formatDistance(distance) : undefined}
                        value={formatInteger(weeklyXp(entry))}
                        unit="XP"
                        href={hasProfileLink ? `/u/${userId}` : undefined}
                        isCurrentUser={hasProfileLink && myUserId != null && userId === Number(myUserId)}
                      />
                    </li>
                  )
                })}
              </ol>
            )}
            <Pager
              page={leaderboardPaging.page}
              totalPages={leaderboardPaging.totalPages}
              onChange={leaderboardPaging.setPage}
              listRef={leaderboardListRef}
              label="Pagine della classifica"
            />
          </TabsContent>
        </Tabs>

        <Dialog open={leaveTarget != null} onOpenChange={(open) => !open && setLeaveTarget(null)}>
          <DialogContent
            role="alertdialog"
            showCloseButton={false}
            className="sm:max-w-sm"
            onCloseAutoFocus={(event) => {
              // Back to «Abbandona» when its card is still there (cancelled or failed).
              event.preventDefault()
              if (leaveOpenerRef.current?.isConnected) leaveOpenerRef.current.focus()
            }}
          >
            <DialogHeader>
              <DialogTitle>Abbandonare «{leaveTarget?.name}»?</DialogTitle>
              <DialogDescription>Esci dalla classifica di questa sfida.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Annulla</Button>
              </DialogClose>
              <Button
                variant="destructive"
                onClick={() => {
                  if (leaveTarget) leaveChallenge.mutate({ challengeId: leaveTarget.id })
                  setLeaveTarget(null)
                }}
              >
                Abbandona
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  )
}
