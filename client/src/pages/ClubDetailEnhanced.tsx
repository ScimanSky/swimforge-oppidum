/**
 * Club Dashboard — Unified scrollable page replacing the old tab system
 */

import { useState } from "react";
import { Link, useRoute } from "wouter";
import { motion } from "framer-motion";
import { Calendar, MapPin, Pin, Clock, ArrowLeft } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

import ClubHero from "@/components/club/ClubHero";
import PulseBar from "@/components/club/PulseBar";
import QuickActionsFAB from "@/components/club/QuickActionsFAB";
import ClubFeedTab from "@/components/club/ClubFeedTab";
import ClubMembersTab from "@/components/club/ClubMembersTab";

export default function ClubDetailEnhanced() {
  const [match, params] = useRoute("/community/club/:id");
  const clubId = Number(params?.id);

  const [membersOpen, setMembersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
  const announcementsQuery = trpc.community.clubs.announcements.list.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) }
  );
  const eventsQuery = trpc.community.clubs.events.list.useQuery(
    { clubId, status: "active", limit: 1 },
    { enabled: match && Number.isFinite(clubId) }
  );

  // Mutations
  const joinMutation = trpc.community.clubs.join.useMutation({
    onSuccess: () => {
      toast.success("Richiesta di iscrizione inviata!");
      utils.community.clubs.get.invalidate({ clubId });
    },
  });
  const leaveMutation = trpc.community.clubs.leave.useMutation({
    onSuccess: () => {
      toast.success("Hai lasciato il club");
      utils.community.clubs.get.invalidate({ clubId });
    },
  });
  const rsvpMutation = trpc.community.clubs.events.rsvp.useMutation({
    onSuccess: () => { eventsQuery.refetch(); },
  });

  if (!match || !Number.isFinite(clubId)) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12 lg:py-4">
          <p className="text-muted-foreground">Club non trovato</p>
        </div>
      </AppLayout>
    );
  }

  if (clubQuery.isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12 lg:py-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </AppLayout>
    );
  }

  const club = clubQuery.data as any;
  if (!club) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12 lg:py-4">
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
  const isMember = Boolean(club.is_member);

  const pinnedAnnouncements = (announcementsQuery.data as any[])?.filter(
    (a: any) => a.announcement?.isPinned
  ) ?? [];
  const nextEvent = (eventsQuery.data as any[])?.[0] ?? null;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4 pb-24 px-4">
        {/* Hero */}
        <ClubHero
          club={club}
          onOpenMembers={() => setMembersOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onJoin={() => joinMutation.mutate({ clubId })}
          onLeave={() => leaveMutation.mutate({ clubId })}
          isJoining={joinMutation.isPending}
          isLeaving={leaveMutation.isPending}
        />

        {/* Pulse Bar */}
        {isMember && (
          <PulseBar stats={statsQuery.data as any} themeColor={club.theme_color ?? "cyan"} />
        )}

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

        {/* Next Event */}
        {nextEvent && isMember && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="surface-panel p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-display">Prossimo evento</span>
            </div>
            <h3 className="font-bold">{nextEvent.event?.title ?? nextEvent.title}</h3>
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
              {(nextEvent.event?.startTime ?? nextEvent.startTime) && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(nextEvent.event?.startTime ?? nextEvent.startTime).toLocaleDateString("it-IT", {
                    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              )}
              {(nextEvent.event?.location ?? nextEvent.location) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {nextEvent.event?.location ?? nextEvent.location}
                </span>
              )}
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant={nextEvent.userRsvp === "going" ? "neon" : "outline-neon"}
                onClick={() => rsvpMutation.mutate({ eventId: nextEvent.event?.id ?? nextEvent.id, status: "going" })}
              >
                Partecipo {nextEvent.attendeeCount ? `(${nextEvent.attendeeCount})` : ""}
              </Button>
              <Button
                size="sm"
                variant={nextEvent.userRsvp === "maybe" ? "neon" : "ghost-neon"}
                onClick={() => rsvpMutation.mutate({ eventId: nextEvent.event?.id ?? nextEvent.id, status: "maybe" })}
              >
                Forse
              </Button>
            </div>
          </motion.div>
        )}

        {/* Feed */}
        {isMember && <ClubFeedTab clubId={clubId} isMember={isMember} />}

        {/* Quick Actions FAB */}
        <QuickActionsFAB
          isMember={isMember}
          isStaff={isStaff}
          onPost={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          onCreateEvent={() => toast.info("Vai alla sezione eventi per creare un evento")}
          onInvite={() => toast.info("Funzione inviti in arrivo")}
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
              onSaved={() => {
                setSettingsOpen(false);
                utils.community.clubs.get.invalidate({ clubId });
              }}
            />
          </SheetContent>
        </Sheet>
      </div>
    </AppLayout>
  );
}

/* ---- Settings Form ---- */

function ClubSettingsForm({ club, clubId, onSaved }: { club: any; clubId: number; onSaved: () => void }) {
  const [name, setName] = useState(club.name);
  const [description, setDescription] = useState(club.description ?? "");
  const [tagline, setTagline] = useState(club.tagline ?? "");
  const [themeColor, setThemeColor] = useState(club.theme_color ?? "cyan");
  const [visibility, setVisibility] = useState(club.visibility ?? "public");

  const updateMutation = trpc.community.clubs.update.useMutation({
    onSuccess: () => { toast.success("Club aggiornato!"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="mt-4 space-y-4">
      <div>
        <label className="text-sm font-medium">Nome</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="text-sm font-medium">Tagline</label>
        <Input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={200} placeholder="Motto del club..." />
      </div>
      <div>
        <label className="text-sm font-medium">Descrizione</label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </div>
      <div>
        <label className="text-sm font-medium">Colore tema</label>
        <div className="flex gap-2 mt-1">
          {(["cyan", "lime", "coral", "violet"] as const).map((c) => (
            <button
              key={c}
              className={`h-8 w-8 rounded-full border-2 transition-transform ${themeColor === c ? "scale-125 border-white" : "border-transparent"}`}
              style={{ backgroundColor: `var(--electric-${c})` }}
              onClick={() => setThemeColor(c)}
            />
          ))}
        </div>
      </div>
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
      <Button
        variant="neon"
        className="w-full"
        disabled={updateMutation.isPending}
        onClick={() => updateMutation.mutate({
          clubId,
          name,
          description,
          tagline,
          themeColor: themeColor as any,
          visibility: visibility as any,
        })}
      >
        {updateMutation.isPending ? "Salvataggio..." : "Salva modifiche"}
      </Button>
    </div>
  );
}
