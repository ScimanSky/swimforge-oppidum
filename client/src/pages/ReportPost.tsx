"use client"

import { useMemo, useState } from "react"
import { useLocation, useParams } from "wouter"
import AppLayout from "@/components/AppLayout"
import { Surface, SurfaceContent } from "@/components/ui/surface"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { AlertTriangle } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"

type ReportReason = "spam" | "offensive" | "harassment" | "misinformation" | "other"

const reasons: Array<{ value: ReportReason; label: string; helper: string }> = [
  { value: "spam", label: "Spam", helper: "Contenuto ripetitivo o promozionale non richiesto." },
  { value: "offensive", label: "Offensivo", helper: "Linguaggio o immagini offensive/inappropriate." },
  { value: "harassment", label: "Molestie", helper: "Bullismo, minacce o attacchi personali." },
  { value: "misinformation", label: "Disinformazione", helper: "Informazioni palesemente false o fuorvianti." },
  { value: "other", label: "Altro", helper: "Specifica i dettagli nel campo testo." },
]

export default function ReportPost() {
  const params = useParams<{ postId: string }>()
  const [location, setLocation] = useLocation()
  const postId = Number.parseInt(params.postId ?? "", 10)

  const returnPath = useMemo(() => {
    if (typeof window === "undefined") return "/home"
    const raw = new URLSearchParams(window.location.search).get("from") || "/home"
    try {
      const decoded = decodeURIComponent(raw)
      return decoded.startsWith("/") ? decoded : "/home"
    } catch {
      return "/home"
    }
  }, [location])

  const [reason, setReason] = useState<ReportReason>("spam")
  const [details, setDetails] = useState("")

  const reportMutation = trpc.community.reportPost.useMutation({
    onSuccess: () => {
      toast.success("Segnalazione inviata. Grazie.")
      setLocation(returnPath)
    },
    onError: (err) => {
      toast.error(err.message || "Impossibile inviare la segnalazione")
    },
  })

  const detailsTrimmed = details.trim()
  const otherReasonInvalid = reason === "other" && detailsTrimmed.length < 10
  const isInvalidPostId = !Number.isFinite(postId) || postId <= 0

  const handleSubmit = () => {
    if (isInvalidPostId || otherReasonInvalid || reportMutation.isPending) return
    reportMutation.mutate({
      postId,
      reason,
      details: detailsTrimmed || null,
    })
  }

  return (
    <AppLayout>
      <div className="compact-shell max-w-2xl mx-auto space-y-4 lg:space-y-3">
        <Surface>
          <SurfaceContent className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full p-2 bg-[color-mix(in_oklch,var(--electric-cyan)_18%,transparent)]">
                <AlertTriangle className="size-5 text-[var(--electric-cyan)]" />
              </div>
              <div>
                <h1 className="text-xl font-display font-bold text-foreground">Segnala contenuto</h1>
                <p className="text-sm text-muted-foreground">
                  Post #{Number.isFinite(postId) ? postId : "-"}.
                </p>
              </div>
            </div>

            {isInvalidPostId ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                ID post non valido.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Motivo</p>
                  <div className="space-y-2">
                    {reasons.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setReason(item.value)}
                        className={`w-full text-left rounded-xl border p-3 transition-colors ${
                          reason === item.value
                            ? "border-[color-mix(in_oklch,var(--electric-cyan)_55%,var(--border))] bg-[color-mix(in_oklch,var(--electric-cyan)_12%,transparent)]"
                            : "border-border/70 bg-background/40 hover:bg-card/60"
                        }`}
                      >
                        <div className="text-sm font-semibold text-foreground">{item.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{item.helper}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Dettagli (opzionale)</p>
                  <Textarea
                    value={details}
                    onChange={(event) => setDetails(event.target.value)}
                    rows={5}
                    maxLength={1000}
                    placeholder="Aggiungi contesto utile per gli admin..."
                  />
                  <div className="flex items-center justify-between text-xs">
                    <span className={otherReasonInvalid ? "text-destructive" : "text-muted-foreground"}>
                      {reason === "other"
                        ? "Per 'Altro' servono almeno 10 caratteri."
                        : "Aggiungi dettagli se necessario."}
                    </span>
                    <span className="text-muted-foreground">{details.length}/1000</span>
                  </div>
                </div>
              </>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button
                variant="outline-neon"
                onClick={() => setLocation(returnPath)}
                disabled={reportMutation.isPending}
              >
                Annulla
              </Button>
              <Button
                variant="neon"
                onClick={handleSubmit}
                disabled={isInvalidPostId || otherReasonInvalid || reportMutation.isPending}
              >
                {reportMutation.isPending ? "Invio..." : "Invia segnalazione"}
              </Button>
            </div>
          </SurfaceContent>
        </Surface>
      </div>
    </AppLayout>
  )
}
