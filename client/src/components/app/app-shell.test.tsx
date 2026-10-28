import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AppShell } from "./app-shell";

const state = vi.hoisted(() => ({
  me: { id: 1, name: "Mario Rossi", email: "mario@example.com", role: "user" } as any,
  calls: [] as string[],
  garminSync: vi.fn(),
  garminPending: false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      me: { useQuery: () => ({ data: state.me }) },
      logout: {
        useMutation: () => ({
          mutateAsync: async () => {
            state.calls.push("logout");
          },
        }),
      },
      heartbeat: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    profile: { get: { useQuery: () => ({ data: { avatarUrl: null } }) } },
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signOut: async () => {
        state.calls.push("supabase.signOut");
      },
    },
  },
}));

vi.mock("@/lib/push", () => ({
  unregisterPushToken: async () => {
    state.calls.push("unregisterPushToken");
  },
}));

vi.mock("@/lib/session-token", () => ({
  clearNativeSessionToken: () => {
    state.calls.push("clearNativeSessionToken");
  },
}));

vi.mock("@/hooks/useGarminQuickSync", () => ({
  useGarminQuickSync: () => ({
    sync: state.garminSync,
    isPending: state.garminPending,
    connected: true,
  }),
}));

vi.mock("@/components/NotificationBell", () => ({
  default: () => <div data-testid="notification-bell" />,
}));

vi.mock("@/components/DirectMessages", () => ({
  default: () => <div data-testid="direct-messages" />,
}));

vi.mock("@/components/social/CreatePostSheet", () => ({
  CreatePostSheet: ({ open, initialContent }: any) =>
    open ? <div data-testid="create-post-sheet">{initialContent ?? "vuoto"}</div> : null,
}));

vi.mock("@/components/onboarding/OnboardingNudgeManager", () => ({
  OnboardingNudgeManager: () => null,
}));

function renderShell(path: string) {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook}>
      <AppShell>
        <p>contenuto</p>
      </AppShell>
    </Router>
  );
  return location.history!;
}

const bottomBar = () => screen.getByRole("navigation", { name: "Navigazione principale" });
const rail = () => screen.getByRole("navigation", { name: "Navigazione" });

describe("AppShell Corsia", () => {
  beforeEach(() => {
    state.me = { id: 1, name: "Mario Rossi", email: "mario@example.com", role: "user" };
    state.calls = [];
    state.garminPending = false;
    state.garminSync.mockReset();
  });
  afterEach(cleanup);

  it("su /goals: cinque voci, Allena attiva, sotto-schede con Obiettivi attivo", () => {
    renderShell("/goals");
    const bar = within(bottomBar());
    for (const label of ["Oggi", "Feed", "Allena", "Community"]) {
      expect(bar.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(bar.getByRole("button", { name: "Crea" })).toBeInTheDocument();
    expect(bar.getByRole("link", { name: "Allena" })).toHaveAttribute("aria-current", "page");
    expect(bar.getByRole("link", { name: "Feed" })).not.toHaveAttribute("aria-current");
    expect(within(rail()).getByRole("link", { name: "Allena" })).toHaveAttribute("aria-current", "page");

    const tabs = within(screen.getByRole("navigation", { name: "Sezioni di Allena" }));
    expect(tabs.getByRole("link", { name: "Obiettivi" })).toHaveAttribute("aria-current", "page");
    expect(tabs.getByRole("link", { name: "Attività" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("heading", { level: 1, name: "Allena" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Indietro" })).not.toBeInTheDocument();
  });

  it("su /challenges: Community attiva e sotto-schede di Community", () => {
    renderShell("/challenges");
    expect(within(bottomBar()).getByRole("link", { name: "Community" })).toHaveAttribute("aria-current", "page");
    const tabs = within(screen.getByRole("navigation", { name: "Sezioni di Community" }));
    expect(tabs.getByRole("link", { name: "Sfide" })).toHaveAttribute("aria-current", "page");
  });

  it("su /track/4: nessuna sotto-scheda, Indietro torna ad Allena", async () => {
    const history = renderShell("/track/4");
    expect(screen.queryByRole("navigation", { name: /^Sezioni di/ })).not.toBeInTheDocument();
    expect(within(bottomBar()).getByRole("link", { name: "Allena" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(screen.getByRole("button", { name: "Indietro" }));
    // jsdom starts with history.length === 1: no in-app history, so it goes to the parent.
    expect(history.at(-1)).toBe("/track");
  });

  it("su /home mostra il marchio e nessun pulsante Indietro", () => {
    renderShell("/home");
    expect(screen.getAllByText("SwimForge").length).toBeGreaterThan(0);
    expect(within(bottomBar()).getByRole("link", { name: "Feed" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: "Indietro" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /^Sezioni di/ })).not.toBeInTheDocument();
  });

  it("su /today: Oggi attiva, titolo Oggi", () => {
    renderShell("/today");
    expect(within(bottomBar()).getByRole("link", { name: "Oggi" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { level: 1, name: "Oggi" })).toBeInTheDocument();
  });

  it("il pulsante Crea apre il foglio con le quattro azioni", async () => {
    renderShell("/today");
    await userEvent.click(within(bottomBar()).getByRole("button", { name: "Crea" }));
    const sheet = within(screen.getByRole("dialog", { name: "Crea" }));
    expect(sheet.getByRole("button", { name: "Nuovo post" })).toBeInTheDocument();
    expect(sheet.getByRole("link", { name: "Messaggio" })).toHaveAttribute("href", "/messages?new=1");
    expect(sheet.getByRole("button", { name: "Bozza IA del post" })).toBeInTheDocument();
    expect(sheet.getByRole("button", { name: "Sincronizza Garmin" })).toBeInTheDocument();
  });

  it("Nuovo post e Bozza IA aprono il CreatePostSheet, Sincronizza Garmin avvia la sincronizzazione", async () => {
    renderShell("/today");
    const openSheet = () => userEvent.click(within(bottomBar()).getByRole("button", { name: "Crea" }));

    await openSheet();
    await userEvent.click(screen.getByRole("button", { name: "Nuovo post" }));
    expect(screen.getByTestId("create-post-sheet")).toHaveTextContent("vuoto");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Crea" })).not.toBeInTheDocument());

    await openSheet();
    await userEvent.click(screen.getByRole("button", { name: "Bozza IA del post" }));
    expect(screen.getByTestId("create-post-sheet")).toHaveTextContent("Bozza IA:");

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Crea" })).not.toBeInTheDocument());
    await openSheet();
    await userEvent.click(screen.getByRole("button", { name: "Sincronizza Garmin" }));
    expect(state.garminSync).toHaveBeenCalledTimes(1);
  });

  it("il Crea della barra laterale apre lo stesso menu", async () => {
    renderShell("/home");
    const aside = within(screen.getByRole("complementary"));
    await userEvent.click(aside.getByRole("button", { name: "Crea" }));
    expect(aside.getByRole("button", { name: "Crea" })).toHaveAttribute("aria-expanded", "true");
    for (const label of ["Nuovo post", "Bozza IA del post", "Sincronizza Garmin"]) {
      expect(aside.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(aside.getByRole("link", { name: "Messaggio" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Crea" })).not.toBeInTheDocument();
  });

  it("il listener swimforge:open-create-post apre il CreatePostSheet con il testo", async () => {
    renderShell("/home");
    window.dispatchEvent(
      new CustomEvent("swimforge:open-create-post", { detail: { initialContent: "  Nuovo PB!  " } })
    );
    expect(await screen.findByTestId("create-post-sheet")).toHaveTextContent("Nuovo PB!");
  });

  it("menu avatar in italiano, Moderazione solo per gli admin, Esci nell'ordine di sempre", async () => {
    state.me = { ...state.me, role: "admin" };
    const hrefSetter = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, set href(value: string) { hrefSetter(value); } },
    });
    try {
      renderShell("/today");
      await userEvent.click(screen.getByRole("button", { name: "Menu del profilo" }));
      const menu = within(await screen.findByRole("menu"));
      const items = menu.getAllByRole("menuitem").map(item => item.textContent?.trim());
      expect(items).toEqual(["Profilo", "Impostazioni", "Moderazione", "Esci"]);

      await userEvent.click(menu.getByRole("menuitem", { name: "Esci" }));
      await waitFor(() => expect(hrefSetter).toHaveBeenCalledWith("/"));
      expect(state.calls).toEqual([
        "unregisterPushToken",
        "logout",
        "clearNativeSessionToken",
        "supabase.signOut",
      ]);
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    }
  });

  it("menu avatar senza Moderazione per gli utenti normali", async () => {
    renderShell("/today");
    await userEvent.click(screen.getByRole("button", { name: "Menu del profilo" }));
    const menu = within(await screen.findByRole("menu"));
    expect(menu.queryByRole("menuitem", { name: "Moderazione" })).not.toBeInTheDocument();
  });

  it("niente etichette inglesi o del vecchio menu", () => {
    renderShell("/goals");
    for (const text of [/Sezioni\b(?! di)/, /Training/, /Sign out/, /Settings/, /Profile/]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
  });

  it("data-tour restano sugli elementi della barra in basso", () => {
    renderShell("/home");
    const bar = bottomBar();
    expect(bar).toHaveAttribute("data-tour", "main-navigation");
    for (const anchor of ["create-post", "track-section", "club-directory"]) {
      expect(bar.querySelector(`[data-tour="${anchor}"]`)).not.toBeNull();
    }
  });
});
