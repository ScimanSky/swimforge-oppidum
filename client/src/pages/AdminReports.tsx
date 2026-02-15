"use client"

import { useMemo, useState } from "react"
import AppLayout from "@/components/AppLayout"
import { Surface, SurfaceContent } from "@/components/ui/surface"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { trpc } from "@/lib/trpc"
import { formatTimeAgo } from "@/lib/format"
import { toast } from "sonner"

type ReportStatus = "all" | "open" | "in_review" | "resolved" | "rejected"

const statusOptions: Array<{ value: ReportStatus; label: string }> = [
  { value: "open", label: "Aperte" },
  { value: "in_review", label: "In revisione" },
  { value: "resolved", label: "Risolte" },
  { value: "rejected", label: "Respinte" },
  { value: "all", label: "Tutte" },
]

const statusLabel: Record<Exclude<ReportStatus, "all">, string> = {
  open: "Aperta",
  in_review: "In revisione",
  resolved: "Risolta",
  rejected: "Respinta",
}

const reasonLabel: Record<string, string> = {
  spam: "Spam",
  offensive: "Offensivo",
  harassment: "Molestie",
  misinformation: "Disinformazione",
  other: "Altro",
}

export default function AdminReports() {
  const [status, setStatus] = useState<ReportStatus>("open")
  const [noteById, setNoteById] = useState<Record<number, string>>({})

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
    onError: (err) => toast.error(err.message || "Aggiornamento fallito"),
  })

  const items = useMemo(() => {
    return (reportsQuery.data?.items as Array<any>) ?? []
  }, [reportsQuery.data?.items])

  if (meQuery.isLoading) {
    return (
      <AppLayout>
        <div className="compact-shell max-w-4xl mx-auto">
          <Surface>
            <SurfaceContent className="p-6 text-muted-foreground">Caricamento...</SurfaceContent>
          </Surface>
        </div>
      </AppLayout>
    )
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="compact-shell max-w-4xl mx-auto">
          <Surface>
            <SurfaceContent className="p-6">
              <h1 className="text-xl font-display font-bold">Moderazione</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Accesso riservato agli amministratori.
              </p>
            </SurfaceContent>
          </Surface>
        </div>
      </AppLayout>
    )
  }

  const setNote = (reportId: number, value: string) => {
    setNoteById((prev) => ({ ...prev, [reportId]: value }))
  }

  const updateStatus = (reportId: number, nextStatus: Exclude<ReportStatus, "all">, fallbackNote?: string | null) => {
    if (updateMutation.isPending) return
    const note = (noteById[reportId] ?? fallbackNote ?? "").trim()
    updateMutation.mutate({
      reportId,
      status: nextStatus,
      adminNote: note || null,
    })
  }

  return (
    <AppLayout>
      <div className="compact-shell max-w-5xl mx-auto space-y-4 lg:space-y-3">
        <Surface>
          <SurfaceContent className="p-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold text-foreground">Moderazione Segnalazioni</h1>
              <p className="text-sm text-muted-foreground">
                Totale: {reportsQuery.data?.total ?? 0}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="report-status" className="text-sm text-muted-foreground">
                Stato:
              </label>
              <select
                id="report-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as ReportStatus)}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </SurfaceContent>
        </Surface>

        {reportsQuery.isLoading ? (
          <Surface>
            <SurfaceContent className="p-6 text-muted-foreground">Caricamento segnalazioni...</SurfaceContent>
          </Surface>
        ) : items.length === 0 ? (
          <Surface>
            <SurfaceContent className="p-6 text-muted-foreground">Nessuna segnalazione trovata.</SurfaceContent>
          </Surface>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const currentStatus = (item.status as Exclude<ReportStatus, "all">) || "open"
              const statusText = statusLabel[currentStatus] ?? item.status
              const noteValue = noteById[item.id] ?? (item.admin_note ?? "")
              return (
                <Surface key={item.id}>
                  <SurfaceContent className="p-5 space-y-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm">
                        <span className="font-semibold">Report #{item.id}</span>
                        <span className="text-muted-foreground"> · Post #{item.post_id}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {statusText} · {formatTimeAgo(item.created_at)}
                      </div>
                    </div>

                    <div className="grid gap-2 text-sm">
                      <p>
                        <span className="text-muted-foreground">Motivo:</span>{" "}
                        <span className="font-medium">{reasonLabel[item.reason] || item.reason}</span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Segnalato da:</span>{" "}
                        {item.reporter_name || `Utente ${item.reporter_user_id}`}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Autore post:</span>{" "}
                        {item.post_author_name || `Utente ${item.post_author_id}`}
                      </p>
                      {item.details ? (
                        <p>
                          <span className="text-muted-foreground">Dettagli:</span> {item.details}
                        </p>
                      ) : null}
                      {item.post_content ? (
                        <p className="text-sm">
                          <span className="text-muted-foreground">Contenuto post:</span> {item.post_content}
                        </p>
                      ) : null}
                    </div>

                    <Textarea
                      rows={3}
                      maxLength={1000}
                      value={noteValue}
                      onChange={(event) => setNote(item.id, event.target.value)}
                      placeholder="Nota admin (opzionale)"
                    />

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline-neon"
                        onClick={() => updateStatus(item.id, "in_review", item.admin_note)}
                        disabled={updateMutation.isPending}
                      >
                        In revisione
                      </Button>
                      <Button
                        size="sm"
                        variant="neon"
                        onClick={() => updateStatus(item.id, "resolved", item.admin_note)}
                        disabled={updateMutation.isPending}
                      >
                        Risolta
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost-neon"
                        onClick={() => updateStatus(item.id, "rejected", item.admin_note)}
                        disabled={updateMutation.isPending}
                      >
                        Respingi
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updateStatus(item.id, "open", item.admin_note)}
                        disabled={updateMutation.isPending}
                      >
                        Riapri
                      </Button>
                    </div>
                  </SurfaceContent>
                </Surface>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
