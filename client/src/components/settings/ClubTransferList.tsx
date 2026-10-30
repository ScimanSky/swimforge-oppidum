import { useId, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { trpc } from "@/lib/trpc"
import { errorToastMessage } from "@/lib/trpc-errors"

export type ClubTransferCandidate = { userId: number; name: string | null; username: string | null }
/** A club the user owns with other active members (auth.deleteAccountStatus.blockingClubs). */
export type BlockingClub = {
  id: number
  name: string
  otherActiveMembers: number
  members: ClubTransferCandidate[]
}

/** «Giulia (@giulia)», «Giulia», «@marco». */
export function candidateLabel(member: ClubTransferCandidate): string {
  const name = member.name?.trim()
  const username = member.username?.trim()
  if (name && username) return `${name} (@${username})`
  if (name) return name
  if (username) return `@${username}`
  return "Membro senza nome"
}

type PendingTransfer = { club: BlockingClub; member: ClubTransferCandidate }

/**
 * Settings → Privacy, before the account deletion: the clubs that block it (other active members)
 * and, for each, «Trasferisci a…» one of them, with a confirmation. The new owner gets the owner
 * role, the user stays as admin.
 */
export function ClubTransferList({
  clubs,
  onTransferred,
}: {
  clubs: BlockingClub[]
  /** Refreshes the blocking clubs (after a transfer, or a refusal that may mean a stale list). */
  onTransferred: () => void
}) {
  const regionTitleId = useId()
  const [choice, setChoice] = useState<Record<number, number | undefined>>({})
  const [pending, setPending] = useState<PendingTransfer | null>(null)
  const transferMutation = trpc.community.clubs.transferOwnership.useMutation({
    onSuccess: () => {
      if (pending) toast.success(`«${pending.club.name}» ora è di ${candidateLabel(pending.member)}.`)
      setPending(null)
      onTransferred()
    },
    onError: (error) => {
      toast.error(errorToastMessage(error, "Trasferimento non riuscito."))
      setPending(null)
      onTransferred()
    },
  })

  if (clubs.length === 0) return null

  return (
    <section aria-labelledby={regionTitleId} className="mt-3 rounded-xl bg-raised p-3">
      <h3 id={regionTitleId} className="font-semibold">
        Club da trasferire
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Prima di eliminare l&apos;account trasferisci i club di cui sei proprietario: hanno altri membri e non
        vengono eliminati con te. Il nuovo proprietario avrà il ruolo di proprietario, tu resterai amministratore.
      </p>
      <ul className="mt-3 divide-y divide-border">
        {clubs.map((club) => {
          const selectId = `${regionTitleId}-club-${club.id}`
          const selected = club.members.find((member) => member.userId === choice[club.id])
          return (
            <li key={club.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div>
                <p id={`${selectId}-name`} className="font-semibold">
                  {club.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {club.otherActiveMembers === 1 ? "1 altro membro" : `${club.otherActiveMembers} altri membri`}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label id={`${selectId}-label`} htmlFor={selectId} className="text-sm font-medium">
                  Trasferisci a…
                </label>
                {/* Named «Trasferisci a… <club>»: one select per club. */}
                <select
                  id={selectId}
                  aria-labelledby={`${selectId}-label ${selectId}-name`}
                  value={choice[club.id] ?? ""}
                  onChange={(event) =>
                    setChoice((current) => ({
                      ...current,
                      [club.id]: event.target.value ? Number(event.target.value) : undefined,
                    }))
                  }
                  className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
                  disabled={transferMutation.isPending}
                >
                  <option value="">Scegli un membro</option>
                  {club.members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {candidateLabel(member)}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  aria-label={`Trasferisci «${club.name}»`}
                  disabled={!selected || transferMutation.isPending}
                  onClick={() => selected && setPending({ club, member: selected })}
                >
                  Trasferisci
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !transferMutation.isPending) setPending(null)
        }}
      >
        <DialogContent className="rounded-2xl bg-card shadow-none" showCloseButton={!transferMutation.isPending}>
          <DialogHeader>
            <DialogTitle className="text-[17px] font-bold">Trasferire il club?</DialogTitle>
            <DialogDescription>
              {pending
                ? `«${pending.club.name}» passerà a ${candidateLabel(pending.member)}, che ne diventerà proprietario. Tu resterai amministratore.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={transferMutation.isPending}>
              Annulla
            </Button>
            <Button
              onClick={() =>
                pending && transferMutation.mutate({ clubId: pending.club.id, newOwnerId: pending.member.userId })
              }
              disabled={transferMutation.isPending}
            >
              {transferMutation.isPending ? "Trasferimento…" : "Conferma trasferimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
