import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Upload, Plus, Trash2, MessageCircle } from "lucide-react";

function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimeCs(value?: number | null) {
  if (!Number.isFinite(value ?? null)) return "-";
  const cs = Number(value);
  const minutes = Math.floor(cs / 6000);
  const seconds = Math.floor((cs % 6000) / 100);
  const centis = cs % 100;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

type EventDraft = {
  id?: number;
  label: string;
  programOrder: number;
  distanceMeters?: number | null;
  stroke?: string;
  gender?: string;
  masterCategory?: string;
};

type ManualResultRow = {
  meetEventId?: number;
  eventLabel?: string;
  athleteName?: string;
  athleteEmail?: string;
  finalTime?: string;
  rank?: number;
  points?: number;
  dq?: boolean;
};

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      const base64 = raw.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function ClubMeetDetail() {
  const [match, params] = useRoute("/community/club/:clubId/meet/:meetId");
  const clubId = Number(params?.clubId);
  const meetId = Number(params?.meetId);

  const [myEntriesOpen, setMyEntriesOpen] = useState(false);
  const [editingEvents, setEditingEvents] = useState<EventDraft[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [manualRows, setManualRows] = useState<ManualResultRow[]>([]);

  const utils = trpc.useUtils();
  const profileQuery = trpc.profile.get.useQuery();
  const myUserId = Number(profileQuery.data?.userId ?? 0);

  const meetQuery = trpc.community.clubs.meets.get.useQuery(
    { meetId },
    { enabled: match && Number.isFinite(meetId) },
  );
  const entriesQuery = trpc.community.clubs.meets.entries.list.useQuery(
    { meetId },
    { enabled: match && Number.isFinite(meetId) },
  );
  const resultsQuery = trpc.community.clubs.meets.results.list.useQuery(
    { meetId },
    { enabled: match && Number.isFinite(meetId) },
  );
  const statsQuery = trpc.community.clubs.meets.stats.get.useQuery(
    { meetId },
    { enabled: match && Number.isFinite(meetId) },
  );

  const waAllQuery = trpc.community.clubs.meets.communications.whatsappLink.useQuery(
    { meetId, audience: "all" },
    { enabled: false },
  );
  const waEnteredQuery = trpc.community.clubs.meets.communications.whatsappLink.useQuery(
    { meetId, audience: "entered" },
    { enabled: false },
  );
  const waStaffQuery = trpc.community.clubs.meets.communications.whatsappLink.useQuery(
    { meetId, audience: "staff" },
    { enabled: false },
  );

  const publishMutation = trpc.community.clubs.meets.publish.useMutation({
    onSuccess: () => {
      toast.success("Convocazione pubblicata");
      void Promise.all([
        utils.community.clubs.meets.get.invalidate({ meetId }),
        utils.community.clubs.meets.list.invalidate({ clubId }),
      ]);
    },
    onError: (error) => toast.error(error.message || "Errore publish"),
  });

  const openEntriesMutation = trpc.community.clubs.meets.openEntries.useMutation({
    onSuccess: () => {
      toast.success("Iscrizioni aperte");
      void Promise.all([
        utils.community.clubs.meets.get.invalidate({ meetId }),
        utils.community.clubs.meets.list.invalidate({ clubId }),
      ]);
    },
    onError: (error) => toast.error(error.message || "Errore apertura iscrizioni"),
  });

  const closeEntriesMutation = trpc.community.clubs.meets.closeEntries.useMutation({
    onSuccess: () => {
      toast.success("Iscrizioni chiuse");
      void Promise.all([
        utils.community.clubs.meets.get.invalidate({ meetId }),
        utils.community.clubs.meets.list.invalidate({ clubId }),
      ]);
    },
    onError: (error) => toast.error(error.message || "Errore chiusura iscrizioni"),
  });

  const saveEventsMutation = trpc.community.clubs.meets.events.upsertBatch.useMutation({
    onSuccess: () => {
      toast.success("Programma gare aggiornato");
      void Promise.all([
        utils.community.clubs.meets.get.invalidate({ meetId }),
        utils.community.clubs.meets.entries.list.invalidate({ meetId }),
      ]);
    },
    onError: (error) => toast.error(error.message || "Errore aggiornamento gare"),
  });

  const selfSetEntryMutation = trpc.community.clubs.meets.entries.selfSet.useMutation({
    onSuccess: () => {
      toast.success("Iscrizione aggiornata");
      void utils.community.clubs.meets.entries.list.invalidate({ meetId });
    },
    onError: (error) => toast.error(error.message || "Errore iscrizione"),
  });

  const staffSetEntryMutation = trpc.community.clubs.meets.entries.staffSet.useMutation({
    onSuccess: () => {
      void utils.community.clubs.meets.entries.list.invalidate({ meetId });
    },
    onError: (error) => toast.error(error.message || "Errore stato iscrizione"),
  });

  const importCsvMutation = trpc.community.clubs.meets.results.importCsv.useMutation({
    onSuccess: (result: any) => {
      toast.success(`Import CSV completato: ${result?.outcome?.successRows ?? 0} righe ok`);
      setCsvFile(null);
      void Promise.all([
        utils.community.clubs.meets.results.list.invalidate({ meetId }),
        utils.community.clubs.meets.stats.get.invalidate({ meetId }),
      ]);
    },
    onError: (error) => toast.error(error.message || "Import CSV fallito"),
  });

  const importManualMutation = trpc.community.clubs.meets.results.importPdfManual.useMutation({
    onSuccess: (result: any) => {
      toast.success(`Import manuale completato: ${result?.outcome?.successRows ?? 0} righe ok`);
      setManualRows([]);
      void Promise.all([
        utils.community.clubs.meets.results.list.invalidate({ meetId }),
        utils.community.clubs.meets.stats.get.invalidate({ meetId }),
      ]);
    },
    onError: (error) => toast.error(error.message || "Import manuale fallito"),
  });

  const meetPayload = meetQuery.data as any;
  const meet = meetPayload?.meet;
  const isStaff = Boolean(meetPayload?.isStaff);

  const entriesPayload = entriesQuery.data as any;
  const events = (entriesPayload?.events as any[]) ?? (meetPayload?.events as any[]) ?? [];
  const entries = (entriesPayload?.entries as any[]) ?? [];

  const groupedEntries = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const row of entries) {
      const eventId = Number(row?.eventId ?? row?.entry?.meetEventId);
      if (!Number.isFinite(eventId)) continue;
      const bucket = map.get(eventId) ?? [];
      bucket.push(row);
      map.set(eventId, bucket);
    }
    return map;
  }, [entries]);

  const myEntries = entries.filter((row: any) => Number(row?.entry?.userId) === myUserId);

  if (!match || !Number.isFinite(meetId) || !Number.isFinite(clubId)) {
    return null;
  }

  if (meetQuery.isLoading) {
    return (
      <AppLayout>
        <div className="container py-6">
          <div className="surface-panel p-6 text-center text-muted-foreground">Caricamento meeting...</div>
        </div>
      </AppLayout>
    );
  }

  if (!meet) {
    return (
      <AppLayout>
        <div className="container py-6">
          <div className="surface-panel p-6 text-center text-muted-foreground">Meeting non trovato</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container py-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <Link href={`/community/club/${clubId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Torna al club
            </Link>
            <h1 className="mt-1 text-2xl font-display font-bold">{meet.name}</h1>
            <p className="text-sm text-muted-foreground">
              {meet.venue ? `${meet.venue} • ` : ""}
              {formatDate(meet.startDate)} - {formatDate(meet.endDate)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{meet.status}</Badge>
            <Button variant="outline-neon" size="sm" onClick={() => setMyEntriesOpen(true)}>
              Le mie gare
            </Button>
          </div>
        </div>

        {isStaff ? (
          <section className="surface-panel p-3 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Controlli staff</h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline-neon" size="sm" onClick={() => publishMutation.mutate({ meetId })} disabled={publishMutation.isPending}>
                Pubblica
              </Button>
              <Button variant="outline-neon" size="sm" onClick={() => openEntriesMutation.mutate({ meetId })} disabled={openEntriesMutation.isPending}>
                Apri iscrizioni
              </Button>
              <Button variant="outline-neon" size="sm" onClick={() => closeEntriesMutation.mutate({ meetId })} disabled={closeEntriesMutation.isPending}>
                Chiudi iscrizioni
              </Button>
              <Button
                variant="outline-neon"
                size="sm"
                onClick={async () => {
                  const res = await waAllQuery.refetch();
                  const url = res.data?.url;
                  if (url) window.open(url, "_blank", "noopener,noreferrer");
                }}
              >
                <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp (tutti)
              </Button>
              <Button
                variant="outline-neon"
                size="sm"
                onClick={async () => {
                  const res = await waEnteredQuery.refetch();
                  const url = res.data?.url;
                  if (url) window.open(url, "_blank", "noopener,noreferrer");
                }}
              >
                WhatsApp (iscritti)
              </Button>
              <Button
                variant="outline-neon"
                size="sm"
                onClick={async () => {
                  const res = await waStaffQuery.refetch();
                  const url = res.data?.url;
                  if (url) window.open(url, "_blank", "noopener,noreferrer");
                }}
              >
                WhatsApp (staff)
              </Button>
            </div>
          </section>
        ) : null}

        <section className="surface-panel p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Programma gare</h2>
            {isStaff ? (
              <Button
                variant="outline-neon"
                size="sm"
                onClick={() =>
                  setEditingEvents((prev) =>
                    prev.length
                      ? prev
                      : events.map((event: any) => ({
                          id: event.id,
                          label: event.label,
                          programOrder: Number(event.programOrder ?? 0),
                          distanceMeters: event.distanceMeters,
                          stroke: event.stroke ?? "",
                          gender: event.gender ?? "",
                          masterCategory: event.masterCategory ?? "",
                        })),
                  )
                }
              >
                Modifica programma
              </Button>
            ) : null}
          </div>

          {editingEvents.length > 0 ? (
            <div className="space-y-2">
              {editingEvents.map((event, index) => (
                <div key={`${event.id ?? "new"}-${index}`} className="grid gap-2 rounded-xl border border-border/60 bg-card/30 p-2 sm:grid-cols-6">
                  <Input
                    className="sm:col-span-2"
                    value={event.label}
                    onChange={(e) =>
                      setEditingEvents((prev) =>
                        prev.map((row, rowIdx) => (rowIdx === index ? { ...row, label: e.target.value } : row)),
                      )
                    }
                    placeholder="50 SL"
                  />
                  <Input
                    type="number"
                    value={event.programOrder}
                    onChange={(e) =>
                      setEditingEvents((prev) =>
                        prev.map((row, rowIdx) => (rowIdx === index ? { ...row, programOrder: Number(e.target.value || 0) } : row)),
                      )
                    }
                    placeholder="Ordine"
                  />
                  <Input
                    type="number"
                    value={event.distanceMeters ?? ""}
                    onChange={(e) =>
                      setEditingEvents((prev) =>
                        prev.map((row, rowIdx) => (
                          rowIdx === index ? { ...row, distanceMeters: e.target.value ? Number(e.target.value) : null } : row
                        )),
                      )
                    }
                    placeholder="Distanza"
                  />
                  <Input
                    value={event.stroke ?? ""}
                    onChange={(e) =>
                      setEditingEvents((prev) =>
                        prev.map((row, rowIdx) => (rowIdx === index ? { ...row, stroke: e.target.value } : row)),
                      )
                    }
                    placeholder="Stile"
                  />
                  <div className="flex gap-2">
                    <Input
                      value={event.masterCategory ?? ""}
                      onChange={(e) =>
                        setEditingEvents((prev) =>
                          prev.map((row, rowIdx) => (rowIdx === index ? { ...row, masterCategory: e.target.value } : row)),
                        )
                      }
                      placeholder="Categoria"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingEvents((prev) => prev.filter((_, rowIdx) => rowIdx !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline-neon"
                  size="sm"
                  onClick={() =>
                    setEditingEvents((prev) => [...prev, { label: "", programOrder: prev.length + 1, stroke: "", gender: "", masterCategory: "" }])
                  }
                >
                  <Plus className="mr-1 h-4 w-4" /> Evento
                </Button>
                <Button
                  variant="neon"
                  size="sm"
                  disabled={saveEventsMutation.isPending || editingEvents.some((item) => !item.label.trim())}
                  onClick={() =>
                    saveEventsMutation.mutate({
                      meetId,
                      events: editingEvents.map((item) => ({
                        id: item.id,
                        label: item.label.trim(),
                        programOrder: item.programOrder,
                        distanceMeters: item.distanceMeters ?? null,
                        stroke: item.stroke?.trim() || null,
                        gender: item.gender?.trim() || null,
                        masterCategory: item.masterCategory?.trim() || null,
                      })),
                    })
                  }
                >
                  Salva programma
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditingEvents([])}>
                  Annulla
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessuna gara in programma</p>
              ) : (
                events.map((event: any) => {
                  const eventEntries = groupedEntries.get(Number(event.id)) ?? [];
                  const myEntry = eventEntries.find((row) => Number(row?.entry?.userId) === myUserId);
                  return (
                    <div key={event.id} className="rounded-xl border border-border/60 bg-card/35 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">{event.label}</p>
                          <p className="text-xs text-muted-foreground">
                            Ordine {event.programOrder} • {event.distanceMeters ? `${event.distanceMeters}m` : "distanza n/d"} {event.stroke ?? ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{eventEntries.length} iscritti</Badge>
                          {meet.status === "open" ? (
                            myEntry?.entry?.status === "pending" || myEntry?.entry?.status === "confirmed" ? (
                              <Button
                                variant="outline-neon"
                                size="sm"
                                onClick={() => selfSetEntryMutation.mutate({ meetEventId: event.id, status: "withdrawn" })}
                              >
                                Ritirati
                              </Button>
                            ) : (
                              <Button
                                variant="neon"
                                size="sm"
                                onClick={() => selfSetEntryMutation.mutate({ meetEventId: event.id, status: "pending" })}
                              >
                                Iscrivimi
                              </Button>
                            )
                          ) : null}
                        </div>
                      </div>

                      {eventEntries.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {eventEntries.map((row: any) => (
                            <div key={row.entry.id} className="flex flex-wrap items-center justify-between rounded-lg border border-border/60 bg-background/30 px-2 py-1.5 text-sm">
                              <span>
                                {row.user?.username || row.user?.name || row.user?.email} • {row.entry.status}
                                {row.entry.seedTimeCs ? ` • seed ${formatTimeCs(row.entry.seedTimeCs)}` : ""}
                              </span>
                              {isStaff ? (
                                <select
                                  className="rounded border border-border bg-background px-1 py-0.5 text-xs"
                                  value={row.entry.status}
                                  onChange={(e) =>
                                    staffSetEntryMutation.mutate({
                                      entryId: row.entry.id,
                                      status: e.target.value as any,
                                    })
                                  }
                                >
                                  <option value="pending">pending</option>
                                  <option value="confirmed">confirmed</option>
                                  <option value="waitlist">waitlist</option>
                                  <option value="rejected">rejected</option>
                                  <option value="withdrawn">withdrawn</option>
                                </select>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>

        {isStaff ? (
          <section className="surface-panel p-3 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Import risultati</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="file" accept=".csv,text/csv" onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)} />
              <Button
                variant="outline-neon"
                size="sm"
                disabled={!csvFile || importCsvMutation.isPending}
                onClick={async () => {
                  if (!csvFile) return;
                  try {
                    const csvBase64 = await fileToBase64(csvFile);
                    importCsvMutation.mutate({
                      meetId,
                      csvBase64,
                      sourceFilename: csvFile.name,
                    });
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Errore lettura file CSV");
                  }
                }}
              >
                <Upload className="mr-1 h-4 w-4" /> Import CSV
              </Button>
            </div>

            <div className="space-y-2 rounded-xl border border-border/60 bg-card/30 p-2">
              <p className="text-xs text-muted-foreground">Import manuale (supporto da PDF)</p>
              {manualRows.map((row, index) => (
                <div key={`manual-${index}`} className="grid gap-2 sm:grid-cols-6">
                  <Input
                    value={row.eventLabel ?? ""}
                    onChange={(e) =>
                      setManualRows((prev) => prev.map((item, idx) => (idx === index ? { ...item, eventLabel: e.target.value } : item)))
                    }
                    placeholder="Evento"
                  />
                  <Input
                    value={row.athleteName ?? ""}
                    onChange={(e) =>
                      setManualRows((prev) => prev.map((item, idx) => (idx === index ? { ...item, athleteName: e.target.value } : item)))
                    }
                    placeholder="Atleta"
                  />
                  <Input
                    value={row.athleteEmail ?? ""}
                    onChange={(e) =>
                      setManualRows((prev) => prev.map((item, idx) => (idx === index ? { ...item, athleteEmail: e.target.value } : item)))
                    }
                    placeholder="Email"
                  />
                  <Input
                    value={row.finalTime ?? ""}
                    onChange={(e) =>
                      setManualRows((prev) => prev.map((item, idx) => (idx === index ? { ...item, finalTime: e.target.value } : item)))
                    }
                    placeholder="1:05.32"
                  />
                  <Input
                    type="number"
                    value={row.rank ?? ""}
                    onChange={(e) =>
                      setManualRows((prev) => prev.map((item, idx) => (idx === index ? { ...item, rank: e.target.value ? Number(e.target.value) : undefined } : item)))
                    }
                    placeholder="Rank"
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={row.points ?? ""}
                      onChange={(e) =>
                        setManualRows((prev) => prev.map((item, idx) => (idx === index ? { ...item, points: e.target.value ? Number(e.target.value) : undefined } : item)))
                      }
                      placeholder="Punti"
                    />
                    <Button variant="ghost" size="icon" onClick={() => setManualRows((prev) => prev.filter((_, idx) => idx !== index))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <Button variant="outline-neon" size="sm" onClick={() => setManualRows((prev) => [...prev, {}])}>
                  <Plus className="mr-1 h-4 w-4" /> Riga
                </Button>
                <Button
                  variant="neon"
                  size="sm"
                  disabled={manualRows.length === 0 || importManualMutation.isPending}
                  onClick={() => importManualMutation.mutate({ meetId, rows: manualRows as any })}
                >
                  Import manuale
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        <section className="surface-panel p-3 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Classifica meeting</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border/60 bg-card/35 p-3">
              <p className="text-xs text-muted-foreground">Eventi</p>
              <p className="text-xl font-bold">{Number((statsQuery.data as any)?.totals?.events_count ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/35 p-3">
              <p className="text-xs text-muted-foreground">Iscrizioni</p>
              <p className="text-xl font-bold">{Number((statsQuery.data as any)?.totals?.entries_count ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/35 p-3">
              <p className="text-xs text-muted-foreground">Risultati</p>
              <p className="text-xl font-bold">{Number((statsQuery.data as any)?.totals?.results_count ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/35 p-3">
              <p className="text-xs text-muted-foreground">Podi</p>
              <p className="text-xl font-bold">
                {Number((statsQuery.data as any)?.totals?.gold_count ?? 0)} / {Number((statsQuery.data as any)?.totals?.silver_count ?? 0)} / {Number((statsQuery.data as any)?.totals?.bronze_count ?? 0)}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {((statsQuery.data as any)?.leaderboard as any[] | undefined)?.length ? (
              ((statsQuery.data as any).leaderboard as any[]).map((row, index) => (
                <div key={`${row.athlete_key}-${index}`} className="flex items-center justify-between rounded-xl border border-border/60 bg-card/30 px-3 py-2">
                  <div>
                    <p className="font-semibold">{row.athlete_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.races_count} gare • {row.gold}O {row.silver}A {row.bronze}B • miglioramento {formatTimeCs(Number(row.improvement_cs ?? 0))}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{Number(row.points_total ?? 0).toFixed(1)} pt</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Classifica non disponibile: importa i risultati per popolare il ranking.</p>
            )}
          </div>
        </section>

        <section className="surface-panel p-3 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Risultati gara</h2>
          {resultsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento risultati...</p>
          ) : (
            <div className="space-y-1">
              {(((resultsQuery.data as any)?.rows as any[]) ?? []).slice(0, 200).map((row: any) => (
                <div key={row.result.id} className="grid grid-cols-[minmax(0,1fr)_90px_70px_70px] gap-2 rounded-lg border border-border/60 bg-background/30 px-2 py-1.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{row.result.athleteName}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.event?.label}</p>
                  </div>
                  <div className="text-right">{row.result.isDisqualified ? "DQ" : formatTimeCs(row.result.finalTimeCs)}</div>
                  <div className="text-right">#{row.result.rank ?? "-"}</div>
                  <div className="text-right">{Number(row.result.points ?? 0).toFixed(1)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <Sheet open={myEntriesOpen} onOpenChange={setMyEntriesOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Le mie gare</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {myEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna iscrizione trovata per questo meeting.</p>
            ) : (
              myEntries.map((row: any) => (
                <div key={row.entry.id} className="rounded-xl border border-border/60 bg-card/30 p-3">
                  <p className="font-semibold">{row.eventLabel}</p>
                  <p className="text-xs text-muted-foreground">Stato: {row.entry.status}</p>
                  {row.entry.seedTimeCs ? (
                    <p className="text-xs text-muted-foreground">Seed time: {formatTimeCs(row.entry.seedTimeCs)}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
