/**
 * Coach and staff area of a club: meet calls and rosters, AI pool workouts, the autonomous AI
 * coach, the Oppidum history import and invites (the shell header carries the «Club» title and
 * the back button; meets, AI automation and history are behind their feature flags).
 */

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Chip } from "@/components/corsia/Chip";
import { LoadError, LoadingSkeleton } from "@/components/corsia/LoadState";
import { ClubAccessState, ClubNotice } from "@/components/club/ClubPageState";
import { clubAccess } from "@/lib/club-access";
import {
  buildMeetRosterPrintHtml,
  buildWorkoutPrintHtml,
  formatTimeCs,
  openPrintTab,
  printInHiddenFrame,
  type MeetRosterRow,
} from "@/lib/club-print";
import { formatSessionDay } from "@/lib/club-workouts";
import { NO_VALUE, formatInteger, formatSessionDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { UI_FEATURE_FLAGS } from "@/lib/feature-flags";
import { getWorkoutSeriesDisplay, parseWorkoutPlan } from "@/lib/workout-plan";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { publicSiteUrl } from "@/lib/public-url";
import { Bot, Calendar as CalendarIcon, Check, Clock3, Copy, Database, Flag, PlayCircle, Plus, Printer, RefreshCw, Users, Sparkles } from "lucide-react";

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
  { value: "sl", label: "Stile libero" },
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

/** Who may open the coach area (server: meets, workouts and history accept coaches too). */
const COACH_AREA_ROLES = ["coach", "owner", "admin", "moderator"];
/** Club staff (server: invites and the AI coach refuse coaches). */
const CLUB_STAFF_ROLES = ["owner", "admin", "moderator"];

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietario",
  admin: "Admin",
  moderator: "Moderatore",
  coach: "Coach",
};

const WORKOUT_STATUS_LABELS: Record<string, string> = {
  draft: "Bozza",
  published: "Pubblicato",
};

const sectionTitle = "inline-flex items-center gap-2 text-[17px] font-bold";
const subTitle = "text-sm font-semibold";
/** A checkbox choice as a 44px tile; the checked one has the action border. */
const choiceTile =
  "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-raised px-3 text-sm has-[:checked]:border-action-text has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50";

/** Coach-area date shown in lists: «ven 30 ott · 10:47», «-» when missing. */
const formatDate = (value?: string | Date | null) => {
  const label = formatSessionDate(value);
  return label === NO_VALUE ? "-" : label;
};

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
  const triggerId = useId();
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
      <Label htmlFor={triggerId}>
        {label}
        {required ? " *" : ""}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={triggerId} type="button" variant="outline" className="w-full justify-start font-normal">
            <CalendarIcon aria-hidden />
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
                  variant="outline"
                  size="sm"
                  onClick={() => onChange("")}
                >
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

const ACTIVE_MEET_ENTRY_STATUSES = new Set(["pending", "confirmed", "waitlist"]);

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

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function toggleMultiSelect<T extends string>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function InviteRow({ invite }: { invite: any }) {
  const [copied, setCopied] = useState(false);
  const link = publicSiteUrl(`/community/invite/${invite.code}`);

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl bg-raised py-1 pl-3 pr-1 text-sm">
      <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{link}</code>
      <span className="text-xs text-muted-foreground tabular-nums">
        {invite.usedCount}/{invite.maxUses}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={copied ? "Link copiato" : "Copia link"}
        className="shrink-0"
        onClick={() => {
          navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </Button>
    </div>
  );
}

/** One coach-area card: icon and h3 title, optional extra on the right, content. */
function CoachSection({
  icon,
  title,
  aside,
  children,
}: {
  icon: ReactNode;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="surface-panel space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className={sectionTitle}>
          {icon}
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function ClubCoachModeration() {
  const clubMeetsV1Enabled = UI_FEATURE_FLAGS.clubMeetsV1;
  const clubHistoryV1Enabled = UI_FEATURE_FLAGS.clubHistoryV1;
  const clubAiAutomationV1Enabled = UI_FEATURE_FLAGS.clubAiAutomationV1;
  const [match, params] = useRoute("/community/club/:id/coach");
  const [, navigate] = useLocation();
  const formId = useId();
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
  const roleFromQuery = String((clubQuery.data as any)?.member_role ?? "");
  const isCoachStaffFromQuery = COACH_AREA_ROLES.includes(roleFromQuery);
  // Invites and the AI coach are for the club staff only, not for coaches (server: owner,
  // admin, moderator): not even asked for otherwise.
  const isClubStaffFromQuery = CLUB_STAFF_ROLES.includes(roleFromQuery);
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
    { enabled: match && Number.isFinite(clubId) && isClubStaffFromQuery }
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
    { enabled: clubAiAutomationV1Enabled && match && Number.isFinite(clubId) && isClubStaffFromQuery }
  );
  const aiCoachRunsQuery = trpc.community.clubs.aiCoach.lastRuns.useQuery(
    { clubId, limit: 12 },
    { enabled: clubAiAutomationV1Enabled && match && Number.isFinite(clubId) && isClubStaffFromQuery }
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
        navigate(`/community/club/${clubId}/meet/${meetId}`);
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
        toast.warning(`Controllo qualità: ${String(warnings[0])}`);
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
  const isCoachStaff = COACH_AREA_ROLES.includes(role);
  const isClubStaff = CLUB_STAFF_ROLES.includes(role);
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
    const label = formatSessionDate(next);
    return label === NO_VALUE ? null : label;
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
      `Apri SwimForge: ${publicSiteUrl(`/community/club/${clubId}/workouts/${workoutPreview.id}`)}`,
    ].join("\n");
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }, [workoutPreview, workoutPreviewPlan?.title, workoutPreviewPlan?.totalDistance, workoutSessionDate, club?.name, clubId]);

  const handlePrintWorkout = () => {
    if (!workoutPreview) return;
    const html = buildWorkoutPrintHtml({
      title: String(workoutPreviewPlan?.title ?? workoutPreview.title ?? "Workout"),
      description: String(workoutPreviewPlan?.description ?? workoutPreview.description ?? ""),
      sessionDate: String(workoutPreview.sessionDate ?? workoutSessionDate),
      plan: workoutPreviewPlan,
    });
    printInHiddenFrame(html, () => toast.error("Stampa non disponibile su questo browser."));
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
    navigate(`/community/club/${clubId}`, { replace: true });
  }, [match, clubId, clubQuery.isLoading, isMember, isCoachStaff, navigate]);

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
    if (openPrintTab(html)) return;
    printInHiddenFrame(html, () => toast.error("Stampa non disponibile su questo browser."));
  };

  if (!match || !Number.isFinite(clubId)) return null;

  const access = clubAccess(clubQuery);
  if (access !== "member") {
    return (
      <AppLayout>
        <ClubAccessState
          access={access}
          clubId={clubId}
          loadingLabel="Caricamento dell'area coach…"
          notMemberText="Devi essere iscritto al club per accedere a quest'area."
          onRetry={() => void clubQuery.refetch()}
        />
      </AppLayout>
    );
  }

  if (!isCoachStaff) {
    return (
      <AppLayout>
        <ClubNotice backHref={`/community/club/${clubId}`}>
          Accesso riservato a coach e staff. Reindirizzamento in corso...
        </ClubNotice>
      </AppLayout>
    );
  }

  const fieldId = (name: string) => `${formId}-${name}`;
  const workoutStatus = String(workoutPreview?.status ?? "");
  const workoutPublished = workoutStatus === "published";
  const invites = invitesQuery.data as any[] | undefined;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-[28px] font-bold leading-none">Area coach</h2>
            <p className="mt-1 text-sm text-muted-foreground">{club.name} · solo coach e staff</p>
          </div>
          <Chip>{ROLE_LABELS[role] ?? role}</Chip>
        </div>

        {clubMeetsV1Enabled ? (
          <CoachSection icon={<Flag className="size-4 text-action-text" aria-hidden />} title="Convocazioni gare">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={fieldId("meet-name")}>Nome meeting *</Label>
                <Input id={fieldId("meet-name")} value={meetForm.name} onChange={(e) => setMeetForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={fieldId("meet-venue")}>Impianto</Label>
                <Input id={fieldId("meet-venue")} value={meetForm.venue} onChange={(e) => setMeetForm((p) => ({ ...p, venue: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
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
                label="Scadenza iscrizioni"
                required
                value={meetForm.registrationDeadline}
                onChange={(next) => setMeetForm((p) => ({ ...p, registrationDeadline: next }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={fieldId("meet-notes")}>Note</Label>
              <Textarea id={fieldId("meet-notes")} rows={3} value={meetForm.notes} onChange={(e) => setMeetForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <Button
              className="w-full sm:w-auto"
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
              <Plus aria-hidden />
              {createMeetMutation.isPending ? "Creazione..." : "Crea convocazione"}
            </Button>

            {normalizedMeets.length > 0 ? (
              <div className="border-t border-border pt-4">
                <h4 className={subTitle}>Ultime convocazioni</h4>
                <ul className="mt-1">
                  {normalizedMeets.slice(0, 5).map((meet: any) => {
                    const status = String(meet.status ?? "draft");
                    return (
                      <li key={meet.id} className="border-t border-border first:border-t-0">
                        <Link
                          href={`/community/club/${clubId}/meet/${meet.id}`}
                          className="flex min-h-11 items-center justify-between gap-3 py-2 transition-colors hover:text-action-text"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{meet.name}</span>
                            <span className="block text-xs text-muted-foreground">{formatDate(meet.startDate)}</span>
                          </span>
                          <Chip>{meetStatusLabel[status] ?? status}</Chip>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {normalizedMeets.length > 0 ? (
              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className={subTitle}>Elenco iscritti gare</h4>
                  <span className="text-xs text-muted-foreground">Solo coach e staff</span>
                </div>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div className="space-y-1">
                    <Label htmlFor={fieldId("roster-meet")}>Convocazione</Label>
                    <Select
                      value={selectedMeetId ? String(selectedMeetId) : undefined}
                      onValueChange={(value) => setSelectedMeetId(Number(value))}
                    >
                      <SelectTrigger id={fieldId("roster-meet")} className="w-full">
                        <SelectValue placeholder="Seleziona convocazione" />
                      </SelectTrigger>
                      <SelectContent>
                        {normalizedMeets.map((meet: any) => {
                          const status = String(meet.status ?? "draft");
                          const label = `${meet.name} · ${meetStatusLabel[status] ?? status}`;
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
                      variant="outline"
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
                      variant="outline"
                      disabled={!selectedMeet || rosterRows.length === 0}
                      onClick={handlePrintMeetRoster}
                    >
                      <Printer aria-hidden />
                      Stampa elenco
                    </Button>
                    {selectedMeet ? (
                      <Button className="w-full sm:w-auto" asChild>
                        <Link href={`/community/club/${clubId}/meet/${selectedMeet.id}`}>Apri dettaglio meeting</Link>
                      </Button>
                    ) : null}
                  </div>
                </div>

                {selectedMeet ? (
                  <div className="rounded-xl bg-raised p-3 text-sm text-muted-foreground">
                    <p className="font-semibold text-foreground">{selectedMeet.name}</p>
                    <p>
                      Stato: {meetStatusLabel[selectedMeetStatus] ?? selectedMeetStatus} · Iscritti attivi: {rosterRows.length}
                    </p>
                    {selectedMeetStatus === "draft" ? (
                      <p>La lista non è ancora visibile ai membri: usa «Pubblica elenco iscritti» quando vuoi renderla disponibile.</p>
                    ) : null}
                  </div>
                ) : null}

                {meetEntriesQuery.isLoading ? (
                  <LoadingSkeleton label="Caricamento degli iscritti…" count={2} itemClassName="h-12 w-full rounded-xl" />
                ) : !meetEntriesQuery.data && meetEntriesQuery.isError ? (
                  <LoadError className="border-0 bg-raised" onRetry={() => void meetEntriesQuery.refetch()} />
                ) : rosterRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessun iscritto attivo per la convocazione selezionata.</p>
                ) : (
                  <>
                    <ul className="md:hidden">
                      {rosterRows.map((row) => (
                        <li key={row.entryId} className="border-t border-border py-2 text-sm first:border-t-0">
                          <p className="font-semibold">{row.fullName}</p>
                          <p className="text-xs text-muted-foreground">{row.email}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {row.eventLabel} · {row.distance} {row.stroke !== "-" ? `· ${row.stroke}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Stato: {row.status} · Seed: {row.seedTime}
                          </p>
                        </li>
                      ))}
                    </ul>
                    <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                      <table className="min-w-full text-sm">
                        <thead className="bg-raised text-xs text-muted-foreground">
                          <tr>
                            <th className="px-2 py-2 text-left font-semibold">Nome</th>
                            <th className="px-2 py-2 text-left font-semibold">Cognome</th>
                            <th className="px-2 py-2 text-left font-semibold">Gara</th>
                            <th className="px-2 py-2 text-left font-semibold">Stile</th>
                            <th className="px-2 py-2 text-left font-semibold">Distanza</th>
                            <th className="px-2 py-2 text-left font-semibold">Stato</th>
                            <th className="px-2 py-2 text-left font-semibold">Seed</th>
                            <th className="px-2 py-2 text-left font-semibold">Email</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rosterRows.map((row) => (
                            <tr key={row.entryId} className="border-t border-border">
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
          </CoachSection>
        ) : null}

        <CoachSection icon={<Sparkles className="size-4 text-action-text" aria-hidden />} title="Allenamenti in vasca (AI)">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor={fieldId("workout-date")}>Data allenamento *</Label>
              <Input
                id={fieldId("workout-date")}
                type="date"
                value={workoutSessionDate}
                onChange={(e) => setWorkoutSessionDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={fieldId("workout-volume")}>Volume</Label>
              <Select
                value={workoutDirectives.volume}
                onValueChange={(value) => setWorkoutDirectives((prev) => ({ ...prev, volume: value as WorkoutDirectivesForm["volume"] }))}
              >
                <SelectTrigger id={fieldId("workout-volume")} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Leggero</SelectItem>
                  <SelectItem value="medium">Medio</SelectItem>
                  <SelectItem value="high">Alto</SelectItem>
                  <SelectItem value="very_high">Molto alto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={fieldId("workout-intensity")}>Intensità</Label>
              <Select
                value={workoutDirectives.intensity}
                onValueChange={(value) => setWorkoutDirectives((prev) => ({ ...prev, intensity: value as WorkoutDirectivesForm["intensity"] }))}
              >
                <SelectTrigger id={fieldId("workout-intensity")} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Facile</SelectItem>
                  <SelectItem value="mixed">Mista</SelectItem>
                  <SelectItem value="hard">Dura</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <fieldset>
            <legend className="text-sm font-medium">Focus</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {WORKOUT_FOCUS_OPTIONS.map((option) => (
                <label key={option.value} className={choiceTile}>
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
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
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium">Mix stili</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {WORKOUT_STROKE_OPTIONS.map((option) => (
                <label key={option.value} className={choiceTile}>
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
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
          </fieldset>

          <div className="grid gap-3 md:grid-cols-3">
            <fieldset>
              <legend className="text-sm font-medium">Attrezzi ammessi</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {WORKOUT_EQUIPMENT_OPTIONS.map((option) => (
                  <label key={option.value} className={choiceTile}>
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
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
            </fieldset>
            <div className="space-y-1">
              <Label htmlFor={fieldId("workout-minutes")}>Durata sessione</Label>
              <Select
                value={String(workoutDirectives.sessionMinutes)}
                onValueChange={(value) => setWorkoutDirectives((prev) => ({ ...prev, sessionMinutes: Number(value) as WorkoutDirectivesForm["sessionMinutes"] }))}
              >
                <SelectTrigger id={fieldId("workout-minutes")} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="45">45 min</SelectItem>
                  <SelectItem value="60">60 min</SelectItem>
                  <SelectItem value="75">75 min</SelectItem>
                  <SelectItem value="90">90 min</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={fieldId("workout-distance")}>Distanza totale (facoltativa)</Label>
              <Select
                value={workoutDirectives.targetDistanceMeters ? String(workoutDirectives.targetDistanceMeters) : "auto"}
                onValueChange={(value) =>
                  setWorkoutDirectives((prev) => ({
                    ...prev,
                    targetDistanceMeters: value === "auto" ? null : Number(value),
                  }))
                }
              >
                <SelectTrigger id={fieldId("workout-distance")} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automatica</SelectItem>
                  {[1500, 1800, 2000, 2200, 2500, 2800, 3000, 3200, 3500, 4000].map((meters) => (
                    <SelectItem key={meters} value={String(meters)}>
                      {formatInteger(meters)} m
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor={fieldId("workout-notes")}>Nota del coach (facoltativa)</Label>
            <Textarea
              id={fieldId("workout-notes")}
              rows={2}
              value={workoutDirectives.notes}
              onChange={(e) => setWorkoutDirectives((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Es. gruppo numeroso, priorità tecnica virate"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              className="w-full sm:w-auto"
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
              <Sparkles aria-hidden />
              {generateWorkoutDraftMutation.isPending ? "Generazione..." : "Genera allenamento"}
            </Button>

            {workoutCooldownLabel ? (
              <p className="text-sm text-warning">
                Generazione disponibile da {workoutCooldownLabel}
              </p>
            ) : workoutGenerationStatusQuery.error ? (
              <p className="text-sm text-warning">
                Stato dell'attesa non disponibile: ricarica la pagina.
              </p>
            ) : workoutGenerationStatusQuery.isFetching ? (
              <p className="text-sm text-muted-foreground">Verifica dell'attesa...</p>
            ) : (
              <p className="text-sm text-muted-foreground">Una generazione ogni 24 ore per club, qualunque sia la data scelta.</p>
            )}
          </div>

          {workoutPreview ? (
            <div className="space-y-3 rounded-xl bg-raised p-3">
              <div>
                <p className="font-semibold">
                  {String(workoutPreviewPlan?.title ?? workoutPreview.title ?? "Allenamento")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {String(workoutPreviewPlan?.description ?? workoutPreview.description ?? "Bozza salvata")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[
                    workoutPreview.sessionDate ? formatSessionDay(workoutPreview.sessionDate) : null,
                    `Stato: ${WORKOUT_STATUS_LABELS[workoutStatus] ?? workoutStatus}`,
                    `Blocchi: ${Array.isArray(workoutPreviewPlan?.blocks) ? workoutPreviewPlan.blocks.length : 0}`,
                    `Distanza: ${String(workoutPreviewPlan?.totalDistance ?? "n/d")}`,
                  ]
                    .filter((part) => part && part !== NO_VALUE)
                    .join(" · ")}
                </p>
              </div>
              {Array.isArray(workoutPreviewPlan?.blocks) && workoutPreviewPlan.blocks.length > 0 ? (
                <div>
                  {workoutPreviewPlan.blocks.map((block: any, blockIndex: number) => (
                    <div key={`coach-preview-${blockIndex}`} className="border-t border-border py-2 first:border-t-0 first:pt-0">
                      <p className={subTitle}>{String(block?.label ?? `Blocco ${blockIndex + 1}`)}</p>
                      {Array.isArray(block?.items) ? (
                        <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                          {block.items.map((item: any, itemIndex: number) => {
                            const series = getWorkoutSeriesDisplay(item);
                            return (
                              <li key={`coach-preview-${blockIndex}-${itemIndex}`}>
                                <span className="font-medium text-foreground">{String(item?.label ?? "Serie")}</span>
                                {" · "}Serie: {series.reps} · Distanza serie: {series.seriesDistance} · Ripartenza: {series.sendoff}
                                {series.betweenSetsRest ? ` · Recupero prima della serie successiva: ${series.betweenSetsRest}` : ""}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={workoutPublished ? "outline" : "default"}
                  disabled={publishWorkoutMutation.isPending || workoutPublished}
                  onClick={() => publishWorkoutMutation.mutate({ workoutId: Number(workoutPreview.id) })}
                >
                  {publishWorkoutMutation.isPending
                    ? "Pubblicazione..."
                    : workoutPublished
                      ? "Pubblicato"
                      : "Pubblica e avvisa i membri"}
                </Button>
                <Button size="sm" variant="outline" onClick={handlePrintWorkout}>
                  <Printer aria-hidden />
                  Stampa
                </Button>
                {workoutWhatsappLink ? (
                  <Button size="sm" variant="outline" asChild>
                    <a href={workoutWhatsappLink} target="_blank" rel="noreferrer">
                      Condividi su WhatsApp
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </CoachSection>

        {clubAiAutomationV1Enabled && isClubStaff ? (
          <CoachSection
            icon={<Bot className="size-4 text-action-text" aria-hidden />}
            title="Coach AI autonomo"
            aside={<Chip tone={aiSectionEnabledForClub ? "action" : "neutral"}>{aiSectionEnabledForClub ? "Attivo" : "Spento"}</Chip>}
          >
            {aiCoachConfigQuery.isLoading ? (
              <LoadingSkeleton label="Caricamento della configurazione…" count={2} itemClassName="h-24 w-full rounded-xl" />
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2 rounded-xl bg-raised p-3 text-sm text-muted-foreground">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={fieldId("ai-enabled")} className="text-foreground">Automazione attiva</Label>
                      <Switch
                        id={fieldId("ai-enabled")}
                        checked={aiAutomationEnabled}
                        onCheckedChange={(checked) => setAiAutomationEnabled(Boolean(checked))}
                      />
                    </div>
                    <p>
                      Bot: {aiActorBot?.name ?? "Coach AI"} ({aiActorBot?.email ?? "-"}) · utente {aiActorUserId || "-"}
                    </p>
                    <p>Fuso orario: {String(aiCoachConfig?.timezone ?? "Europe/Rome")}</p>
                    <p>
                      Esecuzioni: {formatInteger(aiCoachSummary?.runsCount ?? 0)} · fallite: {formatInteger(aiCoachSummary?.failedCount ?? 0)}
                    </p>
                    <p>Ultimo avvio: {aiCoachSummary?.lastStartedAt ? formatDate(aiCoachSummary.lastStartedAt) : "-"}</p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor={fieldId("ai-image-model")}>Modello immagine (suggerimento)</Label>
                      <Input
                        id={fieldId("ai-image-model")}
                        value={aiImageModel}
                        onChange={(e) => setAiImageModel(e.target.value)}
                        placeholder="es. nano-banana"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={fieldId("ai-scan-url")}>URL dei comunicati da scansionare</Label>
                      <Input
                        id={fieldId("ai-scan-url")}
                        value={aiScanUrl}
                        onChange={(e) => setAiScanUrl(e.target.value)}
                        placeholder="https://www.nuotosardegna.it/category/comunicati-master/"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={fieldId("ai-prompt")}>Prompt motivazionale extra</Label>
                      <Textarea
                        id={fieldId("ai-prompt")}
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
                    <SelectTrigger aria-label="Job da eseguire" className="w-full sm:w-[260px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scan_meets_weekly">Scansione gare settimanale</SelectItem>
                      <SelectItem value="generate_workouts_weekly">Genera gli allenamenti della settimana</SelectItem>
                      <SelectItem value="publish_workout_daily">Pubblica l'allenamento del giorno</SelectItem>
                      <SelectItem value="post_motivation_mwf">Post motivazionale</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    disabled={manualAiCoachRunMutation.isPending}
                    onClick={() =>
                      manualAiCoachRunMutation.mutate({
                        clubId,
                        jobType: aiManualJobType,
                      })
                    }
                  >
                    <PlayCircle aria-hidden />
                    {manualAiCoachRunMutation.isPending ? "Esecuzione..." : "Esegui ora"}
                  </Button>
                </div>

                <div className="border-t border-border pt-4">
                  <h4 className={subTitle}>Ultime esecuzioni</h4>
                  {aiCoachRuns.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">Nessuna esecuzione registrata.</p>
                  ) : (
                    <ul className="mt-1">
                      {aiCoachRuns.map((run: any) => (
                        <li key={run.id} className="border-t border-border py-2 text-xs first:border-t-0">
                          <p className="font-medium">
                            {String(run.jobType)} · {String(run.status)}
                          </p>
                          <p className="inline-flex items-center gap-1 text-muted-foreground">
                            <Clock3 className="size-3.5" aria-hidden />
                            {formatDate(run.startedAt)} · chiave {String(run.scheduledKey)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </CoachSection>
        ) : null}

        {clubHistoryV1Enabled && historyEnabled ? (
          <CoachSection
            icon={<Database className="size-4 text-action-text" aria-hidden />}
            title="Storico Oppidum"
            aside={
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <Button className="w-full sm:w-auto" variant="outline" size="sm" asChild>
                  <Link href={`/community/club/${clubId}/history/athletes`}>Storico atleti</Link>
                </Button>
                <Button className="w-full sm:w-auto" variant="outline" size="sm" asChild>
                  <Link href={`/community/club/${clubId}/history/meets`}>Storico meeting</Link>
                </Button>
                <Button
                  className="w-full sm:w-auto"
                  size="sm"
                  disabled={startHistoryImportMutation.isPending}
                  onClick={() => startHistoryImportMutation.mutate({ clubId, mode: "oppidum_index_full" })}
                >
                  <RefreshCw className={cn(startHistoryImportMutation.isPending && "animate-spin")} aria-hidden />
                  {startHistoryImportMutation.isPending ? "Import in corso..." : "Importa adesso"}
                </Button>
              </div>
            }
          >
            <div className="rounded-xl bg-raised p-3 text-sm">
              <p className="text-xs text-muted-foreground">Sorgente</p>
              <p className="break-all font-medium">{String(historyConfig?.source?.rootUrl ?? "-")}</p>
            </div>

            <div className="rounded-xl bg-raised p-3 text-sm">
              {!historyLastRun ? (
                <p className="text-muted-foreground">Nessun import storico eseguito.</p>
              ) : (
                <div className="space-y-1">
                  <p className="font-medium">Ultimo import: {String(historyLastRun.status ?? "-")}</p>
                  <p className="text-xs text-muted-foreground">
                    Avvio: {formatDate(historyLastRun.startedAt)} · Pagine: {formatInteger(historyLastRun.processedPages ?? 0)} · Record: {formatInteger(historyLastRun.processedRecords ?? 0)} · Errori: {formatInteger(historyLastRun.errorRecords ?? 0)}
                  </p>
                  {Array.isArray(historyLastRun.errorsJson) && historyLastRun.errorsJson.length > 0 ? (
                    <p className="text-xs text-warning">
                      {historyLastRun.errorsJson.slice(0, 2).map((error: any) => String(error?.message ?? error)).join(" | ")}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </CoachSection>
        ) : null}

        {isClubStaff ? (
          <CoachSection icon={<Users className="size-4 text-action-text" aria-hidden />} title="Inviti al club">
            <Button
              className="w-full sm:w-auto"
              disabled={createInviteMutation.isPending}
              onClick={() => createInviteMutation.mutate({ clubId, maxUses: 10 })}
            >
              {createInviteMutation.isPending ? "Generazione..." : "Genera nuovo invito"}
            </Button>
            {invitesQuery.isPending ? (
              <LoadingSkeleton label="Caricamento degli inviti…" count={2} itemClassName="h-11 w-full rounded-xl" />
            ) : !invites && invitesQuery.isError ? (
              <LoadError className="border-0 bg-raised" onRetry={() => void invitesQuery.refetch()} />
            ) : invites?.length ? (
              <div className="space-y-2">
                {invites.map((inv: any) => (
                  <InviteRow key={inv.id} invite={inv} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nessun invito attivo.</p>
            )}
          </CoachSection>
        ) : null}
      </div>
    </AppLayout>
  );
}
