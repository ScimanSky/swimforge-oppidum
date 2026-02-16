# Club Dashboard Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 6-tab club page with a unified scrollable dashboard featuring personalizable identity, pulse stats, quick actions, and integrated content.

**Architecture:** Rewrite `ClubDetailEnhanced.tsx` as a single-page dashboard. Add schema columns for club identity (themeColor, logoUrl, tagline). Add a weeklyStats endpoint. Extract content from existing tab components into new dashboard sections. Members/settings go into Sheet drawers.

**Tech Stack:** React, wouter, tRPC, Tailwind, Framer Motion, Drizzle, Postgres, Supabase, Lucide icons, Sonner toast

---

## Task 1: Schema Migration — Add Identity Columns

**Files:**
- Create: `drizzle/0024_add_club_identity.sql`
- Modify: `drizzle/schema.ts:363-376`

**Step 1: Create migration SQL**

```sql
-- Add club identity fields for dashboard personalization
ALTER TABLE IF EXISTS community_clubs
  ADD COLUMN IF NOT EXISTS theme_color varchar(20) DEFAULT 'cyan',
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS tagline varchar(200);
```

Save to `drizzle/0024_add_club_identity.sql`.

**Step 2: Update Drizzle schema**

In `drizzle/schema.ts`, add 3 columns to the `communityClubs` table (after line 370, before `ownerId`):

```typescript
themeColor: varchar("theme_color", { length: 20 }).default("cyan"),
logoUrl: text("logo_url"),
tagline: varchar("tagline", { length: 200 }),
```

**Step 3: Commit**

```bash
git add drizzle/0024_add_club_identity.sql drizzle/schema.ts
git commit -m "feat(clubs): add themeColor, logoUrl, tagline columns for club identity"
```

---

## Task 2: Backend — Update clubs.get and clubs.update

**Files:**
- Modify: `server/db_clubs.ts:56-84` (getClubById — add new columns to SELECT)
- Modify: `server/db_clubs.ts:625-652` (updateClub — accept new fields)
- Modify: `server/routers/community.router.ts:606-618` (clubs.get)
- Modify: `server/routers/community.router.ts:746-771` (clubs.update — add input fields)

**Step 1: Update getClubById in db_clubs.ts**

Add `c.theme_color`, `c.logo_url`, `c.tagline` to the SELECT statement at line ~63:

```sql
SELECT
  c.id, c.name, c.description, c.rules, c.cover_image_url,
  c.is_private, c.visibility, c.owner_id, c.created_at,
  c.theme_color, c.logo_url, c.tagline,
  ...
```

**Step 2: Update updateClub in db_clubs.ts**

Add new fields to the function signature and `.set()` block:

```typescript
export async function updateClub(userId: number, clubId: number, input: {
  name?: string;
  description?: string | null;
  coverImageUrl?: string | null;
  visibility?: "public" | "private" | "invite";
  rules?: string | null;
  themeColor?: string;
  logoUrl?: string | null;
  tagline?: string | null;
}) {
```

Add to the `.set()` object:

```typescript
...(input.themeColor !== undefined ? { themeColor: input.themeColor } : {}),
...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
```

**Step 3: Update clubs.update router input**

In `community.router.ts` clubs.update, add to the `.input()` zod schema:

```typescript
themeColor: z.enum(["cyan", "lime", "coral", "violet"]).optional(),
logoUrl: z.string().max(5000).optional().nullable(),
tagline: z.string().max(200).optional().nullable(),
```

And pass them through to `updateClub()`:

```typescript
return updateClub(ctx.user.id, input.clubId, {
  ...existing fields...,
  themeColor: input.themeColor,
  logoUrl: input.logoUrl ?? undefined,
  tagline: input.tagline ?? undefined,
});
```

**Step 4: Commit**

```bash
git add server/db_clubs.ts server/routers/community.router.ts
git commit -m "feat(clubs): expose themeColor, logoUrl, tagline in get/update endpoints"
```

---

## Task 3: Backend — Weekly Stats Endpoint

**Files:**
- Modify: `server/db_clubs.ts` (add getClubWeeklyStats function)
- Modify: `server/routers/community.router.ts` (add clubs.weeklyStats route)

**Step 1: Add getClubWeeklyStats to db_clubs.ts**

Append this function at the end of `db_clubs.ts`. It aggregates:
- Total posts this week by club members
- Active members this week (members who posted)
- Next upcoming event

```typescript
export async function getClubWeeklyStats(clubId: number) {
  const db = await getDb();
  if (!db) return null;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const result = await db.execute(sql`
    SELECT
      COALESCE((
        SELECT COUNT(*)::int
        FROM social_posts p
        WHERE p.club_id = ${clubId}
          AND p.created_at >= ${oneWeekAgo.toISOString()}
      ), 0) AS posts_this_week,
      COALESCE((
        SELECT COUNT(DISTINCT p.user_id)::int
        FROM social_posts p
        WHERE p.club_id = ${clubId}
          AND p.created_at >= ${oneWeekAgo.toISOString()}
      ), 0) AS active_members,
      COALESCE((
        SELECT COUNT(*)::int
        FROM community_club_members m
        WHERE m.club_id = ${clubId} AND m.status = 'active'
      ), 0) AS total_members,
      (
        SELECT JSON_BUILD_OBJECT(
          'id', e.id,
          'title', e.title,
          'startTime', e.start_time,
          'eventType', e.event_type
        )
        FROM club_events e
        WHERE e.club_id = ${clubId}
          AND e.status = 'active'
          AND e.start_time > NOW()
        ORDER BY e.start_time ASC
        LIMIT 1
      ) AS next_event
  `);

  return result.rows[0] ?? null;
}
```

**Step 2: Add router endpoint**

Add `clubs.weeklyStats` in `community.router.ts` (after the clubs.get block):

```typescript
weeklyStats: protectedProcedure
  .input(z.object({ clubId: z.number() }))
  .query(async ({ input }) => {
    const { getClubWeeklyStats } = await import("../db_clubs");
    return getClubWeeklyStats(input.clubId);
  }),
```

**Step 3: Commit**

```bash
git add server/db_clubs.ts server/routers/community.router.ts
git commit -m "feat(clubs): add weeklyStats endpoint for dashboard pulse bar"
```

---

## Task 4: Frontend — ClubHero Component

**Files:**
- Create: `client/src/components/club/ClubHero.tsx`

**Step 1: Create ClubHero component**

This is the personalizable hero section at the top of the dashboard. It shows: cover image, club logo, name, tagline, member count, theme color tinting, and action icons (members drawer, settings).

```tsx
import { motion } from "framer-motion";
import { Users, Settings, ArrowLeft, Crown, Shield, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ClubHeroProps {
  club: {
    id: number;
    name: string;
    description?: string | null;
    cover_image_url?: string | null;
    theme_color?: string | null;
    logo_url?: string | null;
    tagline?: string | null;
    visibility: string;
    member_count: number;
    member_role?: string | null;
    is_member: boolean;
    owner_id: number;
  };
  onOpenMembers: () => void;
  onOpenSettings: () => void;
  onJoin: () => void;
  onLeave: () => void;
  isJoining?: boolean;
  isLeaving?: boolean;
}

const themeColorMap: Record<string, string> = {
  cyan: "var(--electric-cyan)",
  lime: "var(--electric-lime)",
  coral: "var(--electric-coral)",
  violet: "var(--electric-violet)",
};

export default function ClubHero({ club, onOpenMembers, onOpenSettings, onJoin, onLeave, isJoining, isLeaving }: ClubHeroProps) {
  const color = themeColorMap[club.theme_color ?? "cyan"] ?? themeColorMap.cyan;
  const isStaff = ["owner", "admin", "moderator"].includes(club.member_role ?? "");

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[26px]"
      style={{ borderColor: color, borderWidth: "1px" }}
    >
      {/* Cover image */}
      <div className="h-32 sm:h-44 bg-gradient-to-br from-surface-panel to-black/60 relative">
        {club.cover_image_url && (
          <img src={club.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        {/* Back button */}
        <Link href="/home/community">
          <Button variant="ghost" size="icon" className="absolute top-3 left-3 text-white/80 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        {/* Action icons */}
        <div className="absolute top-3 right-3 flex gap-2">
          <Button variant="ghost" size="icon" className="text-white/80 hover:text-white" onClick={onOpenMembers}>
            <Users className="h-5 w-5" />
          </Button>
          {isStaff && (
            <Button variant="ghost" size="icon" className="text-white/80 hover:text-white" onClick={onOpenSettings}>
              <Settings className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Club info overlay */}
      <div className="relative px-4 pb-4 -mt-10">
        <div className="flex items-end gap-3">
          {/* Logo */}
          <Avatar className="h-16 w-16 border-2" style={{ borderColor: color }}>
            <AvatarImage src={club.logo_url ?? undefined} />
            <AvatarFallback style={{ color }} className="text-xl font-bold font-display">
              {club.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold font-display truncate" style={{ color }}>
              {club.name}
            </h1>
            {club.tagline && (
              <p className="text-sm text-muted-foreground truncate">{club.tagline}</p>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-3">
          <Badge variant="outline" className="text-xs" style={{ borderColor: color, color }}>
            {club.member_count} membri
          </Badge>
          <Badge variant="outline" className="text-xs capitalize">
            {club.visibility}
          </Badge>
          {club.member_role && (
            <Badge variant="outline" className="text-xs" style={{ borderColor: color, color }}>
              {club.member_role}
            </Badge>
          )}
        </div>

        {/* Join/Leave */}
        {!club.is_member ? (
          <Button className="mt-3 w-full" variant="neon" onClick={onJoin} disabled={isJoining}>
            {isJoining ? "Richiesta..." : club.visibility === "public" ? "Unisciti" : "Richiedi accesso"}
          </Button>
        ) : club.member_role !== "owner" ? (
          <Button className="mt-3" variant="ghost" size="sm" onClick={onLeave} disabled={isLeaving}>
            Lascia club
          </Button>
        ) : null}
      </div>
    </motion.div>
  );
}
```

**Step 2: Commit**

```bash
git add client/src/components/club/ClubHero.tsx
git commit -m "feat(clubs): add ClubHero component with personalizable theme colors"
```

---

## Task 5: Frontend — PulseBar Component

**Files:**
- Create: `client/src/components/club/PulseBar.tsx`

**Step 1: Create PulseBar component**

Shows weekly stats: posts, active members, total members, next event countdown.

```tsx
import { motion } from "framer-motion";
import { Activity, Users, MessageCircle, Calendar } from "lucide-react";

interface PulseBarProps {
  stats: {
    posts_this_week: number;
    active_members: number;
    total_members: number;
    next_event: { id: number; title: string; startTime: string; eventType: string } | null;
  } | null;
  themeColor: string;
}

const themeColorMap: Record<string, string> = {
  cyan: "var(--electric-cyan)",
  lime: "var(--electric-lime)",
  coral: "var(--electric-coral)",
  violet: "var(--electric-violet)",
};

function formatCountdown(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return "In corso";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  if (days > 0) return `tra ${days}g ${hours}h`;
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  return `tra ${hours}h ${minutes}m`;
}

export default function PulseBar({ stats, themeColor }: PulseBarProps) {
  const color = themeColorMap[themeColor] ?? themeColorMap.cyan;

  if (!stats) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="surface-panel p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-sm"
      style={{ borderColor: color, borderWidth: "1px" }}
    >
      <div className="flex flex-col items-center gap-1">
        <MessageCircle className="h-4 w-4" style={{ color }} />
        <span className="font-bold font-display" style={{ color }}>{stats.posts_this_week}</span>
        <span className="text-xs text-muted-foreground">post / settimana</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Activity className="h-4 w-4" style={{ color }} />
        <span className="font-bold font-display" style={{ color }}>{stats.active_members}</span>
        <span className="text-xs text-muted-foreground">attivi</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Users className="h-4 w-4" style={{ color }} />
        <span className="font-bold font-display" style={{ color }}>{stats.total_members}</span>
        <span className="text-xs text-muted-foreground">membri</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Calendar className="h-4 w-4" style={{ color }} />
        {stats.next_event ? (
          <>
            <span className="font-bold font-display truncate max-w-full" style={{ color }}>
              {formatCountdown(stats.next_event.startTime)}
            </span>
            <span className="text-xs text-muted-foreground truncate max-w-full">{stats.next_event.title}</span>
          </>
        ) : (
          <>
            <span className="font-bold font-display text-muted-foreground">—</span>
            <span className="text-xs text-muted-foreground">nessun evento</span>
          </>
        )}
      </div>
    </motion.div>
  );
}
```

**Step 2: Commit**

```bash
git add client/src/components/club/PulseBar.tsx
git commit -m "feat(clubs): add PulseBar component for weekly stats dashboard"
```

---

## Task 6: Frontend — QuickActionsFAB Component

**Files:**
- Create: `client/src/components/club/QuickActionsFAB.tsx`

**Step 1: Create FAB component**

Floating action button with expandable menu: Post, Create Event, Invite.

```tsx
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, PenSquare, Calendar, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QuickActionsFABProps {
  isMember: boolean;
  isStaff: boolean;
  onPost: () => void;
  onCreateEvent: () => void;
  onInvite: () => void;
}

export default function QuickActionsFAB({ isMember, isStaff, onPost, onCreateEvent, onInvite }: QuickActionsFABProps) {
  const [open, setOpen] = useState(false);

  if (!isMember) return null;

  const actions = [
    { icon: PenSquare, label: "Posta", onClick: onPost, show: true },
    { icon: Calendar, label: "Evento", onClick: onCreateEvent, show: isStaff },
    { icon: UserPlus, label: "Invita", onClick: onInvite, show: isStaff },
  ].filter((a) => a.show);

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col-reverse items-end gap-2">
      <Button
        variant="neon"
        size="icon"
        className="h-14 w-14 rounded-full shadow-lg"
        onClick={() => setOpen(!open)}
      >
        <motion.div animate={{ rotate: open ? 45 : 0 }}>
          {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </motion.div>
      </Button>
      <AnimatePresence>
        {open && actions.map((action, i) => (
          <motion.div
            key={action.label}
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.8 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-2"
          >
            <span className="text-xs bg-black/80 text-white px-2 py-1 rounded">{action.label}</span>
            <Button
              variant="outline-neon"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => { action.onClick(); setOpen(false); }}
            >
              <action.icon className="h-4 w-4" />
            </Button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add client/src/components/club/QuickActionsFAB.tsx
git commit -m "feat(clubs): add QuickActionsFAB for quick post/event/invite actions"
```

---

## Task 7: Frontend — Rewrite ClubDetailEnhanced as Dashboard

**Files:**
- Modify: `client/src/pages/ClubDetailEnhanced.tsx` (full rewrite)

This is the largest task. Replace the tab-based layout with the unified dashboard.

**Step 1: Rewrite ClubDetailEnhanced.tsx**

The new page structure:
1. ClubHero (Task 4)
2. PulseBar (Task 5)
3. Pinned Announcements section (inline, extracted from ClubAnnouncementsTab)
4. Next Event card with RSVP (inline, extracted from ClubEventsTab)
5. Feed section (reuse ClubFeedTab as-is)
6. Members Sheet drawer
7. Settings Sheet drawer (club edit form with new identity fields)
8. QuickActionsFAB (Task 6)

```tsx
import { useState } from "react";
import { useRoute } from "wouter";
import { motion } from "framer-motion";
import { Calendar, MapPin, Pin, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ClubHero from "@/components/club/ClubHero";
import PulseBar from "@/components/club/PulseBar";
import QuickActionsFAB from "@/components/club/QuickActionsFAB";
import ClubFeedTab from "@/components/club/ClubFeedTab";
import ClubMembersTab from "@/components/club/ClubMembersTab";

export default function ClubDetailEnhanced() {
  const [, params] = useRoute("/community/club/:id");
  const clubId = Number(params?.id);

  const [membersOpen, setMembersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [postMode, setPostMode] = useState(false);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  // Queries
  const clubQuery = trpc.community.clubs.get.useQuery(
    { clubId },
    { enabled: !!clubId }
  );
  const statsQuery = trpc.community.clubs.weeklyStats.useQuery(
    { clubId },
    { enabled: !!clubId }
  );
  const announcementsQuery = trpc.community.clubs.announcements.list.useQuery(
    { clubId },
    { enabled: !!clubId }
  );
  const eventsQuery = trpc.community.clubs.events.list.useQuery(
    { clubId, status: "active", limit: 1 },
    { enabled: !!clubId }
  );

  // Mutations
  const joinMutation = trpc.community.clubs.join.useMutation({
    onSuccess: () => { toast.success("Iscrizione completata!"); clubQuery.refetch(); },
  });
  const leaveMutation = trpc.community.clubs.leave.useMutation({
    onSuccess: () => { toast.success("Hai lasciato il club"); clubQuery.refetch(); },
  });
  const rsvpMutation = trpc.community.clubs.events.rsvp.useMutation({
    onSuccess: () => { eventsQuery.refetch(); },
  });

  const club = clubQuery.data as any;
  if (!club) return <div className="p-8 text-center text-muted-foreground">Caricamento...</div>;

  const memberRole = club.member_role ?? "";
  const isStaff = ["owner", "admin", "moderator"].includes(memberRole);
  const isMember = !!club.is_member;

  const pinnedAnnouncements = (announcementsQuery.data as any[])?.filter((a: any) => a.announcement?.isPinned) ?? [];
  const nextEvent = (eventsQuery.data as any[])?.[0] ?? null;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24">
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
        onPost={() => {/* scroll to feed post input */
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onCreateEvent={() => setCreateEventOpen(true)}
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
          <ClubSettingsForm club={club} clubId={clubId} onSaved={() => { setSettingsOpen(false); clubQuery.refetch(); }} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ---- Settings Form (inline) ---- */

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
          {["cyan", "lime", "coral", "violet"].map((c) => (
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
        <label className="text-sm font-medium">Visibilit&agrave;</label>
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
        onClick={() => updateMutation.mutate({ clubId, name, description, tagline, themeColor: themeColor as any, visibility: visibility as any })}
      >
        {updateMutation.isPending ? "Salvataggio..." : "Salva modifiche"}
      </Button>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add client/src/pages/ClubDetailEnhanced.tsx
git commit -m "feat(clubs): rewrite club page as unified dashboard with hero, pulse bar, and FAB"
```

---

## Task 8: Run Migration and Smoke Test

**Step 1: Run migration on database**

```bash
psql $DATABASE_URL -f drizzle/0024_add_club_identity.sql
```

Expected: `ALTER TABLE` with no errors.

**Step 2: Start dev server and smoke test**

```bash
npm run dev
```

Open browser, navigate to an existing club. Verify:
- Hero renders with club name, default cyan theme
- Pulse bar shows stats (all zeros if no activity)
- Pinned announcements show if any exist
- Next event card shows if any upcoming event
- Feed loads below
- FAB appears for members
- Members sheet opens on icon click
- Settings sheet opens for staff with theme color picker

**Step 3: Fix any issues found during smoke test**

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(clubs): address dashboard smoke test issues"
```

---

## Task 9: Push

**Step 1: Push all commits**

```bash
git push origin swimforge-4.4
```
