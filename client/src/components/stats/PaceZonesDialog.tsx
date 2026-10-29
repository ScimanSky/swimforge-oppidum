/**
 * «Le tue zone»: the five boundaries between the pace zones A1–C3, pre-filled with the ones in
 * effect, with a live preview of the seven zones. Paces in m:ss (also «1.50», «1,50», «1'50»),
 * checked here for their format; range and order are checked by the server, whose Italian
 * messages (`error.data.zodError.fieldErrors`) are shown each under its field. Saved zones win
 * everywhere; «Ripristina calcolo automatico» goes back to the zones from the threshold pace.
 */
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  PACE_ZONE_BOUNDARIES,
  PACE_ZONE_BOUNDARY_KEYS,
  PACE_ZONE_BY_CODE,
  PACE_ZONE_SPEED_BOUNDS,
  arePaceZoneBoundsValid,
  paceZoneRanges,
  type CssResult,
  type PaceZoneBoundaryKey,
  type PaceZoneBounds,
  type SwimZones,
} from "@shared/swimMetrics";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPaceValue } from "@/lib/format";
import { requestFieldErrors, type RequestError } from "@/lib/request-errors";
import { cssReadingText, formatClock, formatZonePace, parseMinSec } from "@/lib/swim-metrics-view";
import { trpc } from "@/lib/trpc";

type Field = PaceZoneBoundaryKey;
type Draft = Record<Field, string>;
type FieldErrors = Partial<Record<Field, string>>;

/** The server's input fields (statistics.setPaceZones) are the form's fields. */
const SERVER_FIELDS = Object.fromEntries(PACE_ZONE_BOUNDARY_KEYS.map((key) => [key, key])) as Record<Field, Field>;

const TITLE = "Le tue zone";
const FORMAT_ERROR = "Scrivi il passo come minuti:secondi, per esempio 1:50.";
const SAVE_FAILED = "Non riesco a salvare le zone. Riprova.";
const CLEAR_FAILED = "Non riesco a ripristinare il calcolo automatico. Riprova.";

/** «85%, 90%, 95% e 104%»: the boundaries other than the CSS, from the shared convention. */
const OTHER_SHARES = (() => {
  const shares = PACE_ZONE_BOUNDARY_KEYS.filter((key) => key !== "b2c1").map(
    (key) => `${Math.round(PACE_ZONE_SPEED_BOUNDS[key] * 100)}%`
  );
  return `${shares.slice(0, -1).join(", ")} e ${shares[shares.length - 1]}`;
})();

const emptyDraft = (): Draft => Object.fromEntries(PACE_ZONE_BOUNDARY_KEYS.map((key) => [key, ""])) as Draft;

/** The bounds in effect, in m:ss; empty without zones. */
function initialDraft(zones: SwimZones): Draft {
  const bounds = zones.bounds;
  if (!bounds) return emptyDraft();
  return Object.fromEntries(PACE_ZONE_BOUNDARY_KEYS.map((key) => [key, formatClock(bounds[key])])) as Draft;
}

/** The five paces in seconds when every field reads as m:ss. */
function parseDraft(draft: Draft): PaceZoneBounds | null {
  const values = PACE_ZONE_BOUNDARY_KEYS.map((key) => parseMinSec(draft[key]));
  if (values.some((value) => value === null)) return null;
  return Object.fromEntries(PACE_ZONE_BOUNDARY_KEYS.map((key, index) => [key, values[index]])) as PaceZoneBounds;
}

/** Where the automatic zones come from, and what they would be when the manual ones win. */
function sourceNote(zones: SwimZones, css: CssResult | null): string[] {
  if (!css) {
    return ["Senza passo soglia non c'è un calcolo automatico: scrivi i tuoi confini o inserisci un test del passo soglia."];
  }
  const notes = [
    `Calcolo automatico: dal tuo passo soglia ${formatPaceValue(css.paceSecondsPer100)} (${cssReadingText(
      css
    )}), che è il confine tra B2 e C1; gli altri confini sono all'${OTHER_SHARES} della velocità soglia.`,
  ];
  if (zones.source === "manuali" && zones.autoBounds) {
    const auto = zones.autoBounds;
    notes.push(`Il calcolo automatico darebbe: ${PACE_ZONE_BOUNDARY_KEYS.map((key) => formatPaceValue(auto[key])).join(" · ")}.`);
  }
  return notes;
}

function Preview({ draft }: { draft: Draft }) {
  const bounds = parseDraft(draft);
  if (!bounds) return <p className="text-sm text-muted-foreground">Completa i cinque confini per vedere le zone.</p>;
  if (!arePaceZoneBoundsValid(bounds)) {
    const values = PACE_ZONE_BOUNDARY_KEYS.map((key) => bounds[key]);
    const ordered = values.every((value, index) => index === 0 || value < values[index - 1]);
    return (
      <p className="text-sm text-muted-foreground">
        {ordered
          ? "Ogni passo deve stare tra 1:00 e 4:00 per 100 m."
          : "Ogni confine deve essere più veloce del precedente."}
      </p>
    );
  }
  return (
    <ul aria-label="Anteprima delle zone" className="space-y-0.5 text-sm tabular-nums">
      {paceZoneRanges(bounds).map((range) => (
        <li key={range.code}>
          {`${range.code} ${range.name} · ${formatZonePace(range)}${range.maxRepMeters ? ` · max ${range.maxRepMeters} m` : ""}`}
        </li>
      ))}
    </ul>
  );
}

export function PaceZonesDialog({ zones, css }: { zones: SwimZones; css: CssResult | null }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(zones));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const id = useId();
  const utils = trpc.useUtils();
  const isManual = zones.source === "manuali";

  const fieldId = (field: Field) => `${id}-${field}`;
  const done = (message: string) => {
    void utils.statistics.getMetrics.invalidate();
    toast.success(message);
    setOpen(false);
  };
  const showRequestErrors = (error: RequestError, fallback: string) => {
    const found = requestFieldErrors(error, SERVER_FIELDS, fallback);
    setErrors(found.fields);
    setRequestMessage(found.message);
    // The first field with a message takes the focus, so its message is read out.
    const first = PACE_ZONE_BOUNDARY_KEYS.find((field) => found.fields[field]);
    if (first) document.getElementById(fieldId(first))?.focus();
  };
  const save = trpc.statistics.setPaceZones.useMutation({
    onSuccess: () => done("Zone salvate: valgono ovunque, anche per il coach."),
    onError: (error) => showRequestErrors(error, SAVE_FAILED),
  });
  const clear = trpc.statistics.clearPaceZones.useMutation({
    onSuccess: () => done("Zone automatiche ripristinate."),
    onError: (error) => showRequestErrors(error, CLEAR_FAILED),
  });

  const onOpenChange = (next: boolean) => {
    if (next) {
      setDraft(initialDraft(zones));
      setErrors({});
      setRequestMessage(null);
    }
    setOpen(next);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found: FieldErrors = {};
    for (const key of PACE_ZONE_BOUNDARY_KEYS) {
      if (parseMinSec(draft[key]) === null) found[key] = FORMAT_ERROR;
    }
    setErrors(found);
    setRequestMessage(null);
    const bounds = parseDraft(draft);
    if (Object.keys(found).length > 0 || !bounds) return;
    save.mutate(bounds);
  };

  const pending = save.isPending || clear.isPending;

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(true)}>
        {TITLE}
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{TITLE}</DialogTitle>
            <DialogDescription>
              I confini tra le zone, in passo per 100 m, dal più lento al più veloce. Le tue zone valgono ovunque:
              statistiche, soglia del carico, coach e allenamenti.
            </DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-3">
              {PACE_ZONE_BOUNDARIES.map((boundary) => {
                const field = boundary.key;
                const error = errors[field];
                const slower = PACE_ZONE_BY_CODE[boundary.slower];
                const faster = PACE_ZONE_BY_CODE[boundary.faster];
                return (
                  <div key={field} className="grid grid-cols-[1fr_6rem] items-center gap-x-3 gap-y-1">
                    <Label htmlFor={fieldId(field)}>
                      Tra {boundary.slower} e {boundary.faster}
                    </Label>
                    <Input
                      id={fieldId(field)}
                      value={draft[field]}
                      onChange={(event) => setDraft((previous) => ({ ...previous, [field]: event.target.value }))}
                      placeholder="1:50"
                      // Digits with a separator: «1.50» is accepted where the keyboard has no «:».
                      inputMode="decimal"
                      autoComplete="off"
                      className="tabular-nums"
                      aria-invalid={error ? true : undefined}
                      aria-describedby={`${fieldId(field)}-hint`}
                    />
                    <p
                      id={`${fieldId(field)}-hint`}
                      className={error ? "col-span-2 text-xs text-destructive" : "col-span-2 text-xs text-muted-foreground"}
                    >
                      {error ??
                        `Più lento: ${slower.code} ${slower.name}. Uguale o più veloce: ${faster.code} ${faster.name}.`}
                    </p>
                  </div>
                );
              })}
            </div>
            <section aria-label="Anteprima" className="rounded-xl bg-raised p-3">
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Anteprima</p>
              <Preview draft={draft} />
            </section>
            {sourceNote(zones, css).map((note) => (
              <p key={note} className="text-xs text-muted-foreground">
                {note}
              </p>
            ))}
            {requestMessage ? (
              <p role="alert" className="text-sm text-destructive">
                {requestMessage}
              </p>
            ) : null}
            <DialogFooter className="gap-2">
              {isManual ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setRequestMessage(null);
                    clear.mutate();
                  }}
                >
                  Ripristina calcolo automatico
                </Button>
              ) : null}
              <Button type="submit" disabled={pending}>
                {save.isPending ? "Salvataggio…" : "Salva"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
