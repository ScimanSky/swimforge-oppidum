import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import ClubPbLeaderboardPage from "./ClubPbLeaderboardPage";

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 99 }, isAuthenticated: true, loading: false }),
}));
vi.mock("@/components/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

afterEach(cleanup);

const row = (userId: number, displayName: string, timeCs: number) => ({
  rank: userId,
  userId,
  displayName,
  avatarUrl: null,
  masterCategory: null,
  timeCs,
  achievedAt: "2026-03-14T10:00:00.000Z",
});

type Request = { path: string; input: any; respond: (data: unknown) => void };

/**
 * The page with real tRPC and TanStack Query; every request waits in `requests` until the
 * test answers it, so the page can be looked at while a request is in flight.
 */
function renderWithServer(club: unknown) {
  const requests: Request[] = [];
  const link: TRPCLink<AppRouter> = () => ({ op }) =>
    observable((observer) => {
      const respond = (data: unknown) => {
        observer.next({ result: { data } } as never);
        observer.complete();
      };
      if (op.path === "community.clubs.get") respond(club);
      else requests.push({ path: op.path, input: op.input, respond });
    });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const client = trpc.createClient({ links: [link] });
  render(
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Router hook={memoryLocation({ path: "/community/club/7/pb" }).hook}>
          <ClubPbLeaderboardPage />
        </Router>
      </QueryClientProvider>
    </trpc.Provider>
  );
  return requests;
}

const leaderboardRequests = (requests: Request[]) => requests.filter((r) => r.path === "records.clubLeaderboard");

describe("Record del club con la query vera", () => {
  it("chi non è iscritto non fa partire la richiesta della classifica", async () => {
    const requests = renderWithServer({ id: 7, name: "Rari Nantes", is_member: false });
    expect(await screen.findByText("Iscriviti al club per vedere i suoi record.")).toBeTruthy();
    expect(leaderboardRequests(requests)).toEqual([]);
  });

  it("scrivendo la categoria la classifica resta a schermo, segnata in aggiornamento, e si chiede una volta", async () => {
    const requests = renderWithServer({ id: 7, name: "Rari Nantes", is_member: true });
    await waitFor(() => expect(leaderboardRequests(requests)).toHaveLength(1));
    leaderboardRequests(requests)[0].respond({ leaderboard: [row(1, "Ada Rossi", 6532)] });
    const list = await screen.findByRole("list", { name: "Stile libero 100 m · vasca 25 m" });
    expect(within(list).getByText("Ada Rossi")).toBeTruthy();
    expect(list.getAttribute("aria-busy")).toBeNull();

    await userEvent.setup({ delay: null }).type(screen.getByRole("textbox", { name: "Categoria master" }), "M35");
    // Typing asks nothing yet; the pause asks once, for «M35».
    expect(leaderboardRequests(requests)).toHaveLength(1);
    await waitFor(() => expect(leaderboardRequests(requests)).toHaveLength(2));
    expect(leaderboardRequests(requests)[1].input).toMatchObject({ masterCategory: "M35" });

    // In flight: no skeleton, the current ranking stays, marked busy.
    expect(screen.queryByText(/Caricamento della classifica/)).toBeNull();
    const busy = screen.getByRole("list", { name: "Stile libero 100 m · vasca 25 m" });
    expect(within(busy).getByText("Ada Rossi")).toBeTruthy();
    expect(busy.getAttribute("aria-busy")).toBe("true");

    leaderboardRequests(requests)[1].respond({ leaderboard: [row(2, "Bruno Sanna", 7010)] });
    await waitFor(() => expect(screen.getByText("Bruno Sanna")).toBeTruthy());
    expect(screen.queryByText("Ada Rossi")).toBeNull();
    expect(screen.getByRole("list", { name: "Stile libero 100 m · vasca 25 m" }).getAttribute("aria-busy")).toBeNull();
  });
});
