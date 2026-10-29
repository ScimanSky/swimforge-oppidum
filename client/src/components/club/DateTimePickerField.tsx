import { useId, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const pad2 = (value: number) => String(value).padStart(2, "0");

/** «2026-10-30T10:47» (local, as a datetime-local input) of a date. */
export function toDateTimeLocalString(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** The date of a «2026-10-30T10:47» value, null when empty or invalid. */
export function parseDateTimeLocal(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/**
 * A date and time picked from a calendar popover. The trigger's name is the label and the chosen
 * date («Inizio, ven 30/10/2026, 10:47»); «obbligatorio» is its description, the «*» is only seen.
 */
export function DateTimePickerField({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
}) {
  const selected = parseDateTimeLocal(value);
  const [open, setOpen] = useState(false);
  const triggerId = useId();
  const labelId = useId();
  const valueId = useId();
  const requiredId = useId();
  const timeInputId = useId();

  const applyDate = (nextDate: Date | undefined) => {
    if (!nextDate) return;
    const base = selected ?? new Date();
    const merged = new Date(nextDate);
    merged.setHours(base.getHours(), base.getMinutes(), 0, 0);
    onChange(toDateTimeLocalString(merged));
  };

  const applyTime = (time: string) => {
    const [hh, mm] = time.split(":").map((part) => Number(part));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return;
    const base = selected ?? new Date();
    const next = new Date(base);
    next.setHours(hh, mm, 0, 0);
    onChange(toDateTimeLocalString(next));
  };

  const formattedLabel = selected
    ? selected.toLocaleString("it-IT", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Seleziona data e ora";

  return (
    <div className="space-y-1">
      {/* htmlFor keeps a click on the label opening the picker; the name comes from aria-labelledby. */}
      <Label id={labelId} htmlFor={triggerId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      {required ? (
        <span id={requiredId} hidden>
          Obbligatorio
        </span>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={triggerId}
            type="button"
            variant="outline"
            aria-labelledby={`${labelId} ${valueId}`}
            aria-describedby={required ? requiredId : undefined}
            className="w-full justify-start font-normal"
          >
            <CalendarIcon aria-hidden />
            <span id={valueId} className="truncate">
              {formattedLabel}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <div className="space-y-3">
            <Calendar mode="single" selected={selected ?? undefined} onSelect={applyDate} initialFocus />
            <div className="space-y-1">
              <Label htmlFor={timeInputId}>Ora</Label>
              <Input
                id={timeInputId}
                type="time"
                value={selected ? `${pad2(selected.getHours())}:${pad2(selected.getMinutes())}` : "09:00"}
                onChange={(e) => applyTime(e.target.value)}
              />
            </div>
            <div className="flex justify-between gap-2">
              {!required ? (
                <Button type="button" variant="outline" size="sm" onClick={() => onChange("")}>
                  Rimuovi
                </Button>
              ) : (
                <span />
              )}
              <Button type="button" size="sm" onClick={() => setOpen(false)}>
                Conferma
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
