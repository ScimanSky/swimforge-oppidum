/**
 * Club page: header, pinned announcements, weekly numbers, agenda and the club feed in one
 * scrollable page (the shell header carries the «Club» title and the back button).
 */

import { useId, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Pin, ArrowLeft, Copy, Check, Upload, X as XIcon, Calendar as CalendarIcon } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChoiceGroup, type ChoiceOption } from "@/components/corsia/ChoiceGroup";
import { LoadError, LoadingSkeleton } from "@/components/corsia/LoadState";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

import ClubHero from "@/components/club/ClubHero";
import ClubEventsPanel, { type ClubAgendaItem } from "@/components/club/ClubEventsPanel";
import PulseBar, { type ClubWeeklyStats } from "@/components/club/PulseBar";
import ClubCreateMenu from "@/components/club/ClubCreateMenu";
import ClubFeedTab from "@/components/club/ClubFeedTab";
import ClubMembersTab from "@/components/club/ClubMembersTab";
import EventMapEditor from "@/components/club/EventMapEditor";
import { pointsToRouteGeojson, routeDistanceMeters, type RoutePoint } from "@/lib/club-event-map";
import { UI_FEATURE_FLAGS } from "@/lib/feature-flags";
import { publicSiteUrl } from "@/lib/public-url";

async function geocodeLocation(query: string): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const q = query.trim();
  if (!q) return null;

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error("Servizio mappa temporaneamente non disponibile");
  }
  const data = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
  const first = data[0];
  if (!first?.lat || !first?.lon) return null;
  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    displayName: first.display_name ?? q,
  };
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toDateTimeLocalString(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function parseDateTimeLocal(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
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
  const timeInputId = `event-time-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

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
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="w-full justify-start font-normal">
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
    </div>
  );
}

export default function ClubDetailEnhanced() {
  const clubMeetsV1Enabled = UI_FEATURE_FLAGS.clubMeetsV1;
  const clubHistoryV1Enabled = UI_FEATURE_FLAGS.clubHistoryV1;
  const [match, params] = useRoute("/community/club/:id");
  const [, navigate] = useLocation();
  const clubId = Number(params?.id);
  const [eventsFromDateIso] = useState(() => new Date().toISOString());

  const [membersOpen, setMembersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [createMeetOpen, setCreateMeetOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [joinRulesOpen, setJoinRulesOpen] = useState(false);
  const [joinRulesAccepted, setJoinRulesAccepted] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: "", description: "", eventType: "training" as "training" | "race" | "social" | "meeting",
    location: "", locationLat: null as number | null, locationLng: null as number | null,
    startTime: "", endTime: "", maxAttendees: "",
  });
  const [isGeocodingLocation, setIsGeocodingLocation] = useState(false);
  const [newMeet, setNewMeet] = useState({
    name: "",
    venue: "",
    startDate: "",
    endDate: "",
    registrationDeadline: "",
    notes: "",
  });
  const [eventRoutePoints, setEventRoutePoints] = useState<RoutePoint[]>([]);
  // Full-screen dialogs on phones; native date pickers on touch screens.
  const isMobile = useMediaQuery("(max-width: 767px)", false);
  const isCoarsePointer = useMediaQuery("(pointer: coarse)", false);
  const announcementsTitleId = useId();
  const feedId = useId();

  const utils = trpc.useUtils();

  // Queries
  const clubQuery = trpc.community.clubs.get.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) }
  );
  const isMemberFromClubQuery = Boolean((clubQuery.data as any | undefined)?.is_member);
  // A public club shows its weekly numbers to everyone, the others to members only (the server
  // answers FORBIDDEN otherwise): not even asked for then.
  const canSeeWeeklyStats =
    isMemberFromClubQuery ||
    ((clubQuery.data as any | undefined)?.visibility === "public" &&
      !(clubQuery.data as any | undefined)?.is_private);
  const statsQuery = trpc.community.clubs.weeklyStats.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) && canSeeWeeklyStats }
  );
  const announcementsQuery = trpc.community.clubs.announcements.list.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) && isMemberFromClubQuery }
  );
  const meetsQuery = trpc.community.clubs.meets.list.useQuery(
    { clubId },
    { enabled: clubMeetsV1Enabled && match && Number.isFinite(clubId) && isMemberFromClubQuery }
  );
  const historyConfigQuery = trpc.community.clubs.history.config.get.useQuery(
    { clubId },
    { enabled: clubHistoryV1Enabled && match && Number.isFinite(clubId) && isMemberFromClubQuery }
  );
  const eventsQuery = trpc.community.clubs.events.list.useQuery(
    { clubId, status: "active", fromDate: eventsFromDateIso, limit: 8 },
    { enabled: match && Number.isFinite(clubId) && isMemberFromClubQuery }
  );

  // Mutations
  const joinMutation = trpc.community.clubs.join.useMutation({
    onSuccess: (result: any) => {
      if (result?.joined) {
        toast.success("Iscrizione al club completata.");
      } else if (result?.requested) {
        toast.success("Richiesta di iscrizione inviata.");
      } else {
        toast.success("Operazione completata.");
      }
      setJoinRulesOpen(false);
      setJoinRulesAccepted(false);
      utils.community.clubs.get.invalidate({ clubId });
    },
    onError: (error) => {
      toast.error(error.message || "Impossibile iscriversi al club.");
    },
  });
  const leaveMutation = trpc.community.clubs.leave.useMutation({
    onSuccess: () => {
      toast.success("Hai lasciato il club");
      utils.community.clubs.get.invalidate({ clubId });
    },
  });
  const createEventMutation = trpc.community.clubs.events.create.useMutation({
    onSuccess: () => {
      toast.success("Evento creato!");
      setCreateEventOpen(false);
      setNewEvent({
        title: "",
        description: "",
        eventType: "training",
        location: "",
        locationLat: null,
        locationLng: null,
        startTime: "",
        endTime: "",
        maxAttendees: "",
      });
      setEventRoutePoints([]);
      utils.community.clubs.events.list.invalidate();
      // Not refetch(): that would run even while the query is disabled.
      utils.community.clubs.weeklyStats.invalidate({ clubId });
    },
    onError: (e) => toast.error(e.message || "Errore nella creazione"),
  });
  const createInviteMutation = trpc.community.clubs.createInvite.useMutation({
    onSuccess: () => {
      toast.success("Invito creato!");
      invitesQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const invitesQuery = trpc.community.clubs.invites.useQuery(
    { clubId },
    { enabled: inviteOpen }
  );
  const createMeetMutation = trpc.community.clubs.meets.create.useMutation({
    onSuccess: (payload: any) => {
      toast.success("Convocazione gara creata");
      setCreateMeetOpen(false);
      setNewMeet({
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

  const club = clubQuery.data as any | undefined;
  const isMember = Boolean(club?.is_member);

  if (!match || !Number.isFinite(clubId)) {
    return (
      <AppLayout>
        <p className="surface-panel p-4 text-center text-sm text-muted-foreground">Club non trovato.</p>
      </AppLayout>
    );
  }

  if (clubQuery.isLoading) {
    return (
      <AppLayout>
        <LoadingSkeleton label="Caricamento del club…" count={3} itemClassName="h-32 w-full rounded-2xl" />
      </AppLayout>
    );
  }

  if (!club) {
    // A missing or secret club is «not found»; anything else (network, server) can be retried.
    const errorCode = clubQuery.error?.data?.code;
    if (clubQuery.isError && errorCode !== "NOT_FOUND" && errorCode !== "FORBIDDEN") {
      return (
        <AppLayout>
          <LoadError onRetry={() => void clubQuery.refetch()} />
        </AppLayout>
      );
    }
    return (
      <AppLayout>
        <div className="surface-panel p-4 text-center">
          <p className="text-sm text-muted-foreground">Club non trovato.</p>
          <Button variant="outline" className="mt-3" asChild>
            <Link href="/home/community">
              <ArrowLeft aria-hidden />
              Torna alla community
            </Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const memberRole = club.member_role ?? "";
  const isStaff = ["owner", "admin", "moderator"].includes(memberRole);

  const pinnedAnnouncements = (announcementsQuery.data as any[])?.filter(
    (a: any) => a.announcement?.isPinned
  ) ?? [];
  const meetItems = ((meetsQuery.data as any)?.meets as any[]) ?? [];
  const upcomingEvents = (eventsQuery.data as any[]) ?? [];
  const coachAreaHref = `/community/club/${clubId}/coach`;
  const historyAthletesHref = `/community/club/${clubId}/history/athletes`;
  const isHistoryEnabledForClub = Boolean((historyConfigQuery.data as any)?.enabled);
  const historyPageHref = clubHistoryV1Enabled && isMember && isHistoryEnabledForClub ? historyAthletesHref : null;
  const documentsPageHref = isMember ? `/community/club/${clubId}/documents` : null;
  const workoutsPageHref = isMember ? `/community/club/${clubId}/workouts` : null;
  const pbLeaderboardHref = isMember ? `/community/club/${clubId}/pb` : null;
  const hasClubRules = Boolean(club?.rules && String(club.rules).trim().length > 0);

  const meetStatusLabel: Record<string, string> = {
    draft: "Bozza",
    published: "Pubblicata",
    open: "Iscrizioni aperte",
    closed: "Iscrizioni chiuse",
    completed: "Completata",
    cancelled: "Annullata",
  };
  const visibleMeetStatuses = new Set(["published", "open", "closed", "completed"]);

  const meetAgendaItems: ClubAgendaItem[] = clubMeetsV1Enabled
    ? meetItems
        .map((item: any) => item.meet ?? item)
        .filter((meet: any) => visibleMeetStatuses.has(String(meet.status ?? "draft")))
        .map((meet: any) => ({
          id: `meet-${meet.id}`,
          title: String(meet.name ?? "Meeting"),
          href: `/community/club/${clubId}/meet/${meet.id}`,
          startsAtIso: meet.startDate ?? null,
          location: meet.venue ?? null,
          kind: "meet" as const,
          statusLabel: meetStatusLabel[String(meet.status ?? "draft")] ?? String(meet.status ?? "draft"),
        }))
    : [];

  const eventAgendaItems: ClubAgendaItem[] = upcomingEvents.map((eventItem: any) => {
    const event = eventItem.event ?? eventItem;
    return {
      id: `event-${event.id}`,
      title: String(event.title ?? "Evento"),
      href: `/community/club/${clubId}/event/${event.id}`,
      startsAtIso: event.startTime ?? null,
      location: event.location ?? null,
      kind: "event" as const,
      statusLabel: null,
    };
  });

  const agendaItems = [...meetAgendaItems, ...eventAgendaItems].sort((a, b) => {
    const aTs = a.startsAtIso ? new Date(a.startsAtIso).getTime() : Number.POSITIVE_INFINITY;
    const bTs = b.startsAtIso ? new Date(b.startsAtIso).getTime() : Number.POSITIVE_INFINITY;
    if (aTs !== bTs) return aTs - bTs;
    return a.title.localeCompare(b.title, "it");
  });
  const firstAgendaHref = agendaItems[0]?.href ?? null;
  const meetsPageHref = meetAgendaItems[0]?.href ?? firstAgendaHref;
  const hasActiveMeet = clubMeetsV1Enabled && meetItems.some((item: any) => {
    const meet = item.meet ?? item;
    const status = String(meet.status ?? "draft");
    return status === "published" || status === "open";
  });

  // «Nuovo post»: to the feed, in the composer.
  const startNewPost = () => {
    const feed = document.getElementById(feedId);
    feed?.scrollIntoView({ behavior: "smooth", block: "start" });
    feed?.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
  };

  const handleJoinClub = () => {
    if (!hasClubRules) {
      joinMutation.mutate({ clubId });
      return;
    }
    setJoinRulesAccepted(false);
    setJoinRulesOpen(true);
  };

  const handleFindLocationOnMap = async () => {
    if (!newEvent.location.trim()) {
      toast.error("Inserisci prima un luogo da cercare");
      return;
    }
    setIsGeocodingLocation(true);
    try {
      const hit = await geocodeLocation(newEvent.location);
      if (!hit) {
        toast.error("Luogo non trovato sulla mappa");
        setNewEvent((prev) => ({ ...prev, locationLat: null, locationLng: null }));
        return;
      }
      setNewEvent((prev) => ({
        ...prev,
        location: prev.location.trim().length > 0 ? prev.location : hit.displayName,
        locationLat: hit.lat,
        locationLng: hit.lng,
      }));
      toast.success("Posizione trovata sulla mappa");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore durante la ricerca del luogo";
      toast.error(message);
    } finally {
      setIsGeocodingLocation(false);
    }
  };

  return (
    <AppLayout>
      {/* One column on phones (header, numbers, agenda, feed); from lg the side column holds
          numbers and agenda next to header and feed. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_1fr] lg:gap-6">
        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
          <ClubHero
            club={club}
            onOpenMembers={() => setMembersOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onJoin={handleJoinClub}
            onLeave={() => leaveMutation.mutate({ clubId })}
            isJoining={joinMutation.isPending}
            isLeaving={leaveMutation.isPending}
            eventsPageHref={firstAgendaHref}
            meetsPageHref={meetsPageHref}
            historyPageHref={historyPageHref}
            documentsPageHref={documentsPageHref}
            workoutsPageHref={workoutsPageHref}
            pbLeaderboardHref={pbLeaderboardHref}
            coachPageHref={coachAreaHref}
            hasActiveMeet={hasActiveMeet}
            createMenu={
              isMember ? (
                <ClubCreateMenu
                  role={memberRole}
                  meetsEnabled={clubMeetsV1Enabled}
                  onPost={startNewPost}
                  onCreateEvent={() => setCreateEventOpen(true)}
                  // Meet calls and invites live in the coach area.
                  onCreateMeet={() => navigate(coachAreaHref)}
                  onInvite={() => navigate(coachAreaHref)}
                />
              ) : null
            }
          />

          {pinnedAnnouncements.length > 0 && (
            <section aria-labelledby={announcementsTitleId} className="surface-panel p-4">
              <h3 id={announcementsTitleId} className="sr-only">
                Annunci in evidenza
              </h3>
              <ul>
                {pinnedAnnouncements.slice(0, 2).map((item: any) => (
                  <li
                    key={item.announcement.id}
                    className="flex items-start gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
                  >
                    <Pin className="mt-0.5 size-4 shrink-0 text-action-text" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{item.announcement.title}</p>
                      <p className="line-clamp-2 text-sm text-muted-foreground">{item.announcement.content}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside
          aria-label="Attività e calendario del club"
          className="min-w-0 space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1"
        >
          {/* Quiet on errors (a FORBIDDEN, a network failure): the numbers are just left out. */}
          <PulseBar
            stats={canSeeWeeklyStats ? (statsQuery.data as ClubWeeklyStats | undefined) : null}
            showNextEvent={isMember}
          />
          {isMember ? (
            <ClubEventsPanel items={agendaItems} />
          ) : (
            <p className="surface-panel p-4 text-sm text-muted-foreground">
              Unisciti al club per vedere gare ed eventi.
            </p>
          )}
        </aside>

        {isMember ? (
          <div id={feedId} className="min-w-0 scroll-mt-24 lg:col-start-1 lg:row-start-2">
            <ClubFeedTab clubId={clubId} isMember={isMember} />
          </div>
        ) : null}
      </div>

        {/* Members Sheet */}
        <Sheet open={membersOpen} onOpenChange={setMembersOpen}>
          <SheetContent side="right" className="overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Membri</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <ClubMembersTab clubId={clubId} isStaff={isStaff} isOwner={memberRole === "owner"} />
            </div>
          </SheetContent>
        </Sheet>

        {/* Settings Sheet */}
        <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
          <SheetContent side="right" className="overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Impostazioni del club</SheetTitle>
            </SheetHeader>
            <ClubSettingsForm
              club={club}
              clubId={clubId}
              isStaff={isStaff}
              isOwner={memberRole === "owner"}
              onSaved={() => {
                setSettingsOpen(false);
                utils.community.clubs.get.invalidate({ clubId });
              }}
            />
          </SheetContent>
        </Sheet>

        {/* Join Rules Confirmation */}
        <Dialog open={joinRulesOpen} onOpenChange={setJoinRulesOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Accetta regolamento club</DialogTitle>
              <DialogDescription>
                Per iscriverti al club devi accettare il regolamento.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="max-h-64 overflow-y-auto rounded-xl bg-raised p-3 text-sm text-foreground whitespace-pre-wrap">
                {club?.rules}
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={joinRulesAccepted}
                  onChange={(e) => setJoinRulesAccepted(e.target.checked)}
                />
                <span>Confermo di aver letto e accettato il regolamento del club.</span>
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setJoinRulesOpen(false)}>
                Annulla
              </Button>
              <Button
                disabled={!joinRulesAccepted || joinMutation.isPending}
                onClick={() => joinMutation.mutate({ clubId, acceptRules: true })}
              >
                {joinMutation.isPending ? "Iscrizione..." : "Accetta e iscriviti"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Meet Dialog */}
        <Dialog open={clubMeetsV1Enabled ? createMeetOpen : false} onOpenChange={setCreateMeetOpen}>
          <DialogContent className={isMobile ? "w-[calc(100vw-0.75rem)] max-w-none max-h-[92dvh] overflow-y-auto p-4" : "sm:max-w-2xl max-h-[90vh] overflow-y-auto"}>
            <DialogHeader>
              <DialogTitle>Nuova convocazione gara</DialogTitle>
              <DialogDescription>
                Crea il meeting del club con finestra iscrizioni per i tesserati.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome meeting *</Label>
                <Input
                  value={newMeet.name}
                  onChange={(e) => setNewMeet((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Es. Trofeo Master Città di Roma"
                />
              </div>
              <div>
                <Label>Impianto</Label>
                <Input
                  value={newMeet.venue}
                  onChange={(e) => setNewMeet((prev) => ({ ...prev, venue: e.target.value }))}
                  placeholder="Es. Centro Federale Pietralata"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <DateTimePickerField
                  label="Inizio meeting"
                  required
                  value={newMeet.startDate}
                  onChange={(next) => setNewMeet((prev) => ({ ...prev, startDate: next }))}
                />
                <DateTimePickerField
                  label="Fine meeting"
                  required
                  value={newMeet.endDate}
                  onChange={(next) => setNewMeet((prev) => ({ ...prev, endDate: next }))}
                />
              </div>
              <DateTimePickerField
                label="Deadline iscrizioni"
                required
                value={newMeet.registrationDeadline}
                onChange={(next) => setNewMeet((prev) => ({ ...prev, registrationDeadline: next }))}
              />
              <div>
                <Label>Note</Label>
                <Textarea
                  rows={3}
                  value={newMeet.notes}
                  onChange={(e) => setNewMeet((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Dettagli tecnici, logistica, convocazione..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreateMeetOpen(false)}>
                Annulla
              </Button>
              <Button
                onClick={() => {
                  const start = parseDateTimeLocal(newMeet.startDate);
                  const end = parseDateTimeLocal(newMeet.endDate);
                  const deadline = parseDateTimeLocal(newMeet.registrationDeadline);
                  if (!newMeet.name.trim()) {
                    toast.error("Inserisci nome meeting");
                    return;
                  }
                  if (!start || !end || !deadline) {
                    toast.error("Compila date meeting e deadline");
                    return;
                  }
                  if (end <= start) {
                    toast.error("La fine meeting deve essere dopo l'inizio");
                    return;
                  }
                  if (deadline >= start) {
                    toast.error("La deadline iscrizioni deve essere prima dell'inizio meeting");
                    return;
                  }
                  createMeetMutation.mutate({
                    clubId,
                    name: newMeet.name.trim(),
                    venue: newMeet.venue.trim() || null,
                    startDate: start.toISOString(),
                    endDate: end.toISOString(),
                    registrationDeadline: deadline.toISOString(),
                    notes: newMeet.notes.trim() || null,
                    timezone: "Europe/Rome",
                  });
                }}
                disabled={createMeetMutation.isPending}
              >
                {createMeetMutation.isPending ? "Creazione..." : "Crea convocazione"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Event Dialog */}
        <Dialog open={createEventOpen} onOpenChange={setCreateEventOpen}>
          <DialogContent
            className={
              isMobile
                ? "w-[calc(100vw-0.75rem)] max-w-none max-h-[92dvh] overflow-y-auto p-4"
                : "sm:max-w-2xl max-h-[90vh] overflow-y-auto"
            }
          >
            <DialogHeader>
              <DialogTitle>Crea evento</DialogTitle>
              <DialogDescription>Organizza un evento per il club</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {!isStaff ? (
                <div className="rounded-xl bg-raised p-3 text-sm text-muted-foreground">
                  Limite membri: massimo 1 evento al giorno.
                </div>
              ) : null}
              <div>
                <Label>Titolo *</Label>
                <Input value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} placeholder="Es. Allenamento mattutino" />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={newEvent.eventType} onValueChange={(v) => setNewEvent({ ...newEvent, eventType: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="training">Allenamento</SelectItem>
                    <SelectItem value="race">Gara</SelectItem>
                    <SelectItem value="social">Evento sociale</SelectItem>
                    <SelectItem value="meeting">Riunione</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Descrizione</Label>
                <Textarea value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} rows={2} />
              </div>
              <div>
                <Label>Luogo</Label>
                <Input value={newEvent.location} onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })} placeholder="Es. Piscina comunale" />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleFindLocationOnMap}
                    disabled={isGeocodingLocation || !newEvent.location.trim()}
                  >
                    {isGeocodingLocation ? "Cerco..." : "Trova su mappa"}
                  </Button>
                  {newEvent.locationLat !== null && newEvent.locationLng !== null && (
                    <span className="text-xs text-muted-foreground">
                      {newEvent.locationLat.toFixed(5)}, {newEvent.locationLng.toFixed(5)}
                    </span>
                  )}
                </div>
                <div className="mt-2 space-y-2">
                  <EventMapEditor
                    pin={
                      newEvent.locationLat !== null && newEvent.locationLng !== null
                        ? { lat: newEvent.locationLat, lng: newEvent.locationLng }
                        : null
                    }
                    routePoints={eventRoutePoints}
                    onPinChange={(pin) =>
                      setNewEvent((prev) => ({
                        ...prev,
                        locationLat: pin?.lat ?? null,
                        locationLng: pin?.lng ?? null,
                      }))
                    }
                    onRouteChange={setEventRoutePoints}
                    className="h-72 w-full rounded-xl border border-border sm:h-80"
                  />
                  <p className="text-xs text-muted-foreground">
                    Tocca la mappa per mettere il pin (modalità pin) o aggiungere i waypoint numerati del percorso.
                  </p>
                  {eventRoutePoints.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Waypoint: {eventRoutePoints.length}
                      {eventRoutePoints.length >= 2
                        ? ` · Percorso: ${(routeDistanceMeters(eventRoutePoints) / 1000).toFixed(2)} km`
                        : ""}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  {isCoarsePointer ? (
                    <>
                      <Label>Inizio *</Label>
                      <Input
                        type="datetime-local"
                        value={newEvent.startTime}
                        onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                      />
                    </>
                  ) : (
                    <DateTimePickerField
                      label="Inizio"
                      required
                      value={newEvent.startTime}
                      onChange={(next) => setNewEvent({ ...newEvent, startTime: next })}
                    />
                  )}
                </div>
                <div>
                  {isCoarsePointer ? (
                    <>
                      <Label>Fine</Label>
                      <Input
                        type="datetime-local"
                        value={newEvent.endTime}
                        onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                      />
                    </>
                  ) : (
                    <DateTimePickerField
                      label="Fine"
                      value={newEvent.endTime}
                      onChange={(next) => setNewEvent({ ...newEvent, endTime: next })}
                    />
                  )}
                </div>
              </div>
              <div>
                <Label>Max partecipanti</Label>
                <Input type="number" value={newEvent.maxAttendees} onChange={(e) => setNewEvent({ ...newEvent, maxAttendees: e.target.value })} placeholder="Illimitato" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreateEventOpen(false)}>Annulla</Button>
              <Button
                disabled={createEventMutation.isPending}
                onClick={() => {
                  if (!newEvent.title.trim()) { toast.error("Inserisci un titolo"); return; }
                  if (!newEvent.startTime) { toast.error("Inserisci la data di inizio"); return; }
                  const startTime = new Date(newEvent.startTime);
                  const endTime = newEvent.endTime ? new Date(newEvent.endTime) : undefined;
                  if (isNaN(startTime.getTime())) { toast.error("Data inizio non valida"); return; }
                  if (endTime && endTime <= startTime) { toast.error("La fine deve essere dopo l'inizio"); return; }
                  createEventMutation.mutate({
                    clubId,
                    title: newEvent.title.trim(),
                    description: newEvent.description || undefined,
                    eventType: newEvent.eventType,
                    location: newEvent.location || undefined,
                    locationLat: newEvent.locationLat ?? undefined,
                    locationLng: newEvent.locationLng ?? undefined,
                    startTime: startTime.toISOString(),
                    endTime: endTime?.toISOString(),
                    maxAttendees: newEvent.maxAttendees ? Number(newEvent.maxAttendees) : undefined,
                    routeGeojson: pointsToRouteGeojson(eventRoutePoints) ?? undefined,
                  });
                }}
              >
                {createEventMutation.isPending ? "Creazione..." : "Crea evento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Invite Dialog */}
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invita membri</DialogTitle>
              <DialogDescription>Genera un link di invito per il club</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Button
                className="w-full"
                disabled={createInviteMutation.isPending}
                onClick={() => createInviteMutation.mutate({ clubId, maxUses: 10 })}
              >
                {createInviteMutation.isPending ? "Generazione..." : "Genera nuovo invito"}
              </Button>
              {(invitesQuery.data as any[])?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Inviti attivi</p>
                  {(invitesQuery.data as any[]).map((inv: any) => (
                    <InviteRow key={inv.id} invite={inv} />
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
    </AppLayout>
  );
}

/* ---- ImageKit Upload Helper ---- */

async function uploadToImageKit(
  file: File,
  auth: { publicKey: string; token: string; signature: string; expire: number; folder: string },
  prefix: string
): Promise<string> {
  const fileNameSafe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `${prefix}-${Date.now()}-${fileNameSafe}`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("fileName", fileName);
  formData.append("publicKey", auth.publicKey);
  formData.append("token", auth.token);
  formData.append("signature", auth.signature);
  formData.append("expire", String(auth.expire));
  formData.append("folder", auth.folder);
  formData.append("useUniqueFileName", "true");
  formData.append("tags", "club,swimforge");

  const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    let detail = "";
    try {
      const payload = (await res.json()) as { message?: string; help?: string };
      detail = payload.message || payload.help || "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(detail || "Upload su ImageKit fallito");
  }

  const uploaded = (await res.json()) as { url?: string };
  if (!uploaded.url) throw new Error("ImageKit non ha restituito un URL valido");
  return uploaded.url;
}

/* ---- Settings Form ---- */

// Stored theme colours (server enum). Corsia no longer tints the club page with them: they
// set the accent of the AI-generated logo and cover.
type ThemeColor = "cyan" | "lime" | "coral" | "violet";
const THEME_COLORS: ReadonlyArray<ChoiceOption<ThemeColor>> = [
  { value: "cyan", label: "Azzurro" },
  { value: "lime", label: "Verde" },
  { value: "coral", label: "Corallo" },
  { value: "violet", label: "Viola" },
];
const toThemeColor = (value: unknown): ThemeColor =>
  THEME_COLORS.find((option) => option.value === value)?.value ?? "cyan";

function ClubSettingsForm({
  club,
  clubId,
  isStaff,
  isOwner,
  onSaved,
}: {
  club: any;
  clubId: number;
  isStaff: boolean;
  isOwner: boolean;
  onSaved: () => void;
}) {
  const [, setLocation] = useLocation();
  const themeLabelId = useId();
  const [name, setName] = useState(club.name);
  const [description, setDescription] = useState(club.description ?? "");
  const [rules, setRules] = useState(club.rules ?? "");
  const [tagline, setTagline] = useState(club.tagline ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(club.website_url ?? "");
  const [themeColor, setThemeColor] = useState<ThemeColor>(() => toThemeColor(club.theme_color));
  const [visibility, setVisibility] = useState(club.visibility ?? "public");
  const [logoPreview, setLogoPreview] = useState<string | null>(club.logo_url ?? null);
  const [coverPreview, setCoverPreview] = useState<string | null>(club.cover_image_url ?? null);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [logoAiPrompt, setLogoAiPrompt] = useState("");
  const [coverAiPrompt, setCoverAiPrompt] = useState("");
  const [generatingAssetKind, setGeneratingAssetKind] = useState<"logo" | "cover" | null>(null);
  const [saving, setSaving] = useState(false);

  const imageKitAuth = trpc.community.clubs.media.imageKitAuth.useMutation();
  const generateBrandAssetMutation = trpc.community.clubs.media.generateBrandAsset.useMutation({
    onError: (e) => toast.error(e.message || "Generazione AI non riuscita"),
  });
  const updateMutation = trpc.community.clubs.update.useMutation({
    onSuccess: () => { toast.success("Club aggiornato!"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.community.clubs.delete.useMutation({
    onSuccess: () => {
      toast.success("Club eliminato");
      setLocation("/home/community");
    },
    onError: (e) => toast.error(e.message || "Impossibile eliminare il club"),
  });

  const handleFilePick = (file: File, target: "logo" | "cover") => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Formato non supportato. Usa JPG, PNG o WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Immagine troppo grande (max 5MB)");
      return;
    }
    const preview = URL.createObjectURL(file);
    if (target === "logo") {
      setPendingLogoFile(file);
      setLogoPreview(preview);
      setLogoRemoved(false);
    } else {
      setPendingCoverFile(file);
      setCoverPreview(preview);
      setCoverRemoved(false);
    }
  };

  const handleGenerateAsset = async (kind: "logo" | "cover") => {
    if (!isOwner) {
      toast.error("Solo il proprietario del club può aggiornare logo e copertina.");
      return;
    }

    setGeneratingAssetKind(kind);
    try {
      const prompt = (kind === "logo" ? logoAiPrompt : coverAiPrompt).trim();
      const result = await generateBrandAssetMutation.mutateAsync({
        clubId,
        kind,
        prompt: prompt.length > 0 ? prompt : undefined,
      });

      if (kind === "logo") {
        setLogoPreview(result.url);
        setPendingLogoFile(null);
        setLogoRemoved(false);
      } else {
        setCoverPreview(result.url);
        setPendingCoverFile(null);
        setCoverRemoved(false);
      }

      toast.success(
        kind === "logo"
          ? "Logo AI generato (512×512, adatto agli smartphone)."
          : "Copertina AI generata (1280×640, adatta agli smartphone).",
      );
      onSaved();
    } catch {
      // handled by mutation onError
    } finally {
      setGeneratingAssetKind(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let logoUrl: string | null | undefined = undefined;
      let coverImageUrl: string | null | undefined = undefined;

      // Upload new images to ImageKit if selected
      if (pendingLogoFile) {
        const logoAuth = await imageKitAuth.mutateAsync({ clubId });
        logoUrl = await uploadToImageKit(pendingLogoFile, logoAuth, `club-${clubId}-logo`);
      }
      if (pendingCoverFile) {
        const coverAuth = await imageKitAuth.mutateAsync({ clubId });
        coverImageUrl = await uploadToImageKit(pendingCoverFile, coverAuth, `club-${clubId}-cover`);
      }

      // Handle removals
      if (logoRemoved && !pendingLogoFile) logoUrl = null;
      if (coverRemoved && !pendingCoverFile) coverImageUrl = null;

      await updateMutation.mutateAsync({
        clubId,
        name,
        description,
        rules,
        tagline,
        websiteUrl: websiteUrl.trim() || null,
        themeColor,
        visibility: visibility as any,
        ...(logoUrl !== undefined ? { logoUrl } : {}),
        ...(coverImageUrl !== undefined ? { coverImageUrl } : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore nel salvataggio";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 space-y-5">
      {/* Logo */}
      <div>
        <label className="text-sm font-medium">Logo del club</label>
        <div className="flex items-center gap-3 mt-2">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-raised">
            {logoPreview ? (
              <img src={logoPreview} alt="Logo" className="size-full object-cover" />
            ) : (
              <span className="text-lg font-semibold text-muted-foreground">
                {club.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleFilePick(e.target.files[0], "logo"); }}
              />
              <span className="text-sm font-semibold text-action-text underline-offset-2 hover:underline">Carica logo</span>
            </label>
            {logoPreview && (
              <button type="button" className="text-left text-sm text-muted-foreground underline-offset-2 hover:underline" onClick={() => {
                setLogoPreview(null);
                setPendingLogoFile(null);
                setLogoRemoved(true);
              }}>
                Rimuovi
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            value={logoAiPrompt}
            onChange={(e) => setLogoAiPrompt(e.target.value)}
            maxLength={300}
            placeholder="Prompt AI logo (opzionale)"
          />
          <Button
            type="button"
            variant="outline"
            disabled={generatingAssetKind !== null || saving || !isOwner}
            onClick={() => void handleGenerateAsset("logo")}
          >
            {generatingAssetKind === "logo" ? "Genero logo..." : "Genera logo AI"}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Formato automatico: logo PNG 512×512, leggibile su smartphone e nell'avatar rotondo.
        </p>
      </div>

      {/* Cover Image */}
      <div>
        <label className="text-sm font-medium">Immagine di copertina</label>
        <div className="relative mt-2 overflow-hidden rounded-xl border border-border">
          {coverPreview ? (
            <div className="relative">
              <img src={coverPreview} alt="Cover" className="w-full h-28 object-cover" />
              <button
                type="button"
                aria-label="Rimuovi copertina"
                className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 text-foreground"
                onClick={() => {
                  setCoverPreview(null);
                  setPendingCoverFile(null);
                  setCoverRemoved(true);
                }}
              >
                <XIcon className="size-4" aria-hidden />
              </button>
            </div>
          ) : (
            <label className="cursor-pointer flex flex-col items-center justify-center h-28 bg-muted/50 hover:bg-muted transition-colors">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleFilePick(e.target.files[0], "cover"); }}
              />
              <Upload className="h-5 w-5 text-muted-foreground mb-1" />
              <span className="text-sm text-muted-foreground">Carica copertina</span>
            </label>
          )}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            value={coverAiPrompt}
            onChange={(e) => setCoverAiPrompt(e.target.value)}
            maxLength={300}
            placeholder="Prompt AI copertina (opzionale)"
          />
          <Button
            type="button"
            variant="outline"
            disabled={generatingAssetKind !== null || saving || !isOwner}
            onClick={() => void handleGenerateAsset("cover")}
          >
            {generatingAssetKind === "cover" ? "Genero copertina..." : "Genera copertina AI"}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Formato automatico: copertina 1280×640 con il soggetto al centro, adatta anche agli smartphone.
        </p>
        {!isOwner ? (
          <p className="mt-1 text-xs text-warning">
            La generazione AI di logo e copertina è riservata al proprietario del club.
          </p>
        ) : null}
      </div>

      {/* Name */}
      <div>
        <label className="text-sm font-medium">Nome</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      {/* Tagline */}
      <div>
        <label className="text-sm font-medium">Tagline</label>
        <Input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={200} placeholder="Motto del club..." />
      </div>

      {/* Website URL */}
      <div>
        <label className="text-sm font-medium">Sito web esterno</label>
        <Input
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          maxLength={500}
          placeholder="https://www.miosito.it"
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-sm font-medium">Descrizione</label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </div>

      {/* Rules */}
      <div>
        <label className="text-sm font-medium">Regolamento</label>
        <Textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={2} placeholder="Regole del club..." />
      </div>

      {/* Theme colour: only the AI logo and cover use it. */}
      <div>
        <p id={themeLabelId} className="text-sm font-medium">
          Colore per logo e copertina AI
        </p>
        <ChoiceGroup
          aria-labelledby={themeLabelId}
          options={THEME_COLORS}
          value={themeColor}
          onChange={setThemeColor}
          className="mt-2 grid grid-cols-2"
        />
      </div>

      {/* Visibility */}
      <div>
        <label className="text-sm font-medium">Visibilità</label>
        <Select value={visibility} onValueChange={setVisibility}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Pubblico</SelectItem>
            <SelectItem value="private">Segreto</SelectItem>
            <SelectItem value="invite">Privato</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Save */}
      <Button
        className="w-full"
        disabled={saving}
        onClick={handleSave}
      >
        {saving ? "Caricamento..." : "Salva modifiche"}
      </Button>

      {isStaff ? (
        <div className="rounded-xl bg-raised p-3">
          <p className="text-sm font-semibold">Moderazione</p>
          <p className="mt-1 text-sm text-muted-foreground">
            La gestione ruoli, ban/sblocchi e richieste ingresso è disponibile nella sezione membri del club.
          </p>
        </div>
      ) : null}

      {isOwner ? (
        <div className="space-y-2 rounded-xl border border-danger/40 p-3">
          <p className="text-sm font-semibold text-danger">Zona pericolosa</p>
          <p className="text-sm text-muted-foreground">
            Questa azione elimina definitivamente club, eventi e contenuti associati.
          </p>
          <Button
            variant="destructive"
            className="w-full"
            disabled={deleteMutation.isPending}
            onClick={() => {
              const ok = window.confirm("Confermi l'eliminazione definitiva del club?");
              if (!ok) return;
              deleteMutation.mutate({ clubId });
            }}
          >
            {deleteMutation.isPending ? "Eliminazione..." : "Elimina club"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ---- Invite Row ---- */

function InviteRow({ invite }: { invite: any }) {
  const [copied, setCopied] = useState(false);
  const link = publicSiteUrl(`/community/invite/${invite.code}`);

  return (
    <div className="flex items-center gap-2 rounded-xl bg-raised py-1 pl-3 pr-1 text-sm">
      <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{link}</code>
      <span className="text-xs text-muted-foreground tabular-nums">{invite.usedCount}/{invite.maxUses}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={copied ? "Link copiato" : "Copia link"}
        className="shrink-0"
        onClick={() => {
          navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </Button>
    </div>
  );
}
