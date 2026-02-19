# Club Dashboard Redesign

## Problem

Clubs lack identity, are not customizable, have low real interaction, and the UX is confusing (too many tabs, important actions buried).

## Solution: Club Dashboard

Replace the 6-tab structure with a single-page scrollable dashboard that gives each club a unique identity and surfaces content + actions immediately.

## Design

### 1. Personalizable Hero

- Owner picks a **theme color** (mapped to existing neon vars: cyan, lime, coral, violet)
- **Logo/avatar** upload (separate from cover image)
- **Tagline** field (short motto under club name)
- Theme color tints header, borders, accents throughout the club page

**Schema changes:** Add `themeColor`, `logoUrl`, `tagline` to `communityClubs` table.

### 2. Pulse Bar

Compact stats bar below the hero showing live weekly data:

- Total km swum by members
- Number of sessions
- Active members count
- Next event with countdown

**Backend:** New endpoint for weekly aggregate stats (query socialPosts + member activity).

### 3. Unified Content (No Tabs)

Single scrollable page with sections:

1. **Pinned announcements** (max 1-2, always visible at top)
2. **Next event** card with inline RSVP
3. **Feed** — member posts with reactions and comments
4. **Media** integrated into feed (not a separate gallery tab)

**Members** and **Settings** move to a drawer/dialog accessible from icons in the hero.

### 4. Quick Actions FAB

Floating action button always visible at bottom:

- Tap to expand: "Post", "Create Event", "Invite Member"
- Staff-only actions gated by role as today

### 5. Mini Leaderboard

Top 3 members of the week (by km or sessions) shown in the pulse bar area. Creates natural competition without a full challenge system.

## Technical Scope

### Schema Migration
- Add columns to `communityClubs`: `themeColor` (text), `logoUrl` (text), `tagline` (text)

### Backend
- New `clubs.weeklyStats` endpoint (aggregate km, sessions, active members)
- Update `clubs.update` to accept new fields (themeColor, logoUrl, tagline)

### Frontend
- Rewrite `ClubDetailEnhanced.tsx` as scrollable dashboard layout
- Extract reusable content from existing tab components (ClubFeedTab, ClubEventsTab, etc.)
- New components: PulseBar, ClubHero (enhanced), QuickActionsFAB, MiniLeaderboard
- Members/settings in a Sheet/drawer component

### What We Keep
- All existing API endpoints (feed, events, announcements, gallery, members, invites)
- Permission/role system unchanged
- XP system unchanged
- Media upload pipeline unchanged
