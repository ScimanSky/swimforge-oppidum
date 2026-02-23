import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { UI_FEATURE_FLAGS } from "@/lib/feature-flags";
import { buildMeetProgramKey, MEET_PROGRAM_TEMPLATE, parseMeetEventLabel } from "@/lib/meet-program-template";
import { toast } from "sonner";
import { ArrowLeft, CheckSquare, Save } from "lucide-react";

type ExistingEvent = {
  id: number;
  label: string;
  programOrder: number;
  distanceMeters?: number | null;
  stroke?: string | null;
  gender?: string | null;
  masterCategory?: string | null;
  notes?: string | null;
};

function toSafeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function inferEventKey(event: ExistingEvent): string | null {
  const parsed = parseMeetEventLabel(String(event.label ?? ""));
  const parsedKey = buildMeetProgramKey({
    distanceMeters: parsed.distanceMeters,
    stroke: parsed.stroke,
    gender: parsed.gender,
    relayLegs: parsed.relayLegs,
  });
  if (parsed.relayLegs && parsedKey) return parsedKey;

  const direct = buildMeetProgramKey({
    distanceMeters: event.distanceMeters,
    stroke: event.stroke,
    gender: event.gender,
  });
  if (direct) return direct;

  return parsedKey;
}

export default function ClubMeetProgramBuilder() {
  const clubMeetsV1Enabled = UI_FEATURE_FLAGS.clubMeetsV1;
  const [match, params] = useRoute("/community/club/:clubId/meet/:meetId/program");
  const clubId = Number(params?.clubId);
  const meetId = Number(params?.meetId);

  const [selectedTemplate, setSelectedTemplate] = useState<Record<string, boolean>>({});
  const [templateOrder, setTemplateOrder] = useState<Record<string, number>>({});
  const [selectedExtra, setSelectedExtra] = useState<Record<number, boolean>>({});
  const [extraOrder, setExtraOrder] = useState<Record<number, number>>({});
  const [initializedForMeet, setInitializedForMeet] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const meetQuery = trpc.community.clubs.meets.get.useQuery(
    { meetId },
    { enabled: match && Number.isFinite(meetId) },
  );

  const saveEventsMutation = trpc.community.clubs.meets.events.upsertBatch.useMutation({
    onSuccess: () => {
      toast.success("Programma gare aggiornato");
      void Promise.all([
        utils.community.clubs.meets.get.invalidate({ meetId }),
        utils.community.clubs.meets.entries.list.invalidate({ meetId }),
        utils.community.clubs.meets.list.invalidate({ clubId }),
      ]);
      window.location.href = `/community/club/${clubId}/meet/${meetId}`;
    },
    onError: (error) => {
      toast.error(error.message || "Errore aggiornamento programma");
    },
  });

  const meetPayload = meetQuery.data as any;
  const meet = meetPayload?.meet;
  const isStaff = Boolean(meetPayload?.isStaff);
  const existingEvents = (((meetPayload?.events as any[]) ?? []) as ExistingEvent[])
    .map((event) => ({
      ...event,
      id: toSafeNumber(event.id),
      programOrder: toSafeNumber(event.programOrder, 0),
    }))
    .filter((event) => Number.isFinite(event.id));

  const matching = useMemo(() => {
    const keyToEvent = new Map<string, ExistingEvent>();
    const usedIds = new Set<number>();

    for (const event of existingEvents) {
      const key = inferEventKey(event);
      if (!key || keyToEvent.has(key)) continue;
      keyToEvent.set(key, event);
      usedIds.add(event.id);
    }

    const extras = existingEvents.filter((event) => !usedIds.has(event.id));

    return { keyToEvent, extras };
  }, [existingEvents]);

  useEffect(() => {
    if (!match || !Number.isFinite(meetId)) return;
    setInitializedForMeet(null);
    setSelectedTemplate({});
    setTemplateOrder({});
    setSelectedExtra({});
    setExtraOrder({});
  }, [match, meetId]);

  useEffect(() => {
    if (!match || !Number.isFinite(meetId)) return;
    if (meetQuery.isLoading) return;
    if (initializedForMeet === meetId) return;

    const nextSelectedTemplate: Record<string, boolean> = {};
    const nextTemplateOrder: Record<string, number> = {};
    for (const row of MEET_PROGRAM_TEMPLATE) {
      const existing = matching.keyToEvent.get(row.key);
      nextSelectedTemplate[row.key] = Boolean(existing);
      nextTemplateOrder[row.key] = existing?.programOrder ?? row.defaultOrder;
    }

    const nextSelectedExtra: Record<number, boolean> = {};
    const nextExtraOrder: Record<number, number> = {};
    for (const extra of matching.extras) {
      nextSelectedExtra[extra.id] = true;
      nextExtraOrder[extra.id] = extra.programOrder || 999;
    }

    setSelectedTemplate(nextSelectedTemplate);
    setTemplateOrder(nextTemplateOrder);
    setSelectedExtra(nextSelectedExtra);
    setExtraOrder(nextExtraOrder);
    setInitializedForMeet(meetId);
  }, [initializedForMeet, match, matching.extras, matching.keyToEvent, meetId, meetQuery.isLoading]);

  const maleRows = useMemo(() => MEET_PROGRAM_TEMPLATE.filter((row) => row.gender === "M"), []);
  const femaleRows = useMemo(() => MEET_PROGRAM_TEMPLATE.filter((row) => row.gender === "F"), []);

  if (!match || !Number.isFinite(clubId) || !Number.isFinite(meetId)) return null;

  if (!clubMeetsV1Enabled) {
    return (
      <AppLayout>
        <div className="container py-6">
          <div className="surface-panel p-6 text-center text-muted-foreground">Sezione gare disattivata.</div>
        </div>
      </AppLayout>
    );
  }

  if (meetQuery.isLoading) {
    return (
      <AppLayout>
        <div className="container py-6">
          <div className="surface-panel p-6 text-center text-muted-foreground">Caricamento programma gare...</div>
        </div>
      </AppLayout>
    );
  }

  if (!meet) {
    return (
      <AppLayout>
        <div className="container py-6">
          <div className="surface-panel p-6 text-center text-muted-foreground">Meeting non trovato.</div>
        </div>
      </AppLayout>
    );
  }

  if (!isStaff) {
    return (
      <AppLayout>
        <div className="container py-6 space-y-4">
          <Link href={`/community/club/${clubId}/meet/${meetId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Torna al meeting
          </Link>
          <div className="surface-panel p-6 text-center text-muted-foreground">
            Solo staff può modificare il programma gare.
          </div>
        </div>
      </AppLayout>
    );
  }

  const selectedTemplateRows = MEET_PROGRAM_TEMPLATE.filter((row) => selectedTemplate[row.key]);
  const selectedExtraRows = matching.extras.filter((row) => selectedExtra[row.id]);
  const selectedCount = selectedTemplateRows.length + selectedExtraRows.length;

  const handleSave = () => {
    const templatePayload = selectedTemplateRows.map((row) => {
      const existing = matching.keyToEvent.get(row.key);
      return {
        id: existing?.id,
        label: row.label,
        programOrder: toSafeNumber(templateOrder[row.key], row.defaultOrder),
        distanceMeters: row.distanceMeters,
        stroke: row.stroke,
        gender: row.gender,
        masterCategory: existing?.masterCategory ?? null,
        notes: existing?.notes ?? null,
      };
    });

    const extraPayload = selectedExtraRows.map((row) => ({
      id: row.id,
      label: String(row.label ?? "").trim(),
      programOrder: toSafeNumber(extraOrder[row.id], row.programOrder || 999),
      distanceMeters: row.distanceMeters ?? null,
      stroke: row.stroke ?? null,
      gender: row.gender ?? null,
      masterCategory: row.masterCategory ?? null,
      notes: row.notes ?? null,
    }));

    const payload = [...templatePayload, ...extraPayload]
      .filter((row) => row.label.length > 0)
      .sort((a, b) => a.programOrder - b.programOrder || a.label.localeCompare(b.label, "it"));

    if (payload.length === 0) {
      toast.error("Seleziona almeno una gara");
      return;
    }

    saveEventsMutation.mutate({
      meetId,
      replaceAll: true,
      events: payload,
    });
  };

  const renderTemplateGroup = (title: string, rows: typeof MEET_PROGRAM_TEMPLATE) => (
    <section className="surface-panel p-3 space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-1">
        {rows.map((row) => {
          const checked = Boolean(selectedTemplate[row.key]);
          return (
            <div key={row.key} className="grid grid-cols-[24px_minmax(0,1fr)_88px] items-center gap-2 rounded-lg border border-border/60 bg-card/30 px-2 py-1.5">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setSelectedTemplate((prev) => ({ ...prev, [row.key]: e.target.checked }))}
              />
              <span className="text-sm font-medium">{row.label}</span>
              <Input
                type="number"
                min={1}
                value={templateOrder[row.key] ?? row.defaultOrder}
                onChange={(e) => setTemplateOrder((prev) => ({ ...prev, [row.key]: Number(e.target.value || row.defaultOrder) }))}
                className="h-8"
                title="Ordine programma"
              />
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <AppLayout>
      <div className="container py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Link href={`/community/club/${clubId}/meet/${meetId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Torna al meeting
            </Link>
            <h1 className="mt-1 text-2xl font-display font-bold">Builder Programma Gare</h1>
            <p className="text-sm text-muted-foreground">Seleziona con check le gare del meeting (M/F) e salva.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{selectedCount} selezionate</Badge>
            <Button
              variant="neon"
              size="sm"
              disabled={saveEventsMutation.isPending}
              onClick={handleSave}
            >
              <Save className="mr-1.5 h-4 w-4" />
              {saveEventsMutation.isPending ? "Salvataggio..." : "Salva Programma"}
            </Button>
          </div>
        </div>

        <section className="surface-panel p-3">
          <p className="text-sm text-muted-foreground">
            Qui non devi riscrivere distanza/stile/categoria: ogni voce è già completa. Seleziona solo le gare valide per questo meeting.
          </p>
          <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-1 text-xs text-muted-foreground">
            <CheckSquare className="h-3.5 w-3.5" /> Ordine modificabile a destra
          </div>
        </section>

        <div className="grid gap-3 xl:grid-cols-2">
          {renderTemplateGroup("Programma Maschi (M)", maleRows)}
          {renderTemplateGroup("Programma Femmine (F)", femaleRows)}
        </div>

        {matching.extras.length > 0 ? (
          <section className="surface-panel p-3 space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Eventi Fuori Template</h3>
            <p className="text-xs text-muted-foreground">
              Eventi già presenti nel meeting non riconosciuti come standard. Lasciali spuntati per mantenerli.
            </p>
            <div className="space-y-1">
              {matching.extras.map((row) => (
                <div key={row.id} className="grid grid-cols-[24px_minmax(0,1fr)_88px] items-center gap-2 rounded-lg border border-border/60 bg-card/30 px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedExtra[row.id])}
                    onChange={(e) => setSelectedExtra((prev) => ({ ...prev, [row.id]: e.target.checked }))}
                  />
                  <span className="truncate text-sm font-medium">{row.label}</span>
                  <Input
                    type="number"
                    min={1}
                    value={extraOrder[row.id] ?? row.programOrder}
                    onChange={(e) => setExtraOrder((prev) => ({ ...prev, [row.id]: Number(e.target.value || row.programOrder) }))}
                    className="h-8"
                    title="Ordine programma"
                  />
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </AppLayout>
  );
}
