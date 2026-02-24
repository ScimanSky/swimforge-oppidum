import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { UI_FEATURE_FLAGS } from "@/lib/feature-flags";
import { toast } from "sonner";
import { ArrowLeft, Calendar as CalendarIcon, Check, Copy, Database, Flag, Plus, RefreshCw, Shield, Users, Sparkles } from "lucide-react";

type MeetForm = {
  name: string;
  venue: string;
  startDate: string;
  endDate: string;
  registrationDeadline: string;
  notes: string;
};

type EventForm = {
  title: string;
  description: string;
  eventType: "training" | "race" | "social" | "meeting";
  location: string;
  startTime: string;
  endTime: string;
  maxAttendees: string;
};

type WorkoutFocus = "tecnica" | "aerobico" | "soglia" | "velocita" | "recupero";
type WorkoutStroke = "sl" | "do" | "ra" | "de" | "mx";
type WorkoutEquipment = "pinne" | "palette" | "pull" | "tavoletta" | "snorkel";

type WorkoutDirectivesForm = {
  focus: WorkoutFocus[];
  volume: "light" | "medium" | "high" | "very_high";
  intensity: "easy" | "mixed" | "hard";
  strokeMix: WorkoutStroke[];
  equipment: WorkoutEquipment[];
  sessionMinutes: 45 | 60 | 75 | 90;
  notes: string;
};

const WORKOUT_FOCUS_OPTIONS: Array<{ value: WorkoutFocus; label: string }> = [
  { value: "tecnica", label: "Tecnica" },
  { value: "aerobico", label: "Aerobico" },
  { value: "soglia", label: "Soglia" },
  { value: "velocita", label: "Velocità" },
  { value: "recupero", label: "Recupero" },
];

const WORKOUT_STROKE_OPTIONS: Array<{ value: WorkoutStroke; label: string }> = [
  { value: "sl", label: "Stile Libero" },
  { value: "do", label: "Dorso" },
  { value: "ra", label: "Rana" },
  { value: "de", label: "Delfino" },
  { value: "mx", label: "Misti" },
];

const WORKOUT_EQUIPMENT_OPTIONS: Array<{ value: WorkoutEquipment; label: string }> = [
  { value: "pinne", label: "Pinne" },
  { value: "palette", label: "Palette" },
  { value: "pull", label: "Pull buoy" },
  { value: "tavoletta", label: "Tavoletta" },
  { value: "snorkel", label: "Snorkel" },
];

function parseDateTimeLocal(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toDateTimeLocalString(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function DateTimePickerField({
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
  const timeInputId = `coach-meet-time-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

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
      <Label>
        {label}
        {required ? " *" : ""}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline-neon" className="w-full justify-start font-normal">
            <CalendarIcon className="mr-2 h-4 w-4" />
            <span className="truncate">{formattedLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <div className="space-y-3">
            <Calendar
              mode="single"
              selected={selected ?? undefined}
              onSelect={applyDate}
              initialFocus
            />
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
                <Button
                  type="button"
                  variant="outline-neon"
                  size="sm"
                  onClick={() => onChange("")}
                >
                  Rimuovi
                </Button>
              ) : (
                <span />
              )}
              <Button type="button" variant="neon" size="sm" onClick={() => setOpen(false)}>
                Conferma
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

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

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function toggleMultiSelect<T extends string>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function InviteRow({ invite }: { invite: any }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/community/invite/${invite.code}`;

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-card/35 p-2 text-sm">
      <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{link}</code>
      <span className="text-xs text-muted-foreground">
        {invite.usedCount}/{invite.maxUses}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => {
          navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  );
}

export default function ClubCoachModeration() {
  const clubMeetsV1Enabled = UI_FEATURE_FLAGS.clubMeetsV1;
  const clubHistoryV1Enabled = UI_FEATURE_FLAGS.clubHistoryV1;
  const [match, params] = useRoute("/community/club/:id/coach");
  const clubId = Number(params?.id);
  const utils = trpc.useUtils();

  const [meetForm, setMeetForm] = useState<MeetForm>({
    name: "",
    venue: "",
    startDate: "",
    endDate: "",
    registrationDeadline: "",
    notes: "",
  });
  const [eventForm, setEventForm] = useState<EventForm>({
    title: "",
    description: "",
    eventType: "training",
    location: "",
    startTime: "",
    endTime: "",
    maxAttendees: "",
  });
  const [workoutSessionDate, setWorkoutSessionDate] = useState(() => toDateInputValue(new Date()));
  const [workoutDirectives, setWorkoutDirectives] = useState<WorkoutDirectivesForm>({
    focus: ["tecnica"],
    volume: "medium",
    intensity: "mixed",
    strokeMix: ["sl"],
    equipment: [],
    sessionMinutes: 60,
    notes: "",
  });
  const [generatedWorkoutPreview, setGeneratedWorkoutPreview] = useState<any | null>(null);

  const clubQuery = trpc.community.clubs.get.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) }
  );
  const isCoachStaffFromQuery = ["coach", "owner", "admin", "moderator"].includes(
    String((clubQuery.data as any)?.member_role ?? "")
  );
  const meetsQuery = trpc.community.clubs.meets.list.useQuery(
    { clubId },
    { enabled: clubMeetsV1Enabled && match && Number.isFinite(clubId) }
  );
  const invitesQuery = trpc.community.clubs.invites.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) }
  );
  const historyConfigQuery = trpc.community.clubs.history.config.get.useQuery(
    { clubId },
    { enabled: clubHistoryV1Enabled && match && Number.isFinite(clubId) }
  );
  const historyLastRunQuery = trpc.community.clubs.history.import.lastRun.useQuery(
    { clubId },
    { enabled: clubHistoryV1Enabled && match && Number.isFinite(clubId) && Boolean((historyConfigQuery.data as any)?.enabled) }
  );
  const workoutGenerationStatusQuery = trpc.community.clubs.workouts.coach.generationStatus.useQuery(
    { clubId, sessionDate: workoutSessionDate },
    { enabled: match && Number.isFinite(clubId) && workoutSessionDate.length === 10 && isCoachStaffFromQuery }
  );
  const workoutByDateQuery = trpc.community.clubs.workouts.coach.getByDate.useQuery(
    { clubId, sessionDate: workoutSessionDate },
    { enabled: match && Number.isFinite(clubId) && workoutSessionDate.length === 10 && isCoachStaffFromQuery }
  );

  const createMeetMutation = trpc.community.clubs.meets.create.useMutation({
    onSuccess: (payload: any) => {
      toast.success("Convocazione gara creata");
      setMeetForm({
        name: "",
        venue: "",
        startDate: "",
        endDate: "",
        registrationDeadline: "",
        notes: "",
      });
      utils.community.clubs.meets.list.invalidate({ clubId });
      const meetId = Number(payload?.meet?.id);
      if (Number.isFinite(meetId)) {
        window.location.href = `/community/club/${clubId}/meet/${meetId}`;
      }
    },
    onError: (error) => {
      toast.error(error.message || "Errore durante creazione convocazione");
    },
  });

  const createEventMutation = trpc.community.clubs.events.create.useMutation({
    onSuccess: () => {
      toast.success("Evento creato");
      setEventForm({
        title: "",
        description: "",
        eventType: "training",
        location: "",
        startTime: "",
        endTime: "",
        maxAttendees: "",
      });
      utils.community.clubs.events.list.invalidate({ clubId, status: "active", fromDate: new Date().toISOString(), limit: 8 });
    },
    onError: (error) => {
      toast.error(error.message || "Errore creazione evento");
    },
  });

  const createInviteMutation = trpc.community.clubs.createInvite.useMutation({
    onSuccess: () => {
      toast.success("Invito creato");
      invitesQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Errore creazione invito");
    },
  });

  const startHistoryImportMutation = trpc.community.clubs.history.import.start.useMutation({
    onSuccess: () => {
      toast.success("Import storico completato");
      historyLastRunQuery.refetch();
      utils.community.clubs.history.athletes.list.invalidate({ clubId });
      utils.community.clubs.history.meets.list.invalidate({ clubId });
    },
    onError: (error) => {
      toast.error(error.message || "Import storico non riuscito");
    },
  });
  const generateWorkoutDraftMutation = trpc.community.clubs.workouts.coach.generateDraft.useMutation({
    onSuccess: (payload: any) => {
      toast.success(payload?.generation?.status === "partial" ? "Allenamento generato (fallback AI)" : "Allenamento generato con AI");
      toast.info("Bozza salvata. Pubblica il workout per notificare i membri del club.");
      setGeneratedWorkoutPreview(payload?.workout ?? null);
      void workoutGenerationStatusQuery.refetch();
      void workoutByDateQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Generazione allenamento non riuscita");
      void workoutGenerationStatusQuery.refetch();
    },
  });
  const publishWorkoutMutation = trpc.community.clubs.workouts.coach.publish.useMutation({
    onSuccess: (payload: any) => {
      const changed = Boolean(payload?.changed);
      const notified = Number(payload?.notifiedCount ?? 0);
      toast.success(changed ? `Workout pubblicato. Notificati ${notified} membri.` : "Workout già pubblicato.");
      setGeneratedWorkoutPreview(payload?.workout ?? null);
      void workoutByDateQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Pubblicazione workout non riuscita");
    },
  });

  const club = clubQuery.data as any | undefined;
  const isMember = Boolean(club?.is_member);
  const role = String(club?.member_role ?? "");
  const isCoachStaff = ["coach", "owner", "admin", "moderator"].includes(role);
  const meetItems = ((meetsQuery.data as any)?.meets as any[]) ?? [];
  const historyConfig = historyConfigQuery.data as any | undefined;
  const historyLastRun = historyLastRunQuery.data as any | undefined;
  const historyEnabled = Boolean(historyConfig?.enabled);
  const workoutGenerationStatus = workoutGenerationStatusQuery.data as any | undefined;
  const persistedWorkoutPreview = (workoutByDateQuery.data as any)?.workout ?? null;
  const workoutPreview = generatedWorkoutPreview ?? persistedWorkoutPreview;
  const workoutCanGenerate = workoutGenerationStatusQuery.isSuccess
    ? Boolean(workoutGenerationStatus?.canGenerate)
    : false;
  const workoutCooldownLabel = useMemo(() => {
    if (workoutCanGenerate) return null;
    const next = workoutGenerationStatus?.nextAvailableAt;
    if (!next) return null;
    const parsed = new Date(next);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [workoutCanGenerate, workoutGenerationStatus?.nextAvailableAt]);
  const workoutPreviewPlan = useMemo(() => {
    const raw = workoutPreview?.workoutJson;
    if (!raw) return null;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    if (typeof raw === "object") return raw;
    return null;
  }, [workoutPreview?.workoutJson]);
  const workoutWhatsappLink = useMemo(() => {
    if (!workoutPreview) return null;
    const title = String(workoutPreviewPlan?.title ?? workoutPreview.title ?? "Workout vasca");
    const sessionDate = String(workoutPreview.sessionDate ?? workoutSessionDate);
    const distance = String(workoutPreviewPlan?.totalDistance ?? "n/d");
    const text = [
      `Workout club ${club?.name ?? ""}`.trim(),
      `${title}`,
      `Data: ${sessionDate}`,
      `Distanza: ${distance}`,
      `Apri SwimForge: ${typeof window !== "undefined" ? `${window.location.origin}/community/club/${clubId}` : `/community/club/${clubId}`}`,
    ].join("\n");
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }, [workoutPreview, workoutPreviewPlan?.title, workoutPreviewPlan?.totalDistance, workoutSessionDate, club?.name, clubId]);

  const handlePrintWorkout = () => {
    if (!workoutPreview) return;
    const title = String(workoutPreviewPlan?.title ?? workoutPreview.title ?? "Workout");
    const description = String(workoutPreviewPlan?.description ?? workoutPreview.description ?? "");
    const blocks = Array.isArray(workoutPreviewPlan?.blocks) ? workoutPreviewPlan.blocks : [];
    const notes = Array.isArray(workoutPreviewPlan?.coachNotes) ? workoutPreviewPlan.coachNotes : [];
    const blockHtml = blocks
      .map((block: any) => {
        const items = Array.isArray(block?.items) ? block.items : [];
        const itemsHtml = items
          .map((item: any) => {
            const parts = [
              item?.distance ? `Distanza ${item.distance}` : null,
              item?.reps ? `Rip ${item.reps}` : null,
              item?.rest ? `Rec ${item.rest}` : null,
              item?.intensity ? `Int ${item.intensity}` : null,
            ].filter(Boolean);
            return `<li><strong>${escapeHtml(String(item?.label ?? "Esercizio"))}</strong>${parts.length ? ` — ${escapeHtml(parts.join(" • "))}` : ""}</li>`;
          })
          .join("");
        return `<section><h3>${escapeHtml(String(block?.label ?? "Blocco"))}</h3><ul>${itemsHtml}</ul></section>`;
      })
      .join("");
    const notesHtml = notes.length
      ? `<section><h3>Note Coach</h3><ul>${notes.map((note: any) => `<li>${escapeHtml(String(note))}</li>`).join("")}</ul></section>`
      : "";
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1,h2,h3{margin:0 0 8px}section{margin:14px 0}ul{margin:6px 0 0 18px}</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><p><strong>Data:</strong> ${escapeHtml(String(workoutPreview.sessionDate ?? workoutSessionDate))}</p>${blockHtml}${notesHtml}</body></html>`;
    const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!win) {
      toast.error("Popup bloccato dal browser: abilita le finestre per stampare.");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  useEffect(() => {
    setGeneratedWorkoutPreview(null);
  }, [workoutSessionDate]);

  const meetStatusLabel = useMemo(
    () =>
      ({
        draft: "Bozza",
        published: "Pubblicata",
        open: "Iscrizioni aperte",
        closed: "Iscrizioni chiuse",
        completed: "Completata",
        cancelled: "Annullata",
      }) as Record<string, string>,
    []
  );

  if (!match || !Number.isFinite(clubId)) return null;

  if (clubQuery.isLoading) {
    return (
      <AppLayout>
        <div className="container py-6">
          <div className="surface-panel p-6 text-center text-muted-foreground">Caricamento area coach...</div>
        </div>
      </AppLayout>
    );
  }

  if (!club || !isMember) {
    return (
      <AppLayout>
        <div className="container py-6">
          <div className="surface-panel p-6 text-center text-muted-foreground">
            Devi essere iscritto al club per accedere a questa area.
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!isCoachStaff) {
    return (
      <AppLayout>
        <div className="container py-6 space-y-4">
          <Link href={`/community/club/${clubId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Torna al club
          </Link>
          <div className="surface-panel p-6 text-center">
            <Shield className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Questa pagina è riservata a coach e staff.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Link href={`/community/club/${clubId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Torna al club
            </Link>
            <h1 className="mt-1 text-2xl font-display font-bold">Area Coach • {club.name}</h1>
            <p className="text-sm text-muted-foreground">Moderazione club separata dal feed pubblico.</p>
          </div>
          <Badge variant="outline">{role}</Badge>
        </div>

        {clubMeetsV1Enabled ? (
          <section className="surface-panel p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Convocazioni Gare</h2>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <Label>Nome meeting *</Label>
                <Input value={meetForm.name} onChange={(e) => setMeetForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <Label>Impianto</Label>
                <Input value={meetForm.venue} onChange={(e) => setMeetForm((p) => ({ ...p, venue: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <DateTimePickerField
                label="Inizio"
                required
                value={meetForm.startDate}
                onChange={(next) => setMeetForm((p) => ({ ...p, startDate: next }))}
              />
              <DateTimePickerField
                label="Fine"
                required
                value={meetForm.endDate}
                onChange={(next) => setMeetForm((p) => ({ ...p, endDate: next }))}
              />
              <DateTimePickerField
                label="Deadline iscrizioni"
                required
                value={meetForm.registrationDeadline}
                onChange={(next) => setMeetForm((p) => ({ ...p, registrationDeadline: next }))}
              />
            </div>
            <div>
              <Label>Note</Label>
              <Textarea rows={3} value={meetForm.notes} onChange={(e) => setMeetForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <Button
              className="w-full sm:w-auto"
              variant="neon"
              disabled={createMeetMutation.isPending}
              onClick={() => {
                const start = parseDateTimeLocal(meetForm.startDate);
                const end = parseDateTimeLocal(meetForm.endDate);
                const deadline = parseDateTimeLocal(meetForm.registrationDeadline);
                if (!meetForm.name.trim()) return toast.error("Inserisci nome meeting");
                if (!start || !end || !deadline) return toast.error("Compila date meeting e deadline");
                if (end <= start) return toast.error("La fine meeting deve essere dopo l'inizio");
                if (deadline >= start) return toast.error("La deadline deve essere prima dell'inizio");
                createMeetMutation.mutate({
                  clubId,
                  name: meetForm.name.trim(),
                  venue: meetForm.venue.trim() || null,
                  startDate: start.toISOString(),
                  endDate: end.toISOString(),
                  registrationDeadline: deadline.toISOString(),
                  notes: meetForm.notes.trim() || null,
                  timezone: "Europe/Rome",
                });
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {createMeetMutation.isPending ? "Creazione..." : "Crea convocazione"}
            </Button>

            {meetItems.length > 0 ? (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ultime convocazioni</p>
                {meetItems.slice(0, 5).map((item: any) => {
                  const meet = item.meet ?? item;
                  const status = String(meet.status ?? "draft");
                  return (
                    <Link
                      key={meet.id}
                      href={`/community/club/${clubId}/meet/${meet.id}`}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-card/35 px-3 py-2 transition-colors hover:bg-card/55"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{meet.name}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(meet.startDate)}</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                        {meetStatusLabel[status] ?? status}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="surface-panel p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Allenamenti in vasca (AI)</h2>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <div>
              <Label>Data allenamento *</Label>
              <Input
                type="date"
                value={workoutSessionDate}
                onChange={(e) => setWorkoutSessionDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Volume</Label>
              <Select
                value={workoutDirectives.volume}
                onValueChange={(value) => setWorkoutDirectives((prev) => ({ ...prev, volume: value as WorkoutDirectivesForm["volume"] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Leggero</SelectItem>
                  <SelectItem value="medium">Medio</SelectItem>
                  <SelectItem value="high">Alto</SelectItem>
                  <SelectItem value="very_high">Molto alto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Intensità</Label>
              <Select
                value={workoutDirectives.intensity}
                onValueChange={(value) => setWorkoutDirectives((prev) => ({ ...prev, intensity: value as WorkoutDirectivesForm["intensity"] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Facile</SelectItem>
                  <SelectItem value="mixed">Mista</SelectItem>
                  <SelectItem value="hard">Dura</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Focus</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {WORKOUT_FOCUS_OPTIONS.map((option) => (
                <label key={option.value} className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card/25 px-2 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={workoutDirectives.focus.includes(option.value)}
                    onChange={() =>
                      setWorkoutDirectives((prev) => ({
                        ...prev,
                        focus: toggleMultiSelect(prev.focus, option.value),
                      }))
                    }
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>Mix stili</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {WORKOUT_STROKE_OPTIONS.map((option) => (
                <label key={option.value} className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card/25 px-2 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={workoutDirectives.strokeMix.includes(option.value)}
                    onChange={() =>
                      setWorkoutDirectives((prev) => ({
                        ...prev,
                        strokeMix: toggleMultiSelect(prev.strokeMix, option.value),
                      }))
                    }
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <Label>Attrezzi ammessi</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {WORKOUT_EQUIPMENT_OPTIONS.map((option) => (
                  <label key={option.value} className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card/25 px-2 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={workoutDirectives.equipment.includes(option.value)}
                      onChange={() =>
                        setWorkoutDirectives((prev) => ({
                          ...prev,
                          equipment: toggleMultiSelect(prev.equipment, option.value),
                        }))
                      }
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>Durata sessione</Label>
              <Select
                value={String(workoutDirectives.sessionMinutes)}
                onValueChange={(value) => setWorkoutDirectives((prev) => ({ ...prev, sessionMinutes: Number(value) as WorkoutDirectivesForm["sessionMinutes"] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="45">45 min</SelectItem>
                  <SelectItem value="60">60 min</SelectItem>
                  <SelectItem value="75">75 min</SelectItem>
                  <SelectItem value="90">90 min</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Nota coach (opzionale)</Label>
            <Textarea
              rows={2}
              value={workoutDirectives.notes}
              onChange={(e) => setWorkoutDirectives((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Es. gruppo numeroso, priorità tecnica virate"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="w-full sm:w-auto"
              variant="neon"
              disabled={
                generateWorkoutDraftMutation.isPending ||
                !workoutCanGenerate ||
                !workoutSessionDate ||
                workoutDirectives.focus.length === 0 ||
                workoutDirectives.strokeMix.length === 0
              }
              onClick={() =>
                generateWorkoutDraftMutation.mutate({
                  clubId,
                  sessionDate: workoutSessionDate,
                  directives: {
                    focus: workoutDirectives.focus,
                    volume: workoutDirectives.volume,
                    intensity: workoutDirectives.intensity,
                    strokeMix: workoutDirectives.strokeMix,
                    equipment: workoutDirectives.equipment,
                    sessionMinutes: workoutDirectives.sessionMinutes,
                    notes: workoutDirectives.notes.trim() || null,
                  },
                })
              }
            >
              <Sparkles className="mr-1.5 h-4 w-4" />
              {generateWorkoutDraftMutation.isPending ? "Generazione..." : "Genera workout"}
            </Button>

            {workoutCooldownLabel ? (
              <p className="text-xs text-amber-300">
                Generazione disponibile il {workoutCooldownLabel}
              </p>
            ) : workoutGenerationStatusQuery.error ? (
              <p className="text-xs text-amber-300">
                Stato cooldown non disponibile: ricarica la pagina.
              </p>
            ) : workoutGenerationStatusQuery.isFetching ? (
              <p className="text-xs text-muted-foreground">Verifica cooldown...</p>
            ) : (
              <p className="text-xs text-muted-foreground">Cooldown: 1 generazione ogni 24h per data allenamento.</p>
            )}
          </div>

          {workoutPreview ? (
            <div className="rounded-xl border border-border/60 bg-card/35 p-3 space-y-2">
              <p className="text-sm font-semibold">
                {String(workoutPreviewPlan?.title ?? workoutPreview.title ?? "Workout")}
              </p>
              <p className="text-xs text-muted-foreground">
                {String(workoutPreviewPlan?.description ?? workoutPreview.description ?? "Bozza salvata")}
              </p>
              <p className="text-xs text-muted-foreground">
                {workoutPreview.sessionDate ? `Data ${workoutPreview.sessionDate} • ` : ""}
                Stato: {workoutPreview.status}
              </p>
              <p className="text-xs text-muted-foreground">
                Blocchi: {Array.isArray(workoutPreviewPlan?.blocks) ? workoutPreviewPlan.blocks.length : 0} •
                Distanza: {String(workoutPreviewPlan?.totalDistance ?? "n/d")}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant={String(workoutPreview.status) === "published" ? "outline-neon" : "neon"}
                  disabled={publishWorkoutMutation.isPending || String(workoutPreview.status) === "published"}
                  onClick={() => publishWorkoutMutation.mutate({ workoutId: Number(workoutPreview.id) })}
                >
                  {publishWorkoutMutation.isPending
                    ? "Pubblicazione..."
                    : String(workoutPreview.status) === "published"
                      ? "Pubblicato"
                      : "Pubblica + Notifica membri"}
                </Button>
                <Button size="sm" variant="outline-neon" onClick={handlePrintWorkout}>
                  Stampa
                </Button>
                {workoutWhatsappLink ? (
                  <a href={workoutWhatsappLink} target="_blank" rel="noreferrer" className="inline-flex">
                    <Button size="sm" variant="outline-neon">Condividi WhatsApp</Button>
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        {clubHistoryV1Enabled && historyEnabled ? (
          <section className="surface-panel p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Storico Oppidum</h2>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <Link href={`/community/club/${clubId}/history/athletes`} className="w-full sm:w-auto">
                  <Button className="w-full sm:w-auto" variant="outline-neon" size="sm">Storico Atleti</Button>
                </Link>
                <Link href={`/community/club/${clubId}/history/meets`} className="w-full sm:w-auto">
                  <Button className="w-full sm:w-auto" variant="outline-neon" size="sm">Storico Meeting</Button>
                </Link>
                <Button
                  className="w-full sm:w-auto"
                  variant="neon"
                  size="sm"
                  disabled={startHistoryImportMutation.isPending}
                  onClick={() => startHistoryImportMutation.mutate({ clubId, mode: "oppidum_index_full" })}
                >
                  <RefreshCw className={`mr-1.5 h-4 w-4 ${startHistoryImportMutation.isPending ? "animate-spin" : ""}`} />
                  {startHistoryImportMutation.isPending ? "Import in corso..." : "Importa adesso"}
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-card/35 p-3 text-sm">
              <p className="text-xs text-muted-foreground">Sorgente</p>
              <p className="font-medium break-all">{String(historyConfig?.source?.rootUrl ?? "-")}</p>
            </div>

            <div className="rounded-xl border border-border/60 bg-card/35 p-3 text-sm">
              {!historyLastRun ? (
                <p className="text-muted-foreground">Nessun import storico eseguito.</p>
              ) : (
                <div className="space-y-1">
                  <p className="font-medium">
                    Ultimo run: <span className="uppercase">{String(historyLastRun.status ?? "-")}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Avvio: {formatDate(historyLastRun.startedAt)} • Pagine: {Number(historyLastRun.processedPages ?? 0)} • Record: {Number(historyLastRun.processedRecords ?? 0)} • Errori: {Number(historyLastRun.errorRecords ?? 0)}
                  </p>
                  {Array.isArray(historyLastRun.errorsJson) && historyLastRun.errorsJson.length > 0 ? (
                    <p className="text-xs text-amber-300">
                      {historyLastRun.errorsJson.slice(0, 2).map((error: any) => String(error?.message ?? error)).join(" | ")}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        ) : null}

        <section className="surface-panel p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Crea Evento Club</h2>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <Label>Titolo *</Label>
              <Input value={eventForm.title} onChange={(e) => setEventForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={eventForm.eventType} onValueChange={(value) => setEventForm((p) => ({ ...p, eventType: value as EventForm["eventType"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="training">Allenamento</SelectItem>
                  <SelectItem value="race">Gara</SelectItem>
                  <SelectItem value="social">Evento sociale</SelectItem>
                  <SelectItem value="meeting">Riunione</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Descrizione</Label>
            <Textarea rows={2} value={eventForm.description} onChange={(e) => setEventForm((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <div>
              <Label>Luogo</Label>
              <Input value={eventForm.location} onChange={(e) => setEventForm((p) => ({ ...p, location: e.target.value }))} />
            </div>
            <div>
              <Label>Inizio *</Label>
              <Input type="datetime-local" value={eventForm.startTime} onChange={(e) => setEventForm((p) => ({ ...p, startTime: e.target.value }))} />
            </div>
            <div>
              <Label>Fine</Label>
              <Input type="datetime-local" value={eventForm.endTime} onChange={(e) => setEventForm((p) => ({ ...p, endTime: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Max partecipanti</Label>
            <Input type="number" value={eventForm.maxAttendees} onChange={(e) => setEventForm((p) => ({ ...p, maxAttendees: e.target.value }))} />
          </div>
          <Button
            className="w-full sm:w-auto"
            variant="neon"
            disabled={createEventMutation.isPending}
            onClick={() => {
              if (!eventForm.title.trim()) return toast.error("Inserisci titolo evento");
              const start = parseDateTimeLocal(eventForm.startTime);
              if (!start) return toast.error("Data inizio non valida");
              const end = parseDateTimeLocal(eventForm.endTime);
              if (end && end <= start) return toast.error("La fine deve essere dopo l'inizio");
              createEventMutation.mutate({
                clubId,
                title: eventForm.title.trim(),
                description: eventForm.description.trim() || undefined,
                eventType: eventForm.eventType,
                location: eventForm.location.trim() || undefined,
                startTime: start.toISOString(),
                endTime: end?.toISOString(),
                maxAttendees: eventForm.maxAttendees ? Number(eventForm.maxAttendees) : undefined,
              });
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {createEventMutation.isPending ? "Creazione..." : "Crea evento"}
          </Button>
        </section>

        <section className="surface-panel p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Inviti Club</h2>
          </div>
          <Button
            className="w-full sm:w-auto"
            variant="neon"
            disabled={createInviteMutation.isPending}
            onClick={() => createInviteMutation.mutate({ clubId, maxUses: 10 })}
          >
            {createInviteMutation.isPending ? "Generazione..." : "Genera nuovo invito"}
          </Button>
          {(invitesQuery.data as any[])?.length ? (
            <div className="space-y-2">
              {(invitesQuery.data as any[]).map((inv: any) => (
                <InviteRow key={inv.id} invite={inv} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Nessun invito attivo.</p>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
