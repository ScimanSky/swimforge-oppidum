"use client"

import { assetUrl } from "@/lib/asset-base";
import AppLayout from "@/components/AppLayout"
import { useId, useMemo, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { Chip } from "@/components/corsia/Chip"
import { Metric } from "@/components/corsia/Metric"
import { Pager } from "@/components/corsia/Pager"
import { RankRow } from "@/components/corsia/RankRow"
import { Clock, Gift, Plus, Target, Users } from "lucide-react"
import { Link } from "wouter"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import {
  CHALLENGE_DURATION_LABELS,
  CHALLENGE_OBJECTIVE_LABELS,
  CHALLENGE_TYPE_LABELS,
  challengeObjectiveLabel,
  challengeProgressParts,
} from "@/lib/challenges"
import { formatDistance, formatInteger } from "@/lib/format"

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

const getStreak = (dates: string[]) => {
  const uniqueDates = Array.from(new Set(dates)).sort()
  if (!uniqueDates.length) return 0
  const dateSet = new Set(uniqueDates)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let streak = 0
  let cursor = new Date(today)
  while (dateSet.has(cursor.toISOString().split("T")[0])) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
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
  const isDesktopWide = useMediaQuery("(min-width: 1280px)", false)
  const [activePage, setActivePage] = useState(1)
  const [availablePage, setAvailablePage] = useState(1)
  const [leaderboardPage, setLeaderboardPage] = useState(1)
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
  })
  const leaveChallenge = trpc.challenges.leave.useMutation({
    onSuccess: () => challengesQuery.refetch(),
  })

  const challenges = useMemo(() => (challengesQuery.data ?? []) as any[], [challengesQuery.data])
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

  const activePageSize = isDesktopWide ? 1 : 2
  const availablePageSize = isDesktopWide ? 2 : 3
  const leaderboardPageSize = isDesktopWide ? 3 : 4
  const activeTotalPages = Math.max(1, Math.ceil(participatingChallenges.length / activePageSize))
  const availableTotalPages = Math.max(1, Math.ceil(availableChallenges.length / availablePageSize))
  const leaderboard = useMemo(() => (leaderboardQuery.data ?? []) as any[], [leaderboardQuery.data])
  const leaderboardTotalPages = Math.max(1, Math.ceil(leaderboard.length / leaderboardPageSize))
  const pageOf = <T,>(items: T[], page: number, size: number) =>
    items.slice((page - 1) * size, page * size)
  const pagedParticipatingChallenges = pageOf(participatingChallenges, activePage, activePageSize)
  const pagedAvailableChallenges = pageOf(availableChallenges, availablePage, availablePageSize)
  const pagedLeaderboard = pageOf(leaderboard, leaderboardPage, leaderboardPageSize)

  const streak = useMemo(() => {
    const dates = (activitiesQuery.data ?? [])
      .map((activity) => new Date(activity.activityDate).toISOString().split("T")[0])
      .filter(Boolean)
    return getStreak(dates)
  }, [activitiesQuery.data])

  const myUserId = profileQuery.data?.userId
  const participatingCount = activeChallenges.length + pendingChallenges.length
  // A metric without data is not shown.
  const summaryMetrics = [
    challengesQuery.data
      ? { label: "Le tue sfide", value: formatInteger(participatingCount) }
      : null,
    badgesQuery.data ? { label: "Badge", value: formatInteger(badgesQuery.data.length) } : null,
    activitiesQuery.data
      ? { label: "Giorni di fila", value: formatInteger(streak), unit: streak === 1 ? "giorno" : "giorni" }
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
            disabled={!createDraft.name.trim()}
          >
            Crea sfida
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
          onValueChange={(value) => {
            setActiveTab(value)
            if (value === "active") setActivePage(1)
            if (value === "available") setAvailablePage(1)
            if (value === "leaderboard") setLeaderboardPage(1)
          }}
          className="gap-3"
        >
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList aria-label="Sfide">
              <TabsTrigger value="active">
                Attive <span className="tabular-nums">({participatingCount})</span>
              </TabsTrigger>
              <TabsTrigger value="available">Disponibili</TabsTrigger>
              <TabsTrigger value="completed">Concluse</TabsTrigger>
              <TabsTrigger value="leaderboard">Classifica</TabsTrigger>
            </TabsList>
            <div className="flex justify-end">{createDialog}</div>
          </div>

          <TabsContent value="active" className="space-y-3">
            {participatingChallenges.length === 0 && (
              <EmptyCard>Nessuna sfida attiva. Esplora le sfide disponibili.</EmptyCard>
            )}
            {pagedParticipatingChallenges.length > 0 ? (
              <ul className="space-y-3">
                {pagedParticipatingChallenges.map((challenge) => {
                  const leaderboard = (challenge.leaderboard ?? []) as Array<{ progress: number }>
                  const maxProgress = leaderboard.reduce(
                    (max, item) => Math.max(max, item.progress || 0),
                    0
                  )
                  const progressValue = challenge.current_progress ?? 0
                  const progressPercent =
                    maxProgress > 0 ? Math.min(100, (progressValue / maxProgress) * 100) : 0
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
                          onClick={() => leaveChallenge.mutate({ challengeId: challenge.id })}
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
              page={activePage}
              totalPages={activeTotalPages}
              onChange={setActivePage}
              label="Pagine delle sfide attive"
            />
          </TabsContent>

          <TabsContent value="available" className="space-y-3">
            {availableChallenges.length === 0 && (
              <EmptyCard>Nessuna sfida disponibile al momento.</EmptyCard>
            )}
            {pagedAvailableChallenges.length > 0 ? (
              <ul className="space-y-3">
                {pagedAvailableChallenges.map((challenge) => (
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
              page={availablePage}
              totalPages={availableTotalPages}
              onChange={setAvailablePage}
              label="Pagine delle sfide disponibili"
            />
          </TabsContent>

          <TabsContent value="completed">
            <EmptyCard>Nessuna sfida conclusa al momento.</EmptyCard>
          </TabsContent>

          <TabsContent value="leaderboard" className="space-y-3">
            {/* The query is weekly (period "week", sorted by periodXp): so are the numbers. */}
            <h2 className="text-sm font-semibold text-muted-foreground">Questa settimana</h2>
            {leaderboard.length === 0 ? (
              <EmptyCard>Nessuna classifica disponibile.</EmptyCard>
            ) : (
              <ol aria-label="Classifica" className="space-y-2">
                {pagedLeaderboard.map((entry, index) => {
                  const absoluteIndex = (leaderboardPage - 1) * leaderboardPageSize + index
                  const profile = entry.profile ?? entry
                  const name = entry.name ?? profile.name ?? "Nuotatore"
                  const rawUserId = profile.userId ?? entry.userId
                  const userId = Number(rawUserId)
                  const hasProfileLink = Number.isFinite(userId) && userId > 0
                  const distance = Number(profile.totalDistanceMeters ?? 0)

                  return (
                    <li key={entry.userId ?? entry.id ?? index}>
                      <RankRow
                        rank={absoluteIndex + 1}
                        name={name}
                        avatarUrl={profile.avatarUrl ?? profile.profileImage}
                        subtitle={distance > 0 ? formatDistance(distance) : undefined}
                        value={formatInteger(Number(entry.periodXp ?? 0))}
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
              page={leaderboardPage}
              totalPages={leaderboardTotalPages}
              onChange={setLeaderboardPage}
              label="Pagine della classifica"
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  )
}
