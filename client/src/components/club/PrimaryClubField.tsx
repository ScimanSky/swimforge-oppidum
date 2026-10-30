import { useId } from "react"
import { toast } from "sonner"
import { LoadError } from "@/components/corsia/LoadState"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { trpc } from "@/lib/trpc"
import { errorToastMessage } from "@/lib/trpc-errors"

const NONE = "none"

type ClubRow = { id: number | string; name?: string | null }

/**
 * «Club principale»: the club shown next to the user's name in the feed and on their profile.
 * One of their clubs, or «Nessuno»; until they choose, the latest club they joined is shown.
 * `value` is the stored preferences.primaryClubId (a number, null for «Nessuno», else unset).
 */
export function PrimaryClubField({ value }: { value: unknown }) {
  const id = useId()
  const hintId = useId()
  const utils = trpc.useUtils()
  const clubsQuery = trpc.community.clubs.list.useQuery({ scope: "mine", limit: 100 })
  const setPrimaryClub = trpc.profile.setPrimaryClub.useMutation({
    onSuccess: () => {
      toast.success("Club principale salvato.")
      // Everywhere the club shows next to the name: own profile, feed, post page, public profile.
      void utils.profile.get.invalidate()
      void utils.community.feed.invalidate()
      void utils.community.postById.invalidate()
      void utils.community.users.getPublicProfile.invalidate()
    },
    onError: (error) => toast.error(errorToastMessage(error, "Non riesco a salvare il club principale.")),
  })

  const clubs = ((clubsQuery.data ?? []) as ClubRow[])
    .map((club) => ({ id: Number(club.id), name: club.name?.trim() || "Club" }))
    .filter((club) => Number.isInteger(club.id) && club.id > 0)
  // A club left after choosing it reads as not chosen: the latest club shows instead.
  const chosen =
    value === null
      ? NONE
      : typeof value === "number" && clubs.some((club) => club.id === value)
        ? String(value)
        : ""

  if (clubsQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Caricamento dei tuoi club…</p>
  }
  // A failed load is not «no clubs».
  if (clubsQuery.isError && !clubsQuery.data) {
    return <LoadError variant="inline" onRetry={() => void clubsQuery.refetch()} />
  }
  if (clubs.length === 0) {
    return <p className="text-sm text-muted-foreground">Non fai parte di nessun club.</p>
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Club principale</Label>
      <Select
        value={chosen}
        disabled={setPrimaryClub.isPending}
        onValueChange={(next) => setPrimaryClub.mutate({ clubId: next === NONE ? null : Number(next) })}
      >
        <SelectTrigger id={id} aria-describedby={hintId} className="w-full">
          <SelectValue placeholder="Scegli un club" />
        </SelectTrigger>
        <SelectContent>
          {clubs.map((club) => (
            <SelectItem key={club.id} value={String(club.id)}>
              {club.name}
            </SelectItem>
          ))}
          <SelectItem value={NONE}>Nessuno</SelectItem>
        </SelectContent>
      </Select>
      <p id={hintId} className="text-sm text-muted-foreground">
        {chosen === ""
          ? "Compare accanto al tuo nome nel feed e nel profilo. Finché non scegli, compare l'ultimo club in cui sei entrato."
          : "Compare accanto al tuo nome nel feed e nel profilo."}
      </p>
    </div>
  )
}
