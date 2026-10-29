import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Profile from "./Profile";

const badge = (id: number, earned: boolean, earnedAt?: Date) => ({
  id,
  code: `dist_${id}km`,
  name: `Badge ${id}`,
  description: "",
  category: "distance",
  rarity: "common",
  earned,
  progress: earned ? 100 : 20,
  earnedAt,
});

const state = vi.hoisted(() => ({
  profile: undefined as any,
  profileLoading: false,
  badgesLoading: false,
  badges: [] as any[],
  achievementDefinitions: [] as any[],
  userAchievementBadges: [] as any[],
  activities: [] as any[],
  records: [] as any[],
  recordsEnabled: [] as Array<boolean | undefined>,
  me: { id: 7, name: "Marta", email: "marta@example.com" } as any,
  meError: null as unknown,
  meRefetch: vi.fn(),
  theme: "dark" as "dark" | "light",
  setTheme: vi.fn() as ((theme: "dark" | "light") => void) | undefined,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      me: {
        useQuery: () => ({
          data: state.me,
          isError: Boolean(state.meError),
          refetch: state.meRefetch,
        }),
      },
    },
    profile: {
      get: {
        useQuery: () => ({
          data: state.profileLoading ? undefined : state.profile,
          isLoading: state.profileLoading,
        }),
      },
    },
    records: {
      getByUser: {
        useQuery: (_input: unknown, options?: { enabled?: boolean }) => {
          state.recordsEnabled.push(options?.enabled);
          return options?.enabled === false
            ? { data: undefined, isPending: true, isError: false }
            : { data: { records: state.records }, isPending: false, isError: false };
        },
      },
    },
    activities: { list: { useQuery: () => ({ data: state.activities }) } },
    badges: {
      progress: {
        useQuery: () => ({ data: state.badgesLoading ? undefined : state.badges, isLoading: state.badgesLoading }),
      },
      getAchievementBadgeDefinitions: { useQuery: () => ({ data: state.achievementDefinitions }) },
      getUserAchievementBadges: {
        useQuery: () => ({
          data: state.badgesLoading ? undefined : state.userAchievementBadges,
          isLoading: state.badgesLoading,
        }),
      },
    },
  },
}));

vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: state.theme, setTheme: state.setTheme, switchable: true }),
}));

vi.mock("@/components/AppLayout", () => ({
  default: ({ children }: any) => <div data-testid="app-layout">{children}</div>,
}));

function renderProfile() {
  const location = memoryLocation({ path: "/profile", record: true });
  render(
    <Router hook={location.hook}>
      <Profile />
    </Router>
  );
}

describe("Profilo (Corsia)", () => {
  beforeEach(() => {
    state.profile = {
      username: "marta_swims",
      lastName: "Rossi",
      level: 12,
      totalXp: 4420,
      currentLevelXp: 4000,
      nextLevelXp: 5000,
      xpToNextLevel: 580,
      totalDistanceMeters: 3200,
      totalTimeSeconds: 3720,
      totalSessions: 2,
      followerCount: 31,
      followingCount: 9,
      profileBadge: { name: "Squalo" },
      avatarUrl: null,
      createdAt: new Date(2025, 2, 12),
    };
    state.badges = [];
    state.achievementDefinitions = [];
    state.userAchievementBadges = [];
    state.activities = [];
    state.records = [];
    state.recordsEnabled = [];
    state.me = { id: 7, name: "Marta", email: "marta@example.com" };
    state.meError = null;
    state.meRefetch = vi.fn();
    state.profileLoading = false;
    state.badgesLoading = false;
    state.theme = "dark";
    state.setTheme = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const badgesRegion = () => screen.getByRole("region", { name: "Badge" });

  it("no h1 (the title is in the shell header): the name is an h2, with profile badge and social counters", () => {
    renderProfile();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Marta Rossi" })).toBeInTheDocument();
    expect(screen.getByText("@marta_swims")).toBeInTheDocument();
    expect(screen.getByText("Squalo")).toBeInTheDocument();
    expect(screen.getByText("31").parentElement).toHaveTextContent("31 Follower");
    expect(screen.getByText("9").parentElement).toHaveTextContent("9 Seguiti");
    expect(screen.getByRole("link", { name: /Modifica profilo/ })).toHaveAttribute("href", "/settings");
    expect(screen.getByText("Iscritto dal 12 mar 2025")).toBeInTheDocument();
    // No activities: the primary stroke is unknown and left out.
    expect(screen.queryByText(/Stile principale/)).toBeNull();
    expect(screen.queryByText("Non disponibile")).toBeNull();
  });

  it("primary stroke from the activities, with its label", () => {
    state.activities = [{ strokeType: "backstroke" }, { strokeType: "backstroke" }, { strokeType: "freestyle" }];
    renderProfile();
    expect(screen.getByText("Stile principale: Dorso")).toBeInTheDocument();
  });

  it("while profile.get loads: skeletons, no placeholders", () => {
    state.profileLoading = true;
    renderProfile();
    expect(screen.getAllByRole("status").some(el => el.textContent?.includes("Caricamento…"))).toBe(true);
    expect(screen.queryByText("Aggiungi una bio dalle impostazioni.")).toBeNull();
    expect(screen.queryByText("Località non impostata")).toBeNull();
    expect(screen.queryByText(/Sessioni totali/)).toBeNull();
    expect(screen.queryByRole("region", { name: "Livello" })).toBeNull();
  });

  it("while the badges load: no empty state yet", () => {
    state.badgesLoading = true;
    renderProfile();
    expect(badgesRegion()).not.toHaveTextContent("Ancora nessun badge");
    expect(within(badgesRegion()).getByRole("status")).toHaveTextContent("Caricamento dei badge…");
  });

  it("LevelCard shows the level from profile.get and the progress within the level", () => {
    renderProfile();
    const card = screen.getByRole("region", { name: "Livello" });
    expect(within(card).getByText("12")).toBeInTheDocument();
    expect(within(card).getByText("580 XP")).toBeInTheDocument();
    expect(within(card).getByText("al livello 13")).toBeInTheDocument();
    expect(within(card).getByText("4.420 XP totali")).toBeInTheDocument();
    // (4420 - 4000) / (5000 - 4000)
    expect(within(card).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
  });

  it("badge preview: six earned badges, newest first, and «Vedi tutti» to /badges", () => {
    state.badges = [
      ...Array.from({ length: 6 }, (_, i) => badge(i + 1, true, new Date(2026, 0, i + 1))),
      badge(20, false),
    ];
    state.achievementDefinitions = [{ id: 1, name: "Prima gara", iconUrl: "/badges_new/race.png" }];
    state.userAchievementBadges = [
      { badgeId: 1, awardedAt: new Date(2026, 5, 1), badge: { id: 1, name: "Prima gara", iconUrl: "/badges_new/race.png" } },
    ];

    renderProfile();

    const preview = badgesRegion();
    expect(preview).toHaveAttribute("data-tour", "badges-nav");
    const items = within(preview).getAllByRole("listitem");
    expect(items).toHaveLength(6);
    expect(items[0]).toHaveTextContent("Prima gara");
    expect(within(items[0]).getByRole("img", { name: "Prima gara" })).toBeInTheDocument();
    expect(within(preview).queryByText("Badge 1")).toBeNull();
    expect(preview).toHaveTextContent("7 di 8");
    expect(within(preview).getByRole("link", { name: /Vedi tutti/ })).toHaveAttribute("href", "/badges");
  });

  it("badge preview stays with zero badges: «Ancora nessun badge · Vedi tutti»", () => {
    state.badges = [badge(1, false), badge(2, false)];
    renderProfile();
    const preview = badgesRegion();
    expect(preview).toHaveAttribute("data-tour", "badges-nav");
    expect(preview).toHaveTextContent("Ancora nessun badge");
    expect(within(preview).queryAllByRole("listitem")).toHaveLength(0);
    expect(within(preview).getByRole("link", { name: /Vedi tutti/ })).toHaveAttribute("href", "/badges");
  });

  it("stats section is the tour anchor and uses metrics, never a «—»", () => {
    renderProfile();
    const stats = screen.getByRole("region", { name: "Riepilogo" });
    expect(stats).toHaveAttribute("data-tour", "profile-stats");
    expect(stats).toHaveTextContent("3,2 km Distanza totale");
    expect(stats).toHaveTextContent("1:02 h Tempo totale");
    expect(stats).toHaveTextContent("2 Sessioni");
    expect(stats).not.toHaveTextContent("—");
    // Without SWOLF data the SWOLF metrics are left out.
    expect(stats).not.toHaveTextContent("SWOLF");
  });

  it("SWOLF and streaks are scoped to the recent swims; lifetime totals are not", () => {
    // Wednesday 28 October 2026, 18:00: two swims in the week of 19 October, two in this week.
    vi.useFakeTimers({ now: new Date(2026, 9, 28, 18), toFake: ["Date"] });
    state.activities = [
      { activityDate: new Date(2026, 9, 19, 10), avgSwolf: 40 },
      { activityDate: new Date(2026, 9, 23, 10), avgSwolf: 36 },
      { activityDate: new Date(2026, 9, 26, 10), avgSwolf: 38 },
      { activityDate: new Date(2026, 9, 28, 10), avgSwolf: 38 },
    ];
    renderProfile();

    const stats = screen.getByRole("region", { name: "Riepilogo" });
    const recent = within(stats).getByRole("region", { name: "Ultime 4 nuotate" });
    expect(recent).toHaveTextContent("38 SWOLF medio");
    expect(recent).toHaveTextContent("36 SWOLF migliore");
    expect(recent).toHaveTextContent("2 sett. Serie attuale");
    expect(recent).toHaveTextContent("2 sett. Serie migliore");
    expect(recent).toHaveTextContent("Serie: settimane di fila con almeno 2 nuotate.");
    expect(recent).not.toHaveTextContent("Distanza totale");
    expect(stats).toHaveTextContent("3,2 km Distanza totale");
  });

  it("a week with a single swim breaks the current streak, the best one stays", () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 28, 18), toFake: ["Date"] });
    state.activities = [
      { activityDate: new Date(2026, 9, 5, 10) },
      { activityDate: new Date(2026, 9, 7, 10) },
      { activityDate: new Date(2026, 9, 12, 10) },
      { activityDate: new Date(2026, 9, 14, 10) },
      { activityDate: new Date(2026, 9, 21, 10) },
      { activityDate: new Date(2026, 9, 26, 10) },
      { activityDate: new Date(2026, 9, 27, 10) },
    ];
    renderProfile();
    const recent = screen.getByRole("region", { name: "Ultime 7 nuotate" });
    expect(recent).toHaveTextContent("1 sett. Serie attuale");
    expect(recent).toHaveTextContent("2 sett. Serie migliore");
  });

  it("links to Statistiche and Impostazioni", () => {
    renderProfile();
    expect(screen.getByRole("link", { name: "Statistiche" })).toHaveAttribute("href", "/profile/performance");
    expect(screen.getByRole("link", { name: "Impostazioni" })).toHaveAttribute("href", "/settings");
  });

  it("«Aspetto» is a radiogroup that switches the theme via setTheme", async () => {
    renderProfile();
    const group = screen.getByRole("radiogroup", { name: "Aspetto" });
    const dark = within(group).getByRole("radio", { name: "Scuro" });
    const light = within(group).getByRole("radio", { name: "Chiaro" });
    expect(dark).toBeChecked();
    expect(light).not.toBeChecked();

    await userEvent.click(light);
    expect(state.setTheme).toHaveBeenCalledWith("light");
  });

  it("«Aspetto» follows the radio keyboard pattern: arrows pick the next option", async () => {
    renderProfile();
    screen.getByRole("radio", { name: "Scuro" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(state.setTheme).toHaveBeenCalledWith("light");
  });

  it("«Aspetto» is disabled when the theme cannot be switched", () => {
    state.setTheme = undefined;
    renderProfile();
    expect(screen.getByRole("radio", { name: "Scuro" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Chiaro" })).toBeDisabled();
  });

  it("«Aspetto» reflects the light theme", () => {
    state.theme = "light";
    renderProfile();
    expect(screen.getByRole("radio", { name: "Chiaro" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Scuro" })).not.toBeChecked();
  });
  it("records: asked for once auth.me is known, loading meanwhile, never «nessun record»", () => {
    state.me = undefined;
    renderProfile();
    const board = screen.getByRole("region", { name: "Record personali" });
    expect(within(board).getByRole("status")).toHaveTextContent("Caricamento dei record…");
    expect(within(board).queryByText("Ancora nessun record personale.")).toBeNull();
    expect(state.recordsEnabled.every(enabled => enabled === false)).toBe(true);
  });

  it("records: a failed auth.me offers «Riprova» instead of an endless loading", async () => {
    state.me = undefined;
    state.meError = new Error("rete");
    renderProfile();
    expect(screen.queryByRole("region", { name: "Record personali" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.meRefetch).toHaveBeenCalled();
  });

  it("records: own profile remembers the FINA tables", async () => {
    renderProfile();
    await userEvent.click(screen.getByRole("radio", { name: "Donne" }));
    expect(localStorage.getItem("swimforge:finaGender")).toBe("female");
    localStorage.clear();
  });
});
