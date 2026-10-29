import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ClubDetailEnhanced from "./ClubDetailEnhanced";

const state = vi.hoisted(() => ({
  club: null as any,
  clubError: null as any,
  clubLoading: false,
  stats: null as any,
  statsError: null as any,
  announcements: [] as any[],
  events: [] as any[],
  joinCalls: [] as any[],
  leaveCalls: [] as any[],
  updateCalls: [] as any[],
  // `enabled` option of the last call of each query, by name.
  enabled: {} as Record<string, unknown>,
  refetch: vi.fn(),
}));

const helpers = vi.hoisted(() => {
  // Like TanStack Query: a disabled query has no data and stays pending.
  const query = (
    name: string,
    data: () => unknown,
    error: () => unknown = () => null,
    loading: () => boolean = () => false
  ) => ({
    useQuery: (_input: unknown, options?: { enabled?: boolean }) => {
      state.enabled[name] = options?.enabled;
      const base = { isLoading: false, refetch: state.refetch };
      if (options?.enabled === false) return { ...base, data: undefined, isPending: true, isError: false, error: null };
      if (loading()) return { ...base, isLoading: true, data: undefined, isPending: true, isError: false, error: null };
      const failure = error();
      if (failure) return { ...base, data: undefined, isPending: false, isError: true, error: failure };
      return { ...base, data: data(), isPending: false, isError: false, error: null };
    },
  });
  const mutation = (calls?: any[]) => ({
    useMutation: () => ({
      mutate: (vars: any) => calls?.push(vars),
      mutateAsync: async (vars: any) => {
        calls?.push(vars);
      },
      isPending: false,
    }),
  });
  return { query, mutation };
});

vi.mock("@/lib/trpc", () => {
  const { query, mutation } = helpers;
  return {
    trpc: {
      community: {
        clubs: {
          get: query("get", () => state.club, () => state.clubError, () => state.clubLoading),
          weeklyStats: query("weeklyStats", () => state.stats, () => state.statsError),
          announcements: { list: query("announcements", () => state.announcements) },
          meets: { list: query("meets", () => undefined), create: mutation() },
          history: { config: { get: query("history", () => undefined) } },
          events: { list: query("events", () => state.events), create: mutation() },
          invites: query("invites", () => []),
          join: mutation(state.joinCalls),
          leave: mutation(state.leaveCalls),
          createInvite: mutation(),
          update: mutation(state.updateCalls),
          delete: mutation(),
          media: { imageKitAuth: mutation(), generateBrandAsset: mutation() },
        },
      },
      useUtils: () => ({}),
    },
  };
});

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/club/ClubFeedTab", () => ({
  default: () => <div>Feed del club</div>,
}));
vi.mock("@/components/club/EventMapEditor", () => ({ default: () => null }));
vi.mock("@/components/club/QuickActionsFAB", () => ({ default: () => null }));

const baseClub = {
  id: 7,
  name: "Rari Nantes",
  tagline: "Nuotiamo insieme",
  cover_image_url: "https://example.com/cover.jpg",
  website_url: null,
  logo_url: null,
  visibility: "public",
  member_count: 24,
  member_role: null,
  is_member: false,
  owner_id: 1,
  rules: null,
};

function renderClub() {
  render(
    <Router hook={memoryLocation({ path: "/community/club/7" }).hook}>
      <ClubDetailEnhanced />
    </Router>
  );
}

describe("ClubDetailEnhanced (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.club = { ...baseClub };
    state.clubError = null;
    state.clubLoading = false;
    state.statsError = null;
    state.updateCalls.length = 0;
    state.enabled = {};
    state.refetch.mockClear();
    toast.error.mockClear();
    state.stats = {
      posts_this_week: 5,
      active_members: 9,
      total_members: 24,
      next_event: null,
    };
    state.announcements = [];
    state.events = [];
    state.joinCalls.length = 0;
    state.leaveCalls.length = 0;
  });

  it("senza h1: nome del club come h2, copertina senza testo sopra, iscrizione diretta", async () => {
    renderClub();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    const header = screen
      .getByRole("heading", { level: 2, name: "Rari Nantes" })
      .closest("section")!;
    // The cover is a plain banner: decorative, nothing positioned over it.
    const cover = header.querySelector("img")!;
    expect(cover.getAttribute("alt")).toBe("");
    expect(cover.parentElement).toBe(header);
    expect(within(header).getByText("24 membri")).toBeTruthy();
    expect(within(header).getByText("Pubblico")).toBeTruthy();

    const stats = screen
      .getByRole("heading", { level: 3, name: "Il club questa settimana" })
      .closest("section")!;
    expect(within(stats).getByText("post")).toBeTruthy();
    expect(within(stats).getByText("5")).toBeTruthy();
    expect(
      screen.getByText("Unisciti al club per vedere gare ed eventi.")
    ).toBeTruthy();
    expect(screen.queryByText("Feed del club")).toBeNull();

    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole("button", { name: "Unisciti" }));
    expect(state.joinCalls).toEqual([{ clubId: 7 }]);
  });

  it("con il regolamento chiede di accettarlo prima di iscriversi", async () => {
    state.club = {
      ...baseClub,
      visibility: "invite",
      rules: "Rispetta la corsia.",
    };
    renderClub();
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: "Richiedi accesso" }));
    const dialog = screen.getByRole("dialog", {
      name: "Accetta regolamento club",
    });
    const accept = within(dialog).getByRole("button", {
      name: "Accetta e iscriviti",
    });
    expect(accept).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(accept);
    expect(state.joinCalls).toEqual([{ clubId: 7, acceptRules: true }]);
  });

  it("per lo staff: annunci, calendario, sezioni del club, impostazioni e feed", () => {
    state.club = { ...baseClub, is_member: true, member_role: "admin" };
    state.announcements = [
      {
        announcement: {
          id: 1,
          isPinned: true,
          title: "Vasca chiusa",
          content: "Lunedì niente allenamento",
        },
      },
      {
        announcement: {
          id: 2,
          isPinned: false,
          title: "Non fissato",
          content: "",
        },
      },
    ];
    state.events = [
      {
        event: {
          id: 3,
          title: "Uscita al mare",
          startTime: "2026-11-02T08:30:00Z",
          location: "Poetto",
        },
      },
    ];
    renderClub();

    expect(screen.getByText("Vasca chiusa")).toBeTruthy();
    expect(screen.queryByText("Non fissato")).toBeNull();

    const agenda = screen
      .getByRole("heading", { level: 3, name: "Gare ed eventi" })
      .closest("section")!;
    expect(
      within(agenda)
        .getByRole("link", { name: /Uscita al mare/ })
        .getAttribute("href")
    ).toBe("/community/club/7/event/3");

    const sections = screen.getByRole("navigation", {
      name: "Sezioni del club",
    });
    expect(
      within(sections).getByRole("link", { name: /Gare/ }).getAttribute("href")
    ).toBe("/community/club/7/event/3");
    expect(
      within(sections)
        .getByRole("link", { name: /Documenti/ })
        .getAttribute("href")
    ).toBe("/community/club/7/documents");
    expect(
      within(sections)
        .getByRole("link", { name: /Area coach/ })
        .getAttribute("href")
    ).toBe("/community/club/7/coach");
    expect(screen.getByText("Admin")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Impostazioni del club" })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lascia club" })).toBeTruthy();
    expect(screen.getByText("Feed del club")).toBeTruthy();
  });

  it("impostazioni: il colore serve a logo e copertina AI; «violet» è «Viola»", async () => {
    state.club = { ...baseClub, is_member: true, member_role: "owner", theme_color: "violet" };
    renderClub();
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: "Impostazioni del club" }));
    const colours = screen.getByRole("radiogroup", { name: "Colore per logo e copertina AI" });
    expect(within(colours).getAllByRole("radio").map((radio) => radio.closest("label")!.textContent)).toEqual([
      "Azzurro",
      "Verde",
      "Corallo",
      "Viola",
    ]);
    expect(within(colours).getByRole("radio", { name: "Viola" })).toBeChecked();
    expect(screen.queryByText("Grigio")).toBeNull();
    await user.click(within(colours).getByRole("radio", { name: "Verde" }));
    expect(within(colours).getByRole("radio", { name: "Verde" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Salva modifiche" }));
    expect(state.updateCalls).toEqual([expect.objectContaining({ clubId: 7, themeColor: "lime" })]);
  });

  describe("numeri della settimana", () => {
    const nextEvent = {
      id: 3,
      title: "Uscita al mare",
      startTime: "2099-11-02T08:30:00Z",
      eventType: "social",
    };
    const weekHeading = () => screen.queryByRole("heading", { level: 3, name: "Il club questa settimana" });

    it("il prossimo evento solo ai membri", () => {
      state.stats = { ...state.stats, next_event: nextEvent };
      renderClub();
      expect(weekHeading()).toBeTruthy();
      expect(screen.queryByText("Uscita al mare")).toBeNull();
      cleanup();
      state.club = { ...baseClub, is_member: true, member_role: "member" };
      renderClub();
      const stats = weekHeading()!.closest("section")!;
      expect(within(stats).getByText("Uscita al mare")).toBeTruthy();
    });

    it("club non pubblico, non membro: nessuna richiesta e nessun numero", () => {
      state.club = { ...baseClub, visibility: "invite" };
      renderClub();
      expect(state.enabled.weeklyStats).toBe(false);
      expect(weekHeading()).toBeNull();
      expect(screen.getByText("Unisciti al club per vedere gare ed eventi.")).toBeTruthy();
    });

    it("club non pubblico, membro: i numeri ci sono", () => {
      state.club = { ...baseClub, visibility: "invite", is_member: true, member_role: "member" };
      renderClub();
      expect(state.enabled.weeklyStats).toBe(true);
      expect(weekHeading()).toBeTruthy();
    });

    it("FORBIDDEN dal server: niente numeri, nessun errore mostrato", () => {
      state.statsError = { message: "Forbidden", data: { code: "FORBIDDEN" } };
      renderClub();
      expect(weekHeading()).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByText("Non riesco a caricare i dati")).toBeNull();
      expect(toast.error).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { level: 2, name: "Rari Nantes" })).toBeTruthy();
    });
  });

  describe("caricamento ed errori del club", () => {
    it("in caricamento: scheletri annunciati", () => {
      state.clubLoading = true;
      renderClub();
      expect(screen.getByRole("status").textContent).toContain("Caricamento del club");
      expect(screen.queryByText("Club non trovato.")).toBeNull();
    });

    it("errore di rete: messaggio breve e Riprova, non «Club non trovato.»", async () => {
      state.club = null;
      state.clubError = { message: "Failed to fetch", data: undefined };
      renderClub();
      expect(screen.getByText("Non riesco a caricare i dati")).toBeTruthy();
      expect(screen.queryByText("Club non trovato.")).toBeNull();
      await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Riprova" }));
      expect(state.refetch).toHaveBeenCalled();
    });

    it("NOT_FOUND e FORBIDDEN (club segreto): «Club non trovato.»", () => {
      for (const code of ["NOT_FOUND", "FORBIDDEN"]) {
        state.club = null;
        state.clubError = { message: code, data: { code } };
        renderClub();
        expect(screen.getByText("Club non trovato.")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Riprova" })).toBeNull();
        cleanup();
      }
    });
  });
});
