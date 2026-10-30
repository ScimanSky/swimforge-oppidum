import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ShellRoutes from "./ShellRoutes";
import { AppShell } from "./app-shell";
import AppLayout from "@/components/AppLayout";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      me: { useQuery: () => ({ data: { id: 1, name: "Mario Rossi", role: "user" } }) },
      logout: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
    profile: { get: { useQuery: () => ({ data: { avatarUrl: null } }) } },
  },
}));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock("@/lib/push", () => ({ unregisterPushToken: vi.fn() }));
vi.mock("@/hooks/useGarminQuickSync", () => ({
  useGarminQuickSync: () => ({ sync: vi.fn(), isPending: false, connected: true }),
}));
vi.mock("@/components/NotificationBell", () => ({ default: () => null }));
vi.mock("@/components/DirectMessages", () => ({ default: () => null }));
vi.mock("@/components/social/CreatePostSheet", () => ({ CreatePostSheet: () => null }));
vi.mock("@/components/onboarding/OnboardingNudgeManager", () => ({ OnboardingNudgeManager: () => null }));

// Pages as they are written today: each wraps itself in <AppLayout>.
vi.mock("@/pages/Goals", async () => {
  const { default: Layout } = await import("@/components/AppLayout");
  return { default: () => <Layout><p>pagina obiettivi</p></Layout> };
});
vi.mock("@/pages/Activities", async () => {
  const { default: Layout } = await import("@/components/AppLayout");
  return { default: () => <Layout><p>pagina attività</p></Layout> };
});
vi.mock("@/pages/NotFound", () => ({ default: () => <p>pagina non trovata</p> }));

describe("shell persistente", () => {
  afterEach(cleanup);

  it("una pagina con AppLayout dentro la shell non disegna una seconda shell", () => {
    render(
      <Router hook={memoryLocation({ path: "/goals" }).hook}>
        <AppShell>
          <AppLayout>
            <p>pagina</p>
          </AppLayout>
        </AppShell>
      </Router>
    );
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getAllByRole("navigation", { name: "Navigazione principale" })).toHaveLength(1);
    expect(screen.getByText("pagina").parentElement).toHaveClass("sf-page-root");
  });

  it("passando da una rotta all'altra header e barra restano gli stessi nodi", async () => {
    const location = memoryLocation({ path: "/goals" });
    render(
      <Router hook={location.hook} searchHook={location.searchHook}>
        <ShellRoutes />
      </Router>
    );
    expect(await screen.findByText("pagina obiettivi")).toBeInTheDocument();
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    const header = screen.getByRole("banner");
    const bar = screen.getByRole("navigation", { name: "Navigazione principale" });

    act(() => location.navigate("/track"));
    expect(await screen.findByText("pagina attività")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBe(header);
    expect(screen.getByRole("navigation", { name: "Navigazione principale" })).toBe(bar);
    expect(screen.getAllByRole("banner")).toHaveLength(1);
  });

  it("le rotte sconosciute mostrano NotFound dentro la shell", async () => {
    render(
      <Router hook={memoryLocation({ path: "/non-esiste" }).hook}>
        <ShellRoutes />
      </Router>
    );
    expect(await screen.findByText("pagina non trovata")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });
});
