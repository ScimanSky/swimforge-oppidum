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
  badges: [] as any[],
  achievementDefinitions: [] as any[],
  userAchievementBadges: [] as any[],
  activities: [] as any[],
  records: [] as any[],
  theme: "dark" as "dark" | "light",
  setTheme: vi.fn() as ((theme: "dark" | "light") => void) | undefined,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ data: { id: 7, name: "Marta", email: "marta@example.com" } }) } },
    profile: { get: { useQuery: () => ({ data: state.profile }) } },
    records: {
      getByUser: { useQuery: () => ({ data: { records: state.records }, isLoading: false }) },
    },
    activities: { list: { useQuery: () => ({ data: state.activities }) } },
    badges: {
      progress: { useQuery: () => ({ data: state.badges }) },
      getAchievementBadgeDefinitions: { useQuery: () => ({ data: state.achievementDefinitions }) },
      getUserAchievementBadges: { useQuery: () => ({ data: state.userAchievementBadges }) },
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
    state.theme = "dark";
    state.setTheme = vi.fn();
  });
  afterEach(() => {
    cleanup();
  });

  it("no h1 (the title is in the shell header): the name is an h2, with profile badge and social counters", () => {
    renderProfile();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Marta Rossi" })).toBeInTheDocument();
    expect(screen.getByText("@marta_swims")).toBeInTheDocument();
    expect(screen.getByText("Squalo")).toBeInTheDocument();
    expect(screen.getByText("31").parentElement).toHaveTextContent("31 Follower");
    expect(screen.getByText("9").parentElement).toHaveTextContent("9 Seguiti");
    expect(screen.getByRole("link", { name: /Modifica profilo/ })).toHaveAttribute("href", "/settings");
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

    const preview = document.querySelector('[data-tour="badges-nav"]') as HTMLElement;
    expect(preview).not.toBeNull();
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
    const preview = document.querySelector('[data-tour="badges-nav"]') as HTMLElement;
    expect(preview).not.toBeNull();
    expect(preview).toHaveTextContent("Ancora nessun badge");
    expect(within(preview).queryAllByRole("listitem")).toHaveLength(0);
    expect(within(preview).getByRole("link", { name: /Vedi tutti/ })).toHaveAttribute("href", "/badges");
  });

  it("stats section is the tour anchor and uses metrics, never a «—»", () => {
    renderProfile();
    const stats = document.querySelector('[data-tour="profile-stats"]') as HTMLElement;
    expect(stats).not.toBeNull();
    expect(stats).toHaveTextContent("3,2 km Distanza totale");
    expect(stats).toHaveTextContent("1:02 h Tempo totale");
    expect(stats).toHaveTextContent("2 Sessioni");
    expect(stats).not.toHaveTextContent("—");
    // Without SWOLF data the SWOLF metrics are left out.
    expect(stats).not.toHaveTextContent("SWOLF");
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

  it("«Aspetto» reflects the light theme", () => {
    state.theme = "light";
    renderProfile();
    expect(screen.getByRole("radio", { name: "Chiaro" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Scuro" })).not.toBeChecked();
  });
});
