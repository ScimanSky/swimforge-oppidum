"use client"

import { useEffect, useMemo, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { trpc } from "@/lib/trpc"
import { getInitials } from "@/lib/format"
import { toast } from "sonner"
import { X } from "lucide-react"

type ForwardTargetType = "post" | "story"

interface ForwardContentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetType: ForwardTargetType
  targetId: number
}

type SearchUser = {
  userId: number
  name?: string | null
  username?: string | null
  avatarUrl?: string | null
  level?: number | null
}

export function ForwardContentDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
}: ForwardContentDialogProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [note, setNote] = useState("")
  const [selectedRecipients, setSelectedRecipients] = useState<SearchUser[]>([])
  const utils = trpc.useUtils()

  const userSearchQuery = trpc.community.users.search.useQuery(
    { query: searchQuery.trim(), limit: 12 },
    { enabled: open && searchQuery.trim().length >= 1 }
  )

  const forwardMutation = trpc.community.messages.forward.useMutation({
    onSuccess: async (data) => {
      const delivered = Number(data?.deliveredCount ?? 0)
      const blocked = Array.isArray(data?.blockedRecipients) ? data.blockedRecipients.length : 0
      if (delivered > 0) {
        toast.success(
          delivered === 1 ? "Contenuto inoltrato in privato." : `Contenuto inoltrato a ${delivered} utenti.`
        )
        await Promise.all([
          utils.community.messages.recent.invalidate(),
          utils.community.messages.unreadCount.invalidate(),
        ])
      }
      if (blocked > 0) {
        toast.warning(`${blocked} destinatari bloccati dalle regole privacy.`)
      }
      if (delivered > 0) {
        onOpenChange(false)
      }
    },
    onError: (error) => {
      toast.error(error.message || "Impossibile inoltrare il contenuto.")
    },
  })

  useEffect(() => {
    if (!open) {
      setSearchQuery("")
      setNote("")
      setSelectedRecipients([])
    }
  }, [open])

  const selectedIds = useMemo(
    () => new Set(selectedRecipients.map((recipient) => recipient.userId)),
    [selectedRecipients]
  )

  const addRecipient = (user: SearchUser) => {
    if (selectedIds.has(user.userId)) return
    if (selectedRecipients.length >= 10) {
      toast.error("Puoi selezionare al massimo 10 destinatari.")
      return
    }
    setSelectedRecipients((prev) => [...prev, user])
  }

  const removeRecipient = (userId: number) => {
    setSelectedRecipients((prev) => prev.filter((item) => item.userId !== userId))
  }

  const handleForward = () => {
    const recipientIds = selectedRecipients.map((recipient) => recipient.userId)
    if (!recipientIds.length) {
      toast.error("Seleziona almeno un destinatario.")
      return
    }
    forwardMutation.mutate({
      targetType,
      targetId,
      recipientIds,
      note: note.trim() || null,
    })
  }

  const titleLabel = targetType === "post" ? "Inoltra post" : "Inoltra story"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{titleLabel}</DialogTitle>
          <DialogDescription>
            Scegli uno o più utenti. L'inoltro viene consentito solo se compatibile con le regole privacy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Cerca utente per nome o username"
            />
            <ScrollArea className="h-44 rounded-md border border-border/60">
              <div className="divide-y">
                {searchQuery.trim().length < 1 ? (
                  <p className="p-3 text-sm text-muted-foreground">Inizia a digitare per cercare utenti.</p>
                ) : userSearchQuery.isLoading ? (
                  <p className="p-3 text-sm text-muted-foreground">Ricerca in corso...</p>
                ) : !userSearchQuery.data?.length ? (
                  <p className="p-3 text-sm text-muted-foreground">Nessun utente trovato.</p>
                ) : (
                  userSearchQuery.data.map((user) => {
                    const displayName = user.username || user.name || `#${user.userId}`
                    const isSelected = selectedIds.has(user.userId)
                    return (
                      <div key={user.userId} className="flex items-center justify-between gap-3 p-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar className="size-8">
                            <AvatarImage src={user.avatarUrl || undefined} alt={displayName} />
                            <AvatarFallback className="text-xs">{getInitials(displayName)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{displayName}</p>
                            {user.level != null ? (
                              <p className="text-xs text-muted-foreground">Lv.{user.level}</p>
                            ) : null}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={isSelected ? "ghost" : "outline-neon"}
                          onClick={() => (isSelected ? removeRecipient(user.userId) : addRecipient(user))}
                        >
                          {isSelected ? "Selezionato" : "Aggiungi"}
                        </Button>
                      </div>
                    )
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Destinatari</p>
            <div className="flex min-h-11 flex-wrap gap-2 rounded-md border border-border/60 bg-background/40 p-2">
              {selectedRecipients.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun destinatario selezionato.</p>
              ) : (
                selectedRecipients.map((recipient) => {
                  const label = recipient.username || recipient.name || `#${recipient.userId}`
                  return (
                    <Badge key={recipient.userId} variant="secondary" className="gap-1.5 pr-1">
                      <span>{label}</span>
                      <button
                        type="button"
                        onClick={() => removeRecipient(recipient.userId)}
                        className="rounded-full p-0.5 hover:bg-black/10"
                        aria-label={`Rimuovi ${label}`}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  )
                })
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Nota (opzionale)
            </p>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 500))}
              placeholder="Aggiungi un messaggio per il destinatario..."
              rows={3}
            />
            <p className="text-right text-[11px] text-muted-foreground">{note.length}/500</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            variant="neon"
            onClick={handleForward}
            disabled={selectedRecipients.length === 0 || forwardMutation.isPending}
          >
            {forwardMutation.isPending ? "Inoltro..." : "Inoltra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
