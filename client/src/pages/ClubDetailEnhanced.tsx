/**
 * Club Dashboard — Unified scrollable page replacing the old tab system
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { Pin, ArrowLeft, Copy, Check, Upload, ImageIcon, X as XIcon, Calendar as CalendarIcon, Trophy, Flag } from "lucide-react";
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
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

import ClubHero from "@/components/club/ClubHero";
import ClubEventsPanel from "@/components/club/ClubEventsPanel";
import PulseBar from "@/components/club/PulseBar";
import QuickActionsFAB from "@/components/club/QuickActionsFAB";
import ClubDocumentsPanel from "@/components/club/ClubDocumentsPanel";
import ClubFeedTab from "@/components/club/ClubFeedTab";
import ClubMembersTab from "@/components/club/ClubMembersTab";
import EventMapEditor from "@/components/club/EventMapEditor";
import { pointsToRouteGeojson, routeDistanceMeters, type RoutePoint } from "@/lib/club-event-map";
import { UI_FEATURE_FLAGS } from "@/lib/feature-flags";

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
    </div>
  );
}

export default function ClubDetailEnhanced() {
  const clubMeetsV1Enabled = UI_FEATURE_FLAGS.clubMeetsV1;
  const [match, params] = useRoute("/community/club/:id");
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
  const mobileStickyRef = useRef<HTMLDivElement | null>(null);
  const desktopStickyRef = useRef<HTMLDivElement | null>(null);
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0);
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 767px)").matches;
  });
  const [isCoarsePointer, setIsCoarsePointer] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(pointer: coarse)").matches;
  });

  const utils = trpc.useUtils();

  // Queries
  const clubQuery = trpc.community.clubs.get.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) }
  );
  const statsQuery = trpc.community.clubs.weeklyStats.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) }
  );
  const isMemberFromClubQuery = Boolean((clubQuery.data as any | undefined)?.is_member);
  const announcementsQuery = trpc.community.clubs.announcements.list.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) && isMemberFromClubQuery }
  );
  const meetsQuery = trpc.community.clubs.meets.list.useQuery(
    { clubId },
    { enabled: clubMeetsV1Enabled && match && Number.isFinite(clubId) && isMemberFromClubQuery }
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
      statsQuery.refetch();
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
        window.location.href = `/community/club/${clubId}/meet/${meetId}`;
      }
    },
    onError: (error) => {
      toast.error(error.message || "Errore durante creazione convocazione");
    },
  });

  const club = clubQuery.data as any | undefined;
  const isMember = Boolean(club?.is_member);
  const contentOffset = stickyHeaderHeight > 0
    ? stickyHeaderHeight + (isDesktop ? 14 : 6)
    : (isDesktop ? 430 : 144);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    const handleQueries = () => {
      setIsDesktop(desktopQuery.matches);
      setIsMobile(mobileQuery.matches);
      setIsCoarsePointer(coarsePointerQuery.matches);
    };
    handleQueries();
    desktopQuery.addEventListener("change", handleQueries);
    mobileQuery.addEventListener("change", handleQueries);
    coarsePointerQuery.addEventListener("change", handleQueries);
    return () => {
      desktopQuery.removeEventListener("change", handleQueries);
      mobileQuery.removeEventListener("change", handleQueries);
      coarsePointerQuery.removeEventListener("change", handleQueries);
    };
  }, []);

  useEffect(() => {
    const node = isDesktop ? desktopStickyRef.current : mobileStickyRef.current;
    if (!node) return;

    const update = () => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      setStickyHeaderHeight((prev) => (prev === next ? prev : next));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener("resize", update);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [isDesktop, isMember, club?.cover_image_url, club?.logo_url, club?.tagline, club?.website_url]);

  if (!match || !Number.isFinite(clubId)) {
    return (
      <AppLayout>
        <div className="compact-shell max-w-5xl mx-auto">
          <section className="surface-panel p-6 text-center text-muted-foreground">Club non trovato</section>
        </div>
      </AppLayout>
    );
  }

  if (clubQuery.isLoading) {
    return (
      <AppLayout>
        <div className="compact-shell max-w-5xl mx-auto flex items-center justify-center py-8 lg:py-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!club) {
    return (
      <AppLayout>
        <div className="compact-shell max-w-5xl mx-auto flex items-center justify-center py-8 lg:py-4">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Club non trovato</p>
            <Link href="/home/community">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Torna alla Community
              </Button>
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  const memberRole = club.member_role ?? "";
  const isStaff = ["owner", "admin", "moderator"].includes(memberRole);
  const canUploadClubPdf = ["owner", "admin", "moderator", "coach"].includes(memberRole);

  const pinnedAnnouncements = (announcementsQuery.data as any[])?.filter(
    (a: any) => a.announcement?.isPinned
  ) ?? [];
  const meetItems = ((meetsQuery.data as any)?.meets as any[]) ?? [];
  const firstMeetId = Number((meetItems[0] as any)?.meet?.id ?? (meetItems[0] as any)?.id);
  const upcomingEvents = (eventsQuery.data as any[]) ?? [];
  const firstUpcomingEvent = upcomingEvents[0];
  const firstUpcomingEventId = Number(firstUpcomingEvent?.event?.id ?? firstUpcomingEvent?.id);
  const eventsPageHref = Number.isFinite(firstUpcomingEventId)
    ? `/community/club/${clubId}/event/${firstUpcomingEventId}`
    : null;
  const hasClubRules = Boolean(club?.rules && String(club.rules).trim().length > 0);

  const meetStatusLabel: Record<string, string> = {
    draft: "Bozza",
    published: "Pubblicata",
    open: "Iscrizioni aperte",
    closed: "Iscrizioni chiuse",
    completed: "Completata",
    cancelled: "Annullata",
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
      {typeof document !== "undefined" &&
        createPortal(
          <div className="pointer-events-none fixed left-0 right-0 top-16 z-30 lg:pl-[88px]">
            <div className="mx-auto max-w-[1520px] px-2.5 py-2.5 sm:p-3 md:p-5 lg:p-6">
              {isDesktop ? (
                <div
                  ref={desktopStickyRef}
                  className="pointer-events-auto grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.55fr)_minmax(0,0.95fr)] items-start gap-3"
                >
                  {isMember ? (
                    <ClubEventsPanel
                      clubId={clubId}
                      events={upcomingEvents}
                      variant="stickyDesktop"
                      className="min-h-[186px]"
                    />
                  ) : (
                    <section className="surface-panel p-3">
                      <p className="text-xs font-display uppercase tracking-wide text-muted-foreground">
                        Eventi
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Unisciti al club per vedere il calendario eventi.
                      </p>
                    </section>
                  )}

                  <ClubHero
                    club={club}
                    onOpenMembers={() => setMembersOpen(true)}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onJoin={handleJoinClub}
                    onLeave={() => leaveMutation.mutate({ clubId })}
                    isJoining={joinMutation.isPending}
                    isLeaving={leaveMutation.isPending}
                    variant="full"
                  />

                  <PulseBar
                    stats={statsQuery.data as any}
                    themeColor={club.theme_color ?? "cyan"}
                    layout="stackedCompact"
                  />
                </div>
              ) : (
                <div ref={mobileStickyRef} className="pointer-events-auto mx-auto max-w-5xl">
                  <ClubHero
                    club={club}
                    onOpenMembers={() => setMembersOpen(true)}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onJoin={handleJoinClub}
                    onLeave={() => leaveMutation.mutate({ clubId })}
                    isJoining={joinMutation.isPending}
                    isLeaving={leaveMutation.isPending}
                    variant="compactSticky"
                    eventsPageHref={isMobile ? eventsPageHref : null}
                  />
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      <div className="compact-shell max-w-5xl mx-auto space-y-3 pb-24 px-3 sm:space-y-4 sm:px-4" style={{ paddingTop: contentOffset }}>
        {/* Spacer managed by contentOffset (fixed header above) */}
        <div className="h-0" />

        {/* Pinned Announcements */}
        {pinnedAnnouncements.length > 0 && (
          <div className="space-y-2">
            {pinnedAnnouncements.slice(0, 2).map((item: any) => (
              <motion.div
                key={item.announcement.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="surface-panel p-3 flex items-start gap-2"
              >
                <Pin className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <div>
                  <p className="font-semibold text-sm">{item.announcement.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{item.announcement.content}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {!isDesktop && !isMobile && isMember ? (
          <PulseBar
            stats={statsQuery.data as any}
            themeColor={club.theme_color ?? "cyan"}
            layout="grid"
          />
        ) : null}

        {/* Club Meets */}
        {clubMeetsV1Enabled && isMember ? (
          <section className="surface-panel p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-display uppercase tracking-wide text-muted-foreground">
                  <Trophy className="h-4 w-4 text-primary" />
                  Gare Club
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Convocazioni, iscrizioni e risultati meeting
                </p>
              </div>
              <div className="flex items-center gap-2">
                {Number.isFinite(firstMeetId) ? (
                  <Link href={`/community/club/${clubId}/meet/${firstMeetId}`}>
                    <Button variant="outline-neon" size="sm" className="hidden sm:inline-flex">
                      Apri sezione gare
                    </Button>
                  </Link>
                ) : null}
                {isStaff ? (
                  <Button variant="neon" size="sm" onClick={() => setCreateMeetOpen(true)}>
                    <Flag className="mr-1.5 h-4 w-4" />
                    Nuova convocazione
                  </Button>
                ) : null}
              </div>
            </div>

            {meetsQuery.isLoading ? (
              <div className="mt-3 text-xs text-muted-foreground">Caricamento meeting...</div>
            ) : meetItems.length === 0 ? (
              <div className="mt-3 rounded-xl border border-border/60 bg-card/40 p-3 text-sm text-muted-foreground">
                Nessun meeting creato al momento.
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {meetItems.slice(0, 4).map((item: any) => {
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
                        <p className="text-xs text-muted-foreground">
                          {new Date(meet.startDate).toLocaleDateString("it-IT")} • {item.eventsCount ?? 0} eventi • {item.entriesCount ?? 0} iscrizioni
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                        {meetStatusLabel[status] ?? status}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {isMember ? (
          <ClubDocumentsPanel clubId={clubId} isMember={isMember} canUpload={canUploadClubPdf} />
        ) : null}

        {/* Feed */}
        {isMember && (
          <ClubFeedTab
            clubId={clubId}
            isMember={isMember}
            afterComposerSlot={!isDesktop && !isMobile ? (
              <ClubEventsPanel clubId={clubId} events={upcomingEvents} variant="inlineFeed" />
            ) : undefined}
          />
        )}

        {/* Quick Actions FAB */}
        <QuickActionsFAB
          isMember={isMember}
          isStaff={isStaff}
          onPost={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          onOpenEvents={eventsPageHref ? () => { window.location.href = eventsPageHref; } : undefined}
          onCreateEvent={() => setCreateEventOpen(true)}
          onCreateMeet={clubMeetsV1Enabled && isStaff ? () => setCreateMeetOpen(true) : undefined}
          onInvite={() => setInviteOpen(true)}
        />

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
              <SheetTitle>Impostazioni Club</SheetTitle>
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
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-foreground whitespace-pre-wrap">
                {club?.rules}
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={joinRulesAccepted}
                  onChange={(e) => setJoinRulesAccepted(e.target.checked)}
                />
                <span>Confermo di aver letto e accettato il regolamento del club.</span>
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline-neon" onClick={() => setJoinRulesOpen(false)}>
                Annulla
              </Button>
              <Button
                variant="neon"
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
          <DialogContent className={isMobile ? "w-[calc(100vw-0.75rem)] max-w-none max-h-[92dvh] overflow-y-auto p-4 pb-24" : "sm:max-w-2xl max-h-[90vh] overflow-y-auto"}>
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
                variant="neon"
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
                ? "w-[calc(100vw-0.75rem)] max-w-none max-h-[92dvh] overflow-y-auto p-4 pb-24"
                : "sm:max-w-2xl max-h-[90vh] overflow-y-auto"
            }
          >
            <DialogHeader>
              <DialogTitle>Crea evento</DialogTitle>
              <DialogDescription>Organizza un evento per il club</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {!isStaff ? (
                <div className="rounded-lg border border-border/60 bg-background/50 p-2 text-xs text-muted-foreground">
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
                    <SelectItem value="social">Evento Sociale</SelectItem>
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
                    variant="outline-neon"
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
                    className="h-72 w-full rounded-xl border border-border/70 sm:h-80"
                  />
                  <p className="text-xs text-muted-foreground">
                    Clicca sulla mappa per impostare il pin (modalita pin) o aggiungere waypoint numerati del percorso (modalita percorso).
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
                variant="neon"
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
                variant="neon"
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
      </div>
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
  const [name, setName] = useState(club.name);
  const [description, setDescription] = useState(club.description ?? "");
  const [rules, setRules] = useState(club.rules ?? "");
  const [tagline, setTagline] = useState(club.tagline ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(club.website_url ?? "");
  const [themeColor, setThemeColor] = useState(club.theme_color ?? "cyan");
  const [visibility, setVisibility] = useState(club.visibility ?? "public");
  const [logoPreview, setLogoPreview] = useState<string | null>(club.logo_url ?? null);
  const [coverPreview, setCoverPreview] = useState<string | null>(club.cover_image_url ?? null);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [saving, setSaving] = useState(false);

  const imageKitAuth = trpc.community.clubs.media.imageKitAuth.useMutation();
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
        themeColor: themeColor as any,
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

  const themeColorMap: Record<string, string> = {
    cyan: "var(--electric-cyan)", lime: "var(--electric-lime)",
    coral: "var(--electric-coral)", violet: "var(--electric-violet)",
  };
  const accentColor = themeColorMap[themeColor] ?? themeColorMap.cyan;

  return (
    <div className="mt-4 space-y-5">
      {/* Logo */}
      <div>
        <label className="text-sm font-medium">Logo del club</label>
        <div className="flex items-center gap-3 mt-2">
          <div
            className="h-16 w-16 rounded-full border-2 overflow-hidden flex items-center justify-center bg-muted shrink-0"
            style={{ borderColor: accentColor }}
          >
            {logoPreview ? (
              <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg font-bold font-display" style={{ color: accentColor }}>
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
              <span className="text-sm underline" style={{ color: accentColor }}>Carica logo</span>
            </label>
            {logoPreview && (
              <button className="text-xs text-muted-foreground underline text-left" onClick={() => {
                setLogoPreview(null);
                setPendingLogoFile(null);
                setLogoRemoved(true);
              }}>
                Rimuovi
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cover Image */}
      <div>
        <label className="text-sm font-medium">Immagine di copertina</label>
        <div className="mt-2 relative rounded-lg overflow-hidden border border-border">
          {coverPreview ? (
            <div className="relative">
              <img src={coverPreview} alt="Cover" className="w-full h-28 object-cover" />
              <button
                className="absolute top-1 right-1 bg-black/60 rounded-full p-1"
                onClick={() => {
                  setCoverPreview(null);
                  setPendingCoverFile(null);
                  setCoverRemoved(true);
                }}
              >
                <XIcon className="h-3 w-3 text-white" />
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
              <span className="text-xs text-muted-foreground">Carica copertina</span>
            </label>
          )}
        </div>
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

      {/* Theme Color */}
      <div>
        <label className="text-sm font-medium">Colore tema</label>
        <div className="flex gap-3 mt-2">
          {(["cyan", "lime", "coral", "violet"] as const).map((c) => (
            <button
              key={c}
              className={`h-10 w-10 rounded-full border-2 transition-all ${themeColor === c ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-background" : "border-transparent opacity-60 hover:opacity-100"}`}
              style={{ backgroundColor: `var(--electric-${c})` }}
              onClick={() => setThemeColor(c)}
            />
          ))}
        </div>
      </div>

      {/* Visibility */}
      <div>
        <label className="text-sm font-medium">Visibilità</label>
        <Select value={visibility} onValueChange={setVisibility}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Pubblico</SelectItem>
            <SelectItem value="private">Privato</SelectItem>
            <SelectItem value="invite">Solo invito</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Save */}
      <Button
        variant="neon"
        className="w-full"
        disabled={saving}
        onClick={handleSave}
      >
        {saving ? "Caricamento..." : "Salva modifiche"}
      </Button>

      {isStaff ? (
        <div className="rounded-lg border border-border/60 bg-card/40 p-3">
          <p className="text-sm font-semibold">Moderazione</p>
          <p className="mt-1 text-xs text-muted-foreground">
            La gestione ruoli, ban/sblocchi e richieste ingresso è disponibile nella sezione membri del club.
          </p>
        </div>
      ) : null}

      {isOwner ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 space-y-2">
          <p className="text-sm font-semibold text-destructive">Zona pericolosa</p>
          <p className="text-xs text-muted-foreground">
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
  const link = `${window.location.origin}/community/invite/${invite.code}`;

  return (
    <div className="flex items-center gap-2 surface-panel p-2 text-sm">
      <code className="flex-1 truncate text-xs text-muted-foreground">{link}</code>
      <span className="text-xs text-muted-foreground">{invite.usedCount}/{invite.maxUses}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => {
          navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  );
}
