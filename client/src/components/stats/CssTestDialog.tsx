/**
 * «Inserisci un test»: the 400/200 threshold pace test (Swim Smooth protocol). Times in m:ss,
 * checked here for their format; ranges and the 400/200 ratio are checked by the server, whose
 * Italian message is shown under the fields.
 */
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { dayKey, type CssResult } from "@shared/swimMetrics";
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
import { trpc } from "@/lib/trpc";
import { formatClock, parseMinSec } from "@/lib/swim-metrics-view";

type Field = "t400" | "t200" | "date";
type Draft = Record<Field, string>;

const FORMAT_ERROR = "Scrivi il tempo come minuti:secondi, per esempio 6:20.";
const SAVE_FAILED = "Non riesco a salvare il test. Riprova.";
const CLEAR_FAILED = "Non riesco a rimuovere il test. Riprova.";

/** The saved test when it is the current CSS, otherwise empty times and today. */
function initialDraft(current: CssResult | null): Draft {
  if (current?.source === "test" && current.testDate) {
    const time = (distance: number) => {
      const point = current.points.find((p) => p.distanceMeters === distance);
      return point ? formatClock(point.seconds) : "";
    };
    return { t400: time(400), t200: time(200), date: current.testDate };
  }
  return { t400: "", t200: "", date: dayKey(new Date()) };
}

function validate(draft: Draft): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  for (const [field, distance] of [
    ["t400", 400],
    ["t200", 200],
  ] as const) {
    if (!draft[field].trim()) errors[field] = `Inserisci il tempo sui ${distance} m.`;
    else if (parseMinSec(draft[field]) === null) errors[field] = FORMAT_ERROR;
  }
  if (!draft.date) errors.date = "Inserisci la data del test.";
  return errors;
}

/** Message of a failed request: the server's own (Italian) for invalid input, ours otherwise. */
const requestError = (error: { message: string; data?: { code?: string } | null }, fallback: string) =>
  error.data?.code === "BAD_REQUEST" && error.message ? error.message : fallback;

function TimeField({
  id,
  label,
  placeholder,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        // Digits with a separator: «6.20» is accepted where the keyboard has no «:».
        inputMode="decimal"
        autoComplete="off"
        className="tabular-nums"
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {error ?? "Minuti:secondi"}
      </p>
    </div>
  );
}

export function CssTestDialog({ current }: { current: CssResult | null }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(current));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const id = useId();
  const utils = trpc.useUtils();
  const hasTest = current?.source === "test";

  const done = (message: string) => {
    void utils.statistics.getMetrics.invalidate();
    toast.success(message);
    setOpen(false);
  };
  const save = trpc.statistics.setCssTest.useMutation({
    onSuccess: () => done("Test salvato: il passo soglia è aggiornato."),
    onError: (error) => setRequestMessage(requestError(error, SAVE_FAILED)),
  });
  const clear = trpc.statistics.clearCssTest.useMutation({
    onSuccess: () => done("Test rimosso."),
    onError: (error) => setRequestMessage(requestError(error, CLEAR_FAILED)),
  });

  const onOpenChange = (next: boolean) => {
    if (next) {
      setDraft(initialDraft(current));
      setErrors({});
      setRequestMessage(null);
    }
    setOpen(next);
  };

  const update = (field: Field) => (value: string) => setDraft((previous) => ({ ...previous, [field]: value }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found = validate(draft);
    setErrors(found);
    setRequestMessage(null);
    if (Object.keys(found).length > 0) return;
    save.mutate({
      t400Seconds: parseMinSec(draft.t400)!,
      t200Seconds: parseMinSec(draft.t200)!,
      date: draft.date,
    });
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(true)}>
        Inserisci un test
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Test del passo soglia</DialogTitle>
            <DialogDescription>
              Dopo il riscaldamento: 400 m a tutta, recupero completo (5-10 minuti facili), 200 m a tutta.
            </DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <TimeField
                id={`${id}-t400`}
                label="Tempo sui 400 m"
                placeholder="6:20"
                value={draft.t400}
                error={errors.t400}
                onChange={update("t400")}
              />
              <TimeField
                id={`${id}-t200`}
                label="Tempo sui 200 m"
                placeholder="3:00"
                value={draft.t200}
                error={errors.t200}
                onChange={update("t200")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-date`}>Data del test</Label>
              <Input
                id={`${id}-date`}
                type="date"
                value={draft.date}
                max={dayKey(new Date())}
                onChange={(event) => update("date")(event.target.value)}
                aria-invalid={errors.date ? true : undefined}
                aria-describedby={errors.date ? `${id}-date-error` : undefined}
              />
              {errors.date ? (
                <p id={`${id}-date-error`} className="text-xs text-destructive">
                  {errors.date}
                </p>
              ) : null}
            </div>
            {requestMessage ? (
              <p role="alert" className="text-sm text-destructive">
                {requestMessage}
              </p>
            ) : null}
            <DialogFooter className="gap-2">
              {hasTest ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={clear.isPending || save.isPending}
                  onClick={() => {
                    setRequestMessage(null);
                    clear.mutate();
                  }}
                >
                  Rimuovi test
                </Button>
              ) : null}
              <Button type="submit" disabled={save.isPending || clear.isPending}>
                {save.isPending ? "Salvataggio…" : "Salva il test"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
