import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { UI_FEATURE_FLAGS } from "@/lib/feature-flags";
import { getWorkoutSeriesDisplay, parseWorkoutPlan } from "@/lib/workout-plan";
import { toast } from "sonner";
import { ArrowLeft, Bot, Calendar as CalendarIcon, Check, Clock3, Copy, Database, Flag, PlayCircle, Plus, Printer, RefreshCw, Shield, Users, Sparkles } from "lucide-react";

type MeetForm = {
  name: string;
  venue: string;
  startDate: string;
  endDate: string;
  registrationDeadline: string;
  notes: string;
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
  targetDistanceMeters: number | null;
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

function formatTimeCs(value?: number | null) {
  if (!Number.isFinite(value ?? null)) return "-";
  const cs = Number(value);
  const minutes = Math.floor(cs / 6000);
  const seconds = Math.floor((cs % 6000) / 100);
  const centis = cs % 100;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

const ACTIVE_MEET_ENTRY_STATUSES = new Set(["pending", "confirmed", "waitlist"]);

type MeetRosterRow = {
  entryId: number;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  eventLabel: string;
  stroke: string;
  distance: string;
  status: string;
  seedTime: string;
};

function splitAthleteName(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return { firstName: "-", lastName: "-", fullName: "-" };
  }
  const parts = normalized.split(" ");
  if (parts.length === 1) {
    return { firstName: normalized, lastName: "-", fullName: normalized };
  }
  const firstName = parts.slice(0, -1).join(" ");
  const lastName = parts[parts.length - 1] ?? "-";
  return {
    firstName: firstName || normalized,
    lastName: lastName || "-",
    fullName: normalized,
  };
}

function getRosterAthleteName(user: any) {
  const profileLastName = String(user?.lastName ?? "").trim();
  const userName = String(user?.name ?? "").trim().replace(/\s+/g, " ");
  const username = String(user?.username ?? "").trim();
  const email = String(user?.email ?? "").trim();

  if (profileLastName) {
    let firstName = userName;
    if (firstName) {
      const firstLower = firstName.toLocaleLowerCase("it-IT");
      const lastLower = profileLastName.toLocaleLowerCase("it-IT");
      if (firstLower === lastLower) {
        firstName = "";
      } else if (firstLower.endsWith(` ${lastLower}`)) {
        firstName = firstName.slice(0, firstName.length - profileLastName.length).trim();
      }
    }
    if (!firstName) firstName = username || email || "Atleta";
    return {
      firstName,
      lastName: profileLastName,
      fullName: `${firstName} ${profileLastName}`.trim(),
    };
  }

  const athleteRaw = userName || username || email || "Atleta";
  return splitAthleteName(athleteRaw);
}

function buildMeetRosterPrintHtml(meet: any, rows: MeetRosterRow[]) {
  const rowHtml = rows
    .map(
      (row, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(row.firstName)}</td>
          <td>${escapeHtml(row.lastName)}</td>
          <td>${escapeHtml(row.eventLabel)}</td>
          <td>${escapeHtml(row.stroke)}</td>
          <td>${escapeHtml(row.distance)}</td>
          <td>${escapeHtml(row.status)}</td>
          <td>${escapeHtml(row.seedTime)}</td>
          <td>${escapeHtml(row.email)}</td>
        </tr>
      `
    )
    .join("");

  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Iscritti gare - ${escapeHtml(String(meet?.name ?? "Meeting"))}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 12mm; color: #0f172a; }
      h1 { margin: 0 0 4px; font-size: 20px; }
      p { margin: 0 0 4px; color: #475569; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border: 1px solid #cbd5e1; padding: 6px 7px; text-align: left; font-size: 12px; }
      th { background: #e2e8f0; font-weight: 700; }
      tbody tr:nth-child(even) { background: #f8fafc; }
      @page { size: A4; margin: 12mm; }
    </style>
  </head>
  <body>
    <h1>Elenco iscritti gare</h1>
    <p>${escapeHtml(String(meet?.name ?? "Meeting"))}</p>
    <p>${escapeHtml(String(meet?.venue ?? "Impianto n/d"))} • ${escapeHtml(formatDate(meet?.startDate))} - ${escapeHtml(formatDate(meet?.endDate))}</p>
    <p>Generato il ${escapeHtml(formatDate(new Date()))}</p>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Nome</th>
          <th>Cognome</th>
          <th>Gara</th>
          <th>Stile</th>
          <th>Distanza</th>
          <th>Stato</th>
          <th>Seed</th>
          <th>Email</th>
        </tr>
      </thead>
      <tbody>
        ${rowHtml || `<tr><td colspan="9">Nessun iscritto attivo.</td></tr>`}
      </tbody>
    </table>
  </body>
</html>`;
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
  const clubAiAutomationV1Enabled = UI_FEATURE_FLAGS.clubAiAutomationV1;
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
  const [selectedMeetId, setSelectedMeetId] = useState<number | null>(null);
  const [workoutSessionDate, setWorkoutSessionDate] = useState(() => toDateInputValue(new Date()));
  const [workoutDirectives, setWorkoutDirectives] = useState<WorkoutDirectivesForm>({
    focus: ["tecnica"],
    volume: "medium",
    intensity: "mixed",
    strokeMix: ["sl"],
    equipment: [],
    sessionMinutes: 60,
    targetDistanceMeters: null,
    notes: "",
  });
  const [generatedWorkoutPreview, setGeneratedWorkoutPreview] = useState<any | null>(null);
  const [aiAutomationEnabled, setAiAutomationEnabled] = useState(true);
  const [aiImageModel, setAiImageModel] = useState("");
  const [aiMotivationPrompt, setAiMotivationPrompt] = useState("");
  const [aiScanUrl, setAiScanUrl] = useState("https://www.nuotosardegna.it/category/comunicati-master/");
  const [aiManualJobType, setAiManualJobType] = useState<"scan_meets_weekly" | "generate_workouts_weekly" | "publish_workout_daily" | "post_motivation_mwf">("scan_meets_weekly");

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
  const meetEntriesQuery = trpc.community.clubs.meets.entries.list.useQuery(
    { meetId: selectedMeetId ?? -1 },
    {
      enabled:
        clubMeetsV1Enabled &&
        match &&
        Number.isFinite(clubId) &&
        selectedMeetId !== null &&
        selectedMeetId > 0 &&
        isCoachStaffFromQuery,
    }
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
  const aiCoachConfigQuery = trpc.community.clubs.aiCoach.getConfig.useQuery(
    { clubId },
    { enabled: clubAiAutomationV1Enabled && match && Number.isFinite(clubId) && isCoachStaffFromQuery }
  );
  const aiCoachRunsQuery = trpc.community.clubs.aiCoach.lastRuns.useQuery(
    { clubId, limit: 12 },
    { enabled: clubAiAutomationV1Enabled && match && Number.isFinite(clubId) && isCoachStaffFromQuery }
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

  const publishMeetMutation = trpc.community.clubs.meets.publish.useMutation({
    onSuccess: (result: any) => {
      if (result?.changed === false) {
        toast.info("Convocazione già pubblicata");
      } else {
        toast.success("Elenco iscritti pubblicato ai membri del club");
      }
      void Promise.all([
        utils.community.clubs.meets.list.invalidate({ clubId }),
        meetEntriesQuery.refetch(),
      ]);
    },
    onError: (error) => {
      toast.error(error.message || "Errore pubblicazione elenco iscritti");
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
      const warnings = Array.isArray(payload?.generation?.warnings) ? payload.generation.warnings : [];
      if (warnings.length > 0) {
        toast.warning(`Quality gate: ${String(warnings[0])}`);
      }
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
      const failed = Number(payload?.failedNotificationCount ?? 0);
      if (!changed) {
        toast.success("Workout già pubblicato.");
      } else if (failed > 0) {
        toast.warning(`Workout pubblicato. Notifiche consegnate: ${notified}, fallite: ${failed}.`);
      } else {
        toast.success(`Workout pubblicato. Notificati ${notified} membri.`);
      }
      setGeneratedWorkoutPreview(payload?.workout ?? null);
      void workoutByDateQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Pubblicazione workout non riuscita");
    },
  });
  const upsertAiCoachConfigMutation = trpc.community.clubs.aiCoach.upsertConfig.useMutation({
    onSuccess: () => {
      toast.success("Configurazione Coach AI aggiornata");
      void aiCoachConfigQuery.refetch();
      void aiCoachRunsQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Aggiornamento configurazione Coach AI non riuscito");
    },
  });
  const manualAiCoachRunMutation = trpc.community.clubs.aiCoach.manualRun.useMutation({
    onSuccess: (payload: any) => {
      toast.success(`Job ${String(payload?.run?.jobType ?? "")} completato (${String(payload?.run?.status ?? "ok")})`);
      void aiCoachRunsQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Esecuzione manuale Coach AI non riuscita");
    },
  });

  const club = clubQuery.data as any | undefined;
  const isMember = Boolean(club?.is_member);
  const role = String(club?.member_role ?? "");
  const isCoachStaff = ["coach", "owner", "admin", "moderator"].includes(role);
  const meetItems = ((meetsQuery.data as any)?.meets as any[]) ?? [];
  const normalizedMeets = useMemo(
    () =>
      meetItems
        .map((item: any) => item?.meet ?? item)
        .filter((meet: any) => Number.isFinite(Number(meet?.id))),
    [meetItems]
  );
  const selectedMeet = useMemo(
    () => normalizedMeets.find((meet: any) => Number(meet.id) === Number(selectedMeetId)) ?? null,
    [normalizedMeets, selectedMeetId]
  );
  const selectedMeetStatus = String(selectedMeet?.status ?? "draft");
  const meetEntriesPayload = meetEntriesQuery.data as any | undefined;
  const meetEntriesEvents = (meetEntriesPayload?.events as any[]) ?? [];
  const meetEntriesRows = (meetEntriesPayload?.entries as any[]) ?? [];
  const rosterRows = useMemo<MeetRosterRow[]>(() => {
    const eventMap = new Map<number, any>();
    for (const event of meetEntriesEvents) {
      const key = Number(event?.id);
      if (Number.isFinite(key)) eventMap.set(key, event);
    }

    return meetEntriesRows
      .filter((row: any) => {
        const status = String(row?.entry?.status ?? "");
        return ACTIVE_MEET_ENTRY_STATUSES.has(status);
      })
      .map((row: any) => {
        const eventId = Number(row?.eventId ?? row?.entry?.meetEventId);
        const event = eventMap.get(eventId);
        const name = getRosterAthleteName(row?.user);
        const status = String(row?.entry?.status ?? "-");
        return {
          entryId: Number(row?.entry?.id ?? 0),
          firstName: name.firstName,
          lastName: name.lastName,
          fullName: name.fullName,
          email: String(row?.user?.email ?? "-"),
          eventLabel: String(event?.label ?? row?.eventLabel ?? "Gara"),
          stroke: String(event?.stroke ?? "-"),
          distance: event?.distanceMeters ? `${Number(event.distanceMeters)}m` : "-",
          status: status === "pending" ? "In attesa" : status === "confirmed" ? "Confermata" : status === "waitlist" ? "Lista attesa" : status,
          seedTime: formatTimeCs(Number(row?.entry?.seedTimeCs)),
        } satisfies MeetRosterRow;
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "it"));
  }, [meetEntriesEvents, meetEntriesRows]);
  const historyConfig = historyConfigQuery.data as any | undefined;
  const historyLastRun = historyLastRunQuery.data as any | undefined;
  const historyEnabled = Boolean(historyConfig?.enabled);
  const aiCoachData = aiCoachConfigQuery.data as any | undefined;
  const aiCoachConfig = aiCoachData?.config as any | null | undefined;
  const aiCoachSummary = aiCoachData?.summary as any | undefined;
  const aiCoachRuns = ((aiCoachRunsQuery.data as any)?.runs as any[]) ?? [];
  const aiActorBot = aiCoachData?.actorBot as any | undefined;
  const aiActorUserId = Number(aiCoachConfig?.actorUserId ?? aiActorBot?.userId ?? 0);
  const aiSectionEnabledForClub = Boolean(aiCoachConfig?.enabled);
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
    return parseWorkoutPlan(workoutPreview?.workoutJson ?? null);
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
      `Apri SwimForge: ${
        typeof window !== "undefined"
          ? `${window.location.origin}/community/club/${clubId}/workouts/${workoutPreview.id}`
          : `/community/club/${clubId}/workouts/${workoutPreview.id}`
      }`,
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
            const label = String(item?.label ?? "").trim();
            if (!label) return "";
            const series = getWorkoutSeriesDisplay(item);
            const parts = [
              `Serie ${series.reps}`,
              `Distanza serie ${series.seriesDistance}`,
              `Ripartenza ${series.sendoff}`,
              series.betweenSetsRest ? `Recupero prima prossima serie ${series.betweenSetsRest}` : null,
              series.intensity ? `Intensità ${series.intensity}` : null,
              series.targetPace ? `Pace ${series.targetPace}` : null,
            ].filter(Boolean);
            return `<li><strong>${escapeHtml(label)}</strong>${parts.length ? ` — ${escapeHtml(parts.join(" • "))}` : ""}${
              series.notes ? `<br/><span>${escapeHtml(series.notes)}</span>` : ""
            }</li>`;
          })
          .filter((item: string) => item.length > 0)
          .join("");
        if (!itemsHtml) return "";
        return `<section><h3>${escapeHtml(String(block?.label ?? "Blocco"))}</h3><ul>${itemsHtml}</ul></section>`;
      })
      .filter((item: string) => item.length > 0)
      .join("");
    const notesHtml = notes.length
      ? `<section><h3>Note Coach</h3><ul>${notes.map((note: any) => `<li>${escapeHtml(String(note))}</li>`).join("")}</ul></section>`
      : "";
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{size:A4;margin:12mm}html,body{margin:0;padding:0;color:#111;font-family:Arial,sans-serif;font-size:13px;line-height:1.35}.sheet{max-width:760px;margin:0 auto}h1,h2,h3{margin:0 0 6px}h1{font-size:20px}h3{font-size:14px}p{margin:0 0 8px}section{margin:10px 0;break-inside:avoid-page;page-break-inside:avoid}ul{margin:4px 0 0 18px;padding:0}li{margin:2px 0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><main class="sheet"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><p><strong>Data:</strong> ${escapeHtml(String(workoutPreview.sessionDate ?? workoutSessionDate))}</p>${blockHtml || "<p>Nessun blocco disponibile.</p>"}${notesHtml}</main></body></html>`;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.top = "0";
    iframe.style.width = "794px";
    iframe.style.height = "1123px";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    const frameWindow = iframe.contentWindow;
    const frameDocument = frameWindow?.document;
    if (!frameWindow || !frameDocument) {
      document.body.removeChild(iframe);
      toast.error("Stampa non disponibile su questo browser.");
      return;
    }

    const cleanup = () => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    };

    iframe.onload = () => {
      frameWindow.onafterprint = cleanup;
      setTimeout(() => {
        try {
          frameWindow.focus();
          frameWindow.print();
        } catch {
          cleanup();
          toast.error("Stampa non disponibile su questo browser.");
        }
      }, 350);
    };

    try {
      iframe.srcdoc = html;
    } catch {
      try {
        frameDocument.open();
        frameDocument.write(html);
        frameDocument.close();
        frameWindow.onafterprint = cleanup;
        setTimeout(() => {
          try {
            frameWindow.focus();
            frameWindow.print();
          } catch {
            cleanup();
            toast.error("Stampa non disponibile su questo browser.");
          }
        }, 500);
      } catch {
        cleanup();
        toast.error("Stampa non disponibile su questo browser.");
      }
    }
  };

  useEffect(() => {
    setGeneratedWorkoutPreview(null);
  }, [workoutSessionDate]);

  useEffect(() => {
    if (!clubAiAutomationV1Enabled) return;
    if (!aiCoachData) return;
    setAiAutomationEnabled(Boolean(aiCoachConfig?.enabled));
    setAiImageModel(String(aiCoachConfig?.imageModel ?? ""));
    setAiMotivationPrompt(String(aiCoachConfig?.motivationPrompt ?? ""));
    setAiScanUrl(String(aiCoachConfig?.scanSourceUrl ?? "https://www.nuotosardegna.it/category/comunicati-master/"));
  }, [
    clubAiAutomationV1Enabled,
    aiCoachData,
    aiCoachConfig?.enabled,
    aiCoachConfig?.imageModel,
    aiCoachConfig?.motivationPrompt,
    aiCoachConfig?.scanSourceUrl,
  ]);

  useEffect(() => {
    if (!match || !Number.isFinite(clubId)) return;
    if (clubQuery.isLoading) return;
    if (!isMember) return;
    if (isCoachStaff) return;
    if (typeof window === "undefined") return;
    window.location.replace(`/community/club/${clubId}`);
  }, [match, clubId, clubQuery.isLoading, isMember, isCoachStaff]);

  useEffect(() => {
    if (!clubMeetsV1Enabled) return;
    if (normalizedMeets.length === 0) {
      setSelectedMeetId(null);
      return;
    }
    if (selectedMeetId && normalizedMeets.some((meet: any) => Number(meet.id) === selectedMeetId)) {
      return;
    }
    const nextMeetId = Number(normalizedMeets[0]?.id);
    if (Number.isFinite(nextMeetId) && nextMeetId > 0) {
      setSelectedMeetId(nextMeetId);
    }
  }, [clubMeetsV1Enabled, normalizedMeets, selectedMeetId]);

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

  const handlePrintMeetRoster = () => {
    if (!selectedMeet) return;
    if (rosterRows.length === 0) {
      toast.info("Nessun iscritto attivo da stampare.");
      return;
    }

    const html = buildMeetRosterPrintHtml(selectedMeet, rosterRows);
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.top = "0";
    iframe.style.width = "794px";
    iframe.style.height = "1123px";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    const frameWindow = iframe.contentWindow;
    const frameDocument = frameWindow?.document;
    if (!frameWindow || !frameDocument) {
      document.body.removeChild(iframe);
      toast.error("Stampa non disponibile su questo browser.");
      return;
    }

    const cleanup = () => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };

    iframe.onload = () => {
      frameWindow.onafterprint = cleanup;
      setTimeout(() => {
        try {
          frameWindow.focus();
          frameWindow.print();
        } catch {
          cleanup();
          toast.error("Stampa non disponibile su questo browser.");
        }
      }, 350);
    };

    try {
      iframe.srcdoc = html;
    } catch {
      try {
        frameDocument.open();
        frameDocument.write(html);
        frameDocument.close();
        frameWindow.onafterprint = cleanup;
        setTimeout(() => {
          try {
            frameWindow.focus();
            frameWindow.print();
          } catch {
            cleanup();
            toast.error("Stampa non disponibile su questo browser.");
          }
        }, 500);
      } catch {
        cleanup();
        toast.error("Stampa non disponibile su questo browser.");
      }
    }
  };

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
            <p className="text-sm text-muted-foreground">Accesso riservato a coach e staff. Reindirizzamento in corso...</p>
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

            {normalizedMeets.length > 0 ? (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ultime convocazioni</p>
                {normalizedMeets.slice(0, 5).map((meet: any) => {
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

            {normalizedMeets.length > 0 ? (
              <div className="space-y-3 rounded-xl border border-border/60 bg-card/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Elenco iscritti gare</p>
                  <span className="text-xs text-muted-foreground">
                    Solo coach/staff
                  </span>
                </div>
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div>
                    <Label>Seleziona convocazione</Label>
                    <Select
                      value={selectedMeetId ? String(selectedMeetId) : undefined}
                      onValueChange={(value) => setSelectedMeetId(Number(value))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona convocazione" />
                      </SelectTrigger>
                      <SelectContent>
                        {normalizedMeets.map((meet: any) => {
                          const status = String(meet.status ?? "draft");
                          const label = `${meet.name} • ${meetStatusLabel[status] ?? status}`;
                          return (
                            <SelectItem key={meet.id} value={String(meet.id)}>
                              {label}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex w-full flex-wrap gap-2 md:w-auto">
                    <Button
                      className="w-full sm:w-auto"
                      variant="outline-neon"
                      disabled={!selectedMeet || publishMeetMutation.isPending || selectedMeetStatus !== "draft"}
                      onClick={() => {
                        if (!selectedMeetId) return;
                        publishMeetMutation.mutate({ meetId: selectedMeetId });
                      }}
                    >
                      {publishMeetMutation.isPending ? "Pubblicazione..." : "Pubblica elenco iscritti"}
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
                      variant="outline-neon"
                      disabled={!selectedMeet || rosterRows.length === 0}
                      onClick={handlePrintMeetRoster}
                    >
                      <Printer className="mr-1.5 h-4 w-4" />
                      Stampa elenco
                    </Button>
                    {selectedMeet ? (
                      <Link href={`/community/club/${clubId}/meet/${selectedMeet.id}`} className="w-full sm:w-auto">
                        <Button className="w-full sm:w-auto" variant="neon">
                          Apri dettaglio meeting
                        </Button>
                      </Link>
                    ) : null}
                  </div>
                </div>

                {selectedMeet ? (
                  <div className="rounded-lg border border-border/50 bg-background/25 px-3 py-2 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">{selectedMeet.name}</p>
                    <p>
                      Stato: {meetStatusLabel[selectedMeetStatus] ?? selectedMeetStatus} • Iscritti attivi: {rosterRows.length}
                    </p>
                    {selectedMeetStatus === "draft" ? (
                      <p>La lista non è ancora visibile ai membri: usa "Pubblica elenco iscritti" quando vuoi renderla disponibile.</p>
                    ) : null}
                  </div>
                ) : null}

                {meetEntriesQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Caricamento iscritti...</p>
                ) : rosterRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessun iscritto attivo per la convocazione selezionata.</p>
                ) : (
                  <>
                    <div className="space-y-2 md:hidden">
                      {rosterRows.map((row) => (
                        <div key={row.entryId} className="rounded-lg border border-border/60 bg-background/30 p-2 text-sm">
                          <p className="font-semibold">{row.fullName}</p>
                          <p className="text-xs text-muted-foreground">{row.email}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {row.eventLabel} • {row.distance} {row.stroke !== "-" ? `• ${row.stroke}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Stato: {row.status} • Seed: {row.seedTime}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="hidden md:block overflow-x-auto rounded-lg border border-border/60">
                      <table className="min-w-full text-sm">
                        <thead className="bg-card/50 text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-2 py-2 text-left">Nome</th>
                            <th className="px-2 py-2 text-left">Cognome</th>
                            <th className="px-2 py-2 text-left">Gara</th>
                            <th className="px-2 py-2 text-left">Stile</th>
                            <th className="px-2 py-2 text-left">Distanza</th>
                            <th className="px-2 py-2 text-left">Stato</th>
                            <th className="px-2 py-2 text-left">Seed</th>
                            <th className="px-2 py-2 text-left">Email</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rosterRows.map((row) => (
                            <tr key={row.entryId} className="border-t border-border/40">
                              <td className="px-2 py-2">{row.firstName}</td>
                              <td className="px-2 py-2">{row.lastName}</td>
                              <td className="px-2 py-2">{row.eventLabel}</td>
                              <td className="px-2 py-2">{row.stroke}</td>
                              <td className="px-2 py-2">{row.distance}</td>
                              <td className="px-2 py-2">{row.status}</td>
                              <td className="px-2 py-2">{row.seedTime}</td>
                              <td className="px-2 py-2">{row.email}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
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

          <div className="grid gap-2 md:grid-cols-3">
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
            <div>
              <Label>Distanza totale target (opzionale)</Label>
              <Select
                value={workoutDirectives.targetDistanceMeters ? String(workoutDirectives.targetDistanceMeters) : "auto"}
                onValueChange={(value) =>
                  setWorkoutDirectives((prev) => ({
                    ...prev,
                    targetDistanceMeters: value === "auto" ? null : Number(value),
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="1500">1500m</SelectItem>
                  <SelectItem value="1800">1800m</SelectItem>
                  <SelectItem value="2000">2000m</SelectItem>
                  <SelectItem value="2200">2200m</SelectItem>
                  <SelectItem value="2500">2500m</SelectItem>
                  <SelectItem value="2800">2800m</SelectItem>
                  <SelectItem value="3000">3000m</SelectItem>
                  <SelectItem value="3200">3200m</SelectItem>
                  <SelectItem value="3500">3500m</SelectItem>
                  <SelectItem value="4000">4000m</SelectItem>
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
                    targetDistanceMeters: workoutDirectives.targetDistanceMeters,
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
              <p className="text-xs text-muted-foreground">Cooldown: 1 generazione ogni 24h per club (indipendente dalla data selezionata).</p>
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
              {Array.isArray(workoutPreviewPlan?.blocks) && workoutPreviewPlan.blocks.length > 0 ? (
                <div className="space-y-2 rounded-lg border border-border/60 bg-card/25 p-2">
                  {workoutPreviewPlan.blocks.map((block: any, blockIndex: number) => (
                    <div key={`coach-preview-${blockIndex}`} className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{String(block?.label ?? `Blocco ${blockIndex + 1}`)}</p>
                      <div className="space-y-1">
                        {Array.isArray(block?.items)
                          ? block.items.map((item: any, itemIndex: number) => {
                              const series = getWorkoutSeriesDisplay(item);
                              return (
                                <div key={`coach-preview-${blockIndex}-${itemIndex}`} className="rounded-md border border-border/50 bg-background/30 p-2 text-[11px]">
                                  <p className="font-medium text-foreground/90">{String(item?.label ?? "Serie")}</p>
                                  <p>Serie: {series.reps} • Distanza serie: {series.seriesDistance} • Ripartenza: {series.sendoff}</p>
                                  {series.betweenSetsRest ? <p>Recupero prima prossima serie: {series.betweenSetsRest}</p> : null}
                                </div>
                              );
                            })
                          : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
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

        {clubAiAutomationV1Enabled ? (
          <section className="surface-panel p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Coach AI Autonomo</h2>
              </div>
              <Badge variant="outline">{aiSectionEnabledForClub ? "enabled" : "disabled"}</Badge>
            </div>

            {aiCoachConfigQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Caricamento configurazione Coach AI...</p>
            ) : (
              <>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-xl border border-border/60 bg-card/35 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="coach-ai-enabled">Automazione attiva</Label>
                      <Switch
                        id="coach-ai-enabled"
                        checked={aiAutomationEnabled}
                        onCheckedChange={(checked) => setAiAutomationEnabled(Boolean(checked))}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Actor bot: {aiActorBot?.name ?? "Coach AI"} ({aiActorBot?.email ?? "-"}) • userId {aiActorUserId || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Timezone: {String(aiCoachConfig?.timezone ?? "Europe/Rome")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Run totali: {Number(aiCoachSummary?.runsCount ?? 0)} • falliti: {Number(aiCoachSummary?.failedCount ?? 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ultimo avvio: {aiCoachSummary?.lastStartedAt ? formatDate(aiCoachSummary.lastStartedAt) : "-"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-card/35 p-3 space-y-2">
                    <div>
                      <Label>Modello immagine (hint)</Label>
                      <Input
                        value={aiImageModel}
                        onChange={(e) => setAiImageModel(e.target.value)}
                        placeholder="es. nano-banana"
                      />
                    </div>
                    <div>
                      <Label>URL scansione comunicati</Label>
                      <Input
                        value={aiScanUrl}
                        onChange={(e) => setAiScanUrl(e.target.value)}
                        placeholder="https://www.nuotosardegna.it/category/comunicati-master/"
                      />
                    </div>
                    <div>
                      <Label>Prompt motivazionale extra</Label>
                      <Textarea
                        rows={2}
                        value={aiMotivationPrompt}
                        onChange={(e) => setAiMotivationPrompt(e.target.value)}
                        placeholder="Indicazioni di tono aggiuntive"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="neon"
                    disabled={upsertAiCoachConfigMutation.isPending || !Number.isFinite(aiActorUserId) || aiActorUserId <= 0}
                    onClick={() =>
                      upsertAiCoachConfigMutation.mutate({
                        clubId,
                        enabled: aiAutomationEnabled,
                        actorUserId: aiActorUserId,
                        imageModel: aiImageModel.trim() || null,
                        motivationPrompt: aiMotivationPrompt.trim() || null,
                        scanUrl: aiScanUrl.trim() || null,
                        timezone: "Europe/Rome",
                      })
                    }
                  >
                    {upsertAiCoachConfigMutation.isPending ? "Salvataggio..." : "Salva configurazione"}
                  </Button>

                  <Select value={aiManualJobType} onValueChange={(value) => setAiManualJobType(value as typeof aiManualJobType)}>
                    <SelectTrigger className="w-full sm:w-[260px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scan_meets_weekly">Scan gare settimanale</SelectItem>
                      <SelectItem value="generate_workouts_weekly">Genera workout settimanali</SelectItem>
                      <SelectItem value="publish_workout_daily">Pubblica workout giorno</SelectItem>
                      <SelectItem value="post_motivation_mwf">Post motivazionale</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline-neon"
                    disabled={manualAiCoachRunMutation.isPending}
                    onClick={() =>
                      manualAiCoachRunMutation.mutate({
                        clubId,
                        jobType: aiManualJobType,
                      })
                    }
                  >
                    <PlayCircle className="mr-1.5 h-4 w-4" />
                    {manualAiCoachRunMutation.isPending ? "Esecuzione..." : "Esegui job manuale"}
                  </Button>
                </div>

                <div className="rounded-xl border border-border/60 bg-card/35 p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ultimi run automation</p>
                  {aiCoachRuns.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nessun run registrato.</p>
                  ) : (
                    <div className="space-y-2">
                      {aiCoachRuns.map((run: any) => (
                        <div key={run.id} className="rounded-lg border border-border/50 bg-card/20 px-2 py-1.5 text-xs">
                          <p className="font-medium">
                            {String(run.jobType)} • <span className="uppercase">{String(run.status)}</span>
                          </p>
                          <p className="text-muted-foreground inline-flex items-center gap-1">
                            <Clock3 className="h-3 w-3" />
                            {formatDate(run.startedAt)} • key {String(run.scheduledKey)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        ) : null}

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
