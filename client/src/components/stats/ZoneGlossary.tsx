/**
 * «Le zone A1–C3»: every pace zone in plain words (the owner's description, how it feels, the
 * effort on a 1–10 scale, what it trains), with the user's pace and the longest rep it allows.
 * Opened from the intensity card and from the zone chips of the AI coach's workouts, at the zone
 * that was tapped.
 */
import { useState } from "react";
import { PACE_ZONES, zoneRpeLabel, type PaceZoneCode, type PaceZoneRange } from "@shared/swimMetrics";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatZonePace, PACE_ZONE_COLOR } from "@/lib/swim-metrics-view";

const TITLE = "Le zone A1–C3";
const headingId = (code: PaceZoneCode) => `zona-${code.toLowerCase()}`;
const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;

export function ZoneGlossary({
  ranges,
  open,
  onOpenChange,
  focusZone = null,
}: {
  /** The user's zones (empty without a threshold pace or manual zones). */
  ranges: PaceZoneRange[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The zone to open at: its heading takes the focus. */
  focusZone?: PaceZoneCode | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        onOpenAutoFocus={(event) => {
          if (!focusZone) return;
          const heading = document.getElementById(headingId(focusZone));
          if (!heading) return;
          event.preventDefault();
          heading.focus();
          heading.scrollIntoView?.({ block: "start" });
        }}
      >
        <DialogHeader>
          <DialogTitle>{TITLE}</DialogTitle>
          <DialogDescription>
            Sette zone, dalla più lenta alla più esplosiva: più alta è la zona, più è intensa e più corte sono le
            ripetute. Accanto al codice c'è il livello (Facile, Aerobico, Medio, Soglia, Sopra soglia), così
            l'allenamento si segue anche senza conoscere le zone. I passi valgono per lo stile libero.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {PACE_ZONES.map((zone) => {
            const range = ranges.find((candidate) => candidate.code === zone.code);
            return (
              <section
                key={zone.code}
                aria-labelledby={headingId(zone.code)}
                className="rounded-xl bg-raised p-3 text-sm"
              >
                <h3
                  id={headingId(zone.code)}
                  tabIndex={-1}
                  className="flex items-center gap-2 font-semibold text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: PACE_ZONE_COLOR[zone.code] }} />
                  {zone.code} {zone.name} · {zone.level}
                </h3>
                <p className="mt-1 text-muted-foreground">{zone.description}</p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">Il tuo passo</dt>
                  <dd className="tabular-nums">
                    {range ? `${formatZonePace(range)} /100 m` : "serve il passo soglia o le tue zone"}
                  </dd>
                  {zone.maxRepMeters ? (
                    <>
                      <dt className="text-muted-foreground">Ripetuta massima</dt>
                      <dd className="tabular-nums">{zone.maxRepMeters} m</dd>
                    </>
                  ) : null}
                  <dt className="text-muted-foreground">Sensazione</dt>
                  <dd>{sentence(`${zone.breathing}, ${zone.talkTest}`)}</dd>
                  <dt className="text-muted-foreground">Fatica (1–10)</dt>
                  <dd className="tabular-nums">{zoneRpeLabel(zone)}</dd>
                  <dt className="text-muted-foreground">A cosa serve</dt>
                  <dd>{zone.purpose}</dd>
                </dl>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** «Le zone A1–C3» as a button that opens the glossary. */
export function ZoneGlossaryButton({ ranges }: { ranges: PaceZoneRange[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        {TITLE}
      </Button>
      <ZoneGlossary ranges={ranges} open={open} onOpenChange={setOpen} />
    </>
  );
}
