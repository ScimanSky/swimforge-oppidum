import { useId } from "react"
import { useParams } from "wouter"
import { toast } from "sonner"
import { MapPin, UserCheck, UserPlus } from "lucide-react"
import AppLayout from "@/components/AppLayout"
import DirectMessages from "@/components/DirectMessages"
import { LoadError, LoadingSkeleton, Notice } from "@/components/corsia/LoadState"
import { Metric } from "@/components/corsia/Metric"
import { PersonalRecordsBoard } from "@/components/corsia/PersonalRecordsBoard"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { formatInteger, getInitials, toFiniteNumber } from "@/lib/format"
import { trpc } from "@/lib/trpc"
import { errorToastMessage } from "@/lib/trpc-errors"

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")

/**
 * Someone's public profile (`/u/:id`): name, level, followers, «Segui» and «Messaggio», then
 * their personal records. The shell header carries the «Profilo» title and the back button.
 */
export default function PublicProfile() {
  const params = useParams<{ id: string }>()
  const userId = Number(params.id)
  const validId = Number.isInteger(userId) && userId > 0
  const nameId = useId()

  const meQuery = trpc.auth.me.useQuery()
  const profileQuery = trpc.community.users.getPublicProfile.useQuery(
    { userId },
    { enabled: validId }
  )
  const toggleFollowMutation = trpc.community.users.toggleFollow.useMutation({
    onSuccess: () => profileQuery.refetch(),
    onError: (error) => toast.error(errorToastMessage(error, "Operazione non riuscita, riprova")),
  })

  if (!validId) {
    return (
      <AppLayout>
        <Notice backHref="/home" backLabel="Torna al feed">Profilo non trovato.</Notice>
      </AppLayout>
    )
  }

  if (profileQuery.isPending) {
    return (
      <AppLayout>
        <LoadingSkeleton
          label="Caricamento del profilo…"
          count={2}
          className="max-w-3xl space-y-4"
          itemClassName="h-48 w-full rounded-2xl"
        />
      </AppLayout>
    )
  }

  if (profileQuery.isError || !profileQuery.data) {
    const code = profileQuery.error?.data?.code
    return (
      <AppLayout>
        {code === "NOT_FOUND" || !profileQuery.error ? (
          <Notice backHref="/home" backLabel="Torna al feed">Profilo non trovato.</Notice>
        ) : code === "FORBIDDEN" ? (
          <Notice backHref="/home" backLabel="Torna al feed">Questo profilo è privato.</Notice>
        ) : (
          <LoadError onRetry={() => void profileQuery.refetch()} />
        )}
      </AppLayout>
    )
  }

  const profile = profileQuery.data as Record<string, unknown>
  const name = text(profile.name)
  const username = text(profile.username).replace(/^@+/, "")
  const displayName = name || username || "Nuotatore"
  const avatarUrl = text(profile.avatarUrl) || text(profile.avatar_url)
  const coverUrl = text(profile.coverUrl) || text(profile.cover_url)
  const bio = text(profile.bio)
  const location = text(profile.location)
  const level = toFiniteNumber(profile.level)
  const totalXp = toFiniteNumber(profile.totalXp)
  const isFollowing = Boolean(profile.isFollowing)
  // The actions wait for auth.me: following yourself is refused by the server.
  const canAct = Boolean(meQuery.data) && meQuery.data?.id !== userId

  const metrics = [
    level !== null ? { value: formatInteger(level), label: "Livello", tone: "xp" as const } : null,
    totalXp !== null ? { value: formatInteger(totalXp), label: "XP", tone: "xp" as const } : null,
    { value: formatInteger(toFiniteNumber(profile.followerCount) ?? 0), label: "Follower" },
    { value: formatInteger(toFiniteNumber(profile.followingCount) ?? 0), label: "Seguiti" },
  ].filter((metric) => metric !== null)

  return (
    <AppLayout>
      <div className="max-w-3xl space-y-4">
        <section aria-labelledby={nameId} className="surface-panel overflow-hidden">
          {coverUrl ? <img src={coverUrl} alt="" className="h-28 w-full object-cover sm:h-36" /> : null}
          <div className="p-4">
            <div className="flex items-center gap-4">
              <Avatar className="size-16 border border-border">
                <AvatarImage src={avatarUrl || undefined} alt="" className="object-cover" />
                <AvatarFallback className="text-xl font-semibold">{getInitials(displayName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <h2 id={nameId} className="truncate font-display text-[30px] font-bold leading-tight">
                  {displayName}
                </h2>
                {/* @username only under a real name: alone it is already the title. */}
                {name && username ? (
                  <p className="truncate text-sm text-muted-foreground">@{username}</p>
                ) : null}
              </div>
            </div>

            {bio ? <p className="mt-3 text-[15px]">{bio}</p> : null}
            {location ? (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-4" aria-hidden />
                {location}
              </p>
            ) : null}

            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-border pt-4 sm:grid-cols-4">
              {metrics.map((metric) => (
                <li key={metric.label}>
                  <Metric size="responsive" {...metric} />
                </li>
              ))}
            </ul>

            {canAct ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant={isFollowing ? "outline" : "default"}
                  onClick={() => toggleFollowMutation.mutate({ userId })}
                  disabled={toggleFollowMutation.isPending}
                >
                  {isFollowing ? <UserCheck aria-hidden /> : <UserPlus aria-hidden />}
                  {isFollowing ? "Seguito" : "Segui"}
                </Button>
                <DirectMessages recipientId={userId} recipientName={displayName} />
              </div>
            ) : null}
          </div>
        </section>

        <PersonalRecordsBoard userId={userId} limit={12} emptyText="Nessun record pubblico." />
      </div>
    </AppLayout>
  )
}
