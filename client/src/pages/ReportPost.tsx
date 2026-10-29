import { useId, useState, type FormEvent } from "react"
import { useLocation, useParams, useSearch } from "wouter"
import { toast } from "sonner"
import { Check, Flag } from "lucide-react"
import AppLayout from "@/components/AppLayout"
import { Notice } from "@/components/corsia/LoadState"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { previousInAppPath } from "@/lib/in-app-history"
import { trpc } from "@/lib/trpc"
import { errorToastMessage } from "@/lib/trpc-errors"

type ReportReason = "spam" | "offensive" | "harassment" | "misinformation" | "other"

const REASONS: Array<{ value: ReportReason; label: string; helper: string }> = [
  { value: "spam", label: "Spam", helper: "Contenuto ripetitivo o promozionale non richiesto." },
  { value: "offensive", label: "Offensivo", helper: "Linguaggio o immagini offensive o inappropriate." },
  { value: "harassment", label: "Molestie", helper: "Bullismo, minacce o attacchi personali." },
  { value: "misinformation", label: "Disinformazione", helper: "Informazioni palesemente false o fuorvianti." },
  { value: "other", label: "Altro", helper: "Spiega il motivo nei dettagli." },
]

const MAX_DETAILS = 1000
const MIN_OTHER_DETAILS = 10
const FALLBACK = "/home"

/** The page the report was opened from (`?from=`): an in-app path only, else the feed. */
function safeReturnPath(raw: string | null) {
  if (!raw) return FALLBACK
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : FALLBACK
}

/** `/home/report/post/:postId`: why a post should be looked at by the admins. */
export default function ReportPost() {
  const params = useParams<{ postId: string }>()
  const search = useSearch()
  const [, navigate] = useLocation()
  const postId = Number(params.postId)
  const validId = Number.isInteger(postId) && postId > 0
  const returnPath = safeReturnPath(new URLSearchParams(search).get("from"))

  const [reason, setReason] = useState<ReportReason>("spam")
  const [details, setDetails] = useState("")
  const titleId = useId()
  const detailsId = useId()
  const hintId = useId()

  // Back to the page it came from: that history entry when it is the previous one, so «back»
  // never lands on the form again; otherwise the form is replaced.
  const leave = () => {
    if (previousInAppPath() === returnPath) window.history.back()
    else navigate(returnPath, { replace: true })
  }

  const reportMutation = trpc.community.reportPost.useMutation({
    onSuccess: () => {
      toast.success("Segnalazione inviata. Grazie.")
      leave()
    },
    onError: (error) => {
      // The server's own words only for a rejected form (Italian); its other errors are English.
      const fallback = "Impossibile inviare la segnalazione"
      toast.error(error.data?.code === "BAD_REQUEST" ? errorToastMessage(error, fallback) : fallback)
    },
  })

  if (!validId) {
    return (
      <AppLayout>
        <Notice backHref={FALLBACK} backLabel="Torna al feed">Post non trovato.</Notice>
      </AppLayout>
    )
  }

  const detailsTrimmed = details.trim()
  const otherTooShort = reason === "other" && detailsTrimmed.length < MIN_OTHER_DETAILS
  const canSubmit = !otherTooShort && !reportMutation.isPending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    reportMutation.mutate({ postId, reason, details: detailsTrimmed || null })
  }

  return (
    <AppLayout>
      <form onSubmit={submit} aria-labelledby={titleId} className="surface-panel max-w-2xl space-y-5 p-4">
        <div className="flex items-start gap-3">
          <span aria-hidden className="rounded-full bg-raised p-2 text-action-text">
            <Flag className="size-5" />
          </span>
          <div>
            <h2 id={titleId} className="text-[17px] font-bold">
              Segnala il post
            </h2>
            <p className="text-sm text-muted-foreground">
              Gli amministratori esamineranno la segnalazione del post n. {postId}.
            </p>
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">Motivo</legend>
          {REASONS.map((item) => {
            const checked = reason === item.value
            return (
              <label
                key={item.value}
                className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-border bg-raised p-3 transition-colors has-[:checked]:border-action-text has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
              >
                <input
                  type="radio"
                  name="reason"
                  value={item.value}
                  checked={checked}
                  onChange={() => setReason(item.value)}
                  className="sr-only"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{item.label}</span>{" "}
                  <span className="mt-0.5 block text-xs text-muted-foreground">{item.helper}</span>
                </span>
                {checked ? <Check className="size-4 shrink-0 text-action-text" aria-hidden /> : null}
              </label>
            )
          })}
        </fieldset>

        <div className="space-y-2">
          <label htmlFor={detailsId} className="text-sm font-semibold">
            {reason === "other" ? "Dettagli" : "Dettagli (facoltativi)"}
          </label>
          <Textarea
            id={detailsId}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            rows={5}
            maxLength={MAX_DETAILS}
            aria-describedby={hintId}
            placeholder="Aggiungi contesto utile per gli amministratori…"
          />
          <div className="flex items-center justify-between gap-3 text-xs">
            <span id={hintId} className={otherTooShort ? "text-danger" : "text-muted-foreground"}>
              {reason === "other"
                ? `Per «Altro» servono almeno ${MIN_OTHER_DETAILS} caratteri.`
                : "Aggiungi dettagli se servono."}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {details.length}/{MAX_DETAILS}
            </span>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={leave} disabled={reportMutation.isPending}>
            Annulla
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {reportMutation.isPending ? "Invio…" : "Invia segnalazione"}
          </Button>
        </div>
      </form>
    </AppLayout>
  )
}
