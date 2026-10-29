import { useId, useState } from "react"
import { toast } from "sonner"
import AppLayout from "@/components/AppLayout"
import { Chip } from "@/components/corsia/Chip"
import { LoadError, LoadingSkeleton, Notice } from "@/components/corsia/LoadState"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatInteger, formatTimeAgo, toFiniteNumber } from "@/lib/format"
import { isVideoUrl } from "@/lib/post-media"
import { trpc } from "@/lib/trpc"
import { errorToastMessage } from "@/lib/trpc-errors"

type ReportStatus = "all" | "open" | "in_review" | "resolved" | "rejected"
type ItemStatus = Exclude<ReportStatus, "all">

const STATUS_OPTIONS: Array<{ value: ReportStatus; label: string }> = [
  { value: "open", label: "Aperte" },
  { value: "in_review", label: "In revisione" },
  { value: "resolved", label: "Risolte" },
  { value: "rejected", label: "Respinte" },
  { value: "all", label: "Tutte" },
]

const STATUS: Record<ItemStatus, { label: string; tone: "action" | "neutral" | "success" }> = {
  open: { label: "Aperta", tone: "action" },
  in_review: { label: "In revisione", tone: "neutral" },
  resolved: { label: "Risolta", tone: "success" },
  rejected: { label: "Respinta", tone: "neutral" },
}

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  offensive: "Offensivo",
  harassment: "Molestie",
  misinformation: "Disinformazione",
  other: "Altro",
}

/** «1 segnalazione», «12 segnalazioni». */
const reportsCount = (total: number) => `${formatInteger(total)} ${total === 1 ? "segnalazione" : "segnalazioni"}`

/**
 * `/admin/reports` (admins only): reported posts with their status and the moderation note. The
 * post is shown here (text, first photo or video): its page refuses a private or club post to
 * the admin as to anyone else.
 */
export default function AdminReports() {
  const [status, setStatus] = useState<ReportStatus>("open")
  const [noteById, setNoteById] = useState<Record<number, string>>({})
  const statusLabelId = useId()

  const meQuery = trpc.auth.me.useQuery()
  const isAdmin = meQuery.data?.role === "admin"

  const reportsQuery = trpc.admin.listPostReports.useQuery(
    { status, limit: 50, offset: 0 },
    { enabled: isAdmin }
  )

  const utils = trpc.useUtils()
  const updateMutation = trpc.admin.updatePostReportStatus.useMutation({
    onSuccess: () => {
      toast.success("Segnalazione aggiornata")
      utils.admin.listPostReports.invalidate()
    },
    onError: (error) => toast.error(errorToastMessage(error, "Aggiornamento non riuscito")),
  })

  if (meQuery.isPending) {
    return (
      <AppLayout>
        <LoadingSkeleton label="Caricamento…" count={2} className="max-w-3xl space-y-3" itemClassName="h-40 w-full rounded-2xl" />
      </AppLayout>
    )
  }

  if (meQuery.isError) {
    return (
      <AppLayout>
        <LoadError onRetry={() => void meQuery.refetch()} className="max-w-3xl" />
      </AppLayout>
    )
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <Notice backHref="/home" backLabel="Torna al feed" className="max-w-3xl">
          Accesso riservato agli amministratori.
        </Notice>
      </AppLayout>
    )
  }

  const updateStatus = (reportId: number, nextStatus: ItemStatus, savedNote?: string | null) => {
    if (updateMutation.isPending) return
    const note = (noteById[reportId] ?? savedNote ?? "").trim()
    updateMutation.mutate({ reportId, status: nextStatus, adminNote: note || null })
  }

  const items = (reportsQuery.data?.items as Array<any> | undefined) ?? []
  const total = toFiniteNumber(reportsQuery.data?.total)

  let list
  if (reportsQuery.isPending) {
    list = <LoadingSkeleton label="Caricamento delle segnalazioni…" count={3} className="space-y-3" itemClassName="h-48 w-full rounded-2xl" />
  } else if (reportsQuery.isError) {
    list = <LoadError onRetry={() => void reportsQuery.refetch()} />
  } else if (items.length === 0) {
    list = <Notice>{status === "all" ? "Nessuna segnalazione." : "Nessuna segnalazione con questo stato."}</Notice>
  } else {
    list = (
      <ul className="space-y-3">
        {items.map((item) => (
          <ReportItem
            key={item.id}
            item={item}
            note={noteById[item.id] ?? item.admin_note ?? ""}
            onNoteChange={(value) => setNoteById((previous) => ({ ...previous, [item.id]: value }))}
            onStatus={(next) => updateStatus(item.id, next, item.admin_note)}
            pending={updateMutation.isPending}
          />
        ))}
      </ul>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-3xl space-y-4">
        <section className="surface-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[17px] font-bold">Segnalazioni dei post</h2>
            {/* The count only once loaded: never «0» while loading or after an error. */}
            {reportsQuery.isSuccess && total !== null ? (
              <p className="text-sm text-muted-foreground tabular-nums">{reportsCount(total)}</p>
            ) : null}
          </div>
          <div className="space-y-1 sm:min-w-[180px]">
            <p id={statusLabelId} className="text-xs font-semibold text-muted-foreground">
              Stato
            </p>
            <Select value={status} onValueChange={(value) => setStatus(value as ReportStatus)}>
              <SelectTrigger aria-labelledby={statusLabelId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        {list}
      </div>
    </AppLayout>
  )
}

function ReportItem({
  item,
  note,
  onNoteChange,
  onStatus,
  pending,
}: {
  item: any
  note: string
  onNoteChange: (value: string) => void
  onStatus: (status: ItemStatus) => void
  pending: boolean
}) {
  const titleId = useId()
  const noteId = useId()
  const current = STATUS[item.status as ItemStatus] ?? STATUS.open
  const mediaUrl = typeof item.post_media_url === "string" ? item.post_media_url.trim() : ""
  const facts: Array<[string, string]> = [
    ["Post", `n. ${item.post_id}`],
    ["Motivo", REASON_LABELS[item.reason] ?? String(item.reason ?? "")],
    ["Segnalata da", item.reporter_name || `Utente ${item.reporter_user_id}`],
    ["Autore del post", item.post_author_name || `Utente ${item.post_author_id}`],
    ...(item.details ? ([["Dettagli", String(item.details)]] as Array<[string, string]>) : []),
    ...(item.post_content ? ([["Contenuto del post", String(item.post_content)]] as Array<[string, string]>) : []),
  ]

  return (
    <li>
      <article aria-labelledby={titleId} className="surface-panel space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={titleId} className="font-bold">
            Segnalazione n. {item.id}
          </h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Chip tone={current.tone}>{current.label}</Chip>
            <span>{formatTimeAgo(item.created_at)}</span>
          </div>
        </div>

        <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
          {facts.map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="mb-1 break-words sm:mb-0">{value}</dd>
            </div>
          ))}
        </dl>

        {mediaUrl ? (
          <div className="overflow-hidden rounded-xl bg-raised">
            {isVideoUrl(mediaUrl) ? (
              <video
                src={mediaUrl}
                controls
                playsInline
                preload="metadata"
                aria-label={`Video del post n. ${item.post_id}`}
                className="max-h-[320px] w-full object-contain"
              />
            ) : (
              <img
                src={mediaUrl}
                alt={`Foto del post n. ${item.post_id}`}
                loading="lazy"
                className="max-h-[320px] w-full object-contain"
              />
            )}
          </div>
        ) : null}

        <div className="space-y-1">
          <label htmlFor={noteId} className="text-sm font-semibold">
            Nota dell'amministratore (facoltativa)
          </label>
          <Textarea
            id={noteId}
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label={`Stato della segnalazione n. ${item.id}`}>
          <Button size="sm" variant="outline" onClick={() => onStatus("in_review")} disabled={pending}>
            In revisione
          </Button>
          <Button size="sm" onClick={() => onStatus("resolved")} disabled={pending}>
            Risolta
          </Button>
          <Button size="sm" variant="outline" onClick={() => onStatus("rejected")} disabled={pending}>
            Respingi
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onStatus("open")} disabled={pending}>
            Riapri
          </Button>
        </div>
      </article>
    </li>
  )
}
