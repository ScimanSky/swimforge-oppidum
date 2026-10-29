import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ClubHistoryAthletesPage from "./ClubHistoryAthletesPage";
import ClubHistoryMeetsPage from "./ClubHistoryMeetsPage";

const state = vi.hoisted(() => ({ loading: true }));

const helpers = vi.hoisted(() => {
  // Like TanStack Query: a disabled query has no data and stays pending; `loading` holds the
  // club and the history config in their first fetch.
  const query = (data: () => unknown, followsLoading = false) => ({
    useQuery: (_input?: unknown, options?: { enabled?: boolean }) => {
      if (options?.enabled === false || (followsLoading && state.loading)) {
        return { data: undefined, isLoading: followsLoading && state.loading, isPending: true, refetch: vi.fn() };
      }
      return { data: data(), isLoading: false, isPending: false, refetch: vi.fn() };
    },
  });
  return { query };
});

vi.mock("@/lib/trpc", () => {
  const { query } = helpers;
  const result = {
    id: 1,
    meet_name: "Trofeo d'autunno",
    event_label: "100 SL",
    meet_date: "2025-11-09",
    final_time_raw: "1:05.32",
    record_raw: "1:06.10",
    points: 812.4,
    athlete_name: "Ada Rossi",
  };
  return {
    trpc: {
      community: {
        clubs: {
          get: query(() => ({ id: 7, name: "Rari Nantes", is_member: true }), true),
          history: {
            config: { get: query(() => ({ enabled: true }), true) },
            athletes: {
              list: query(() => ({
                items: [{ id: 1, athlete_slug: "ada-rossi", athlete_name: "Ada Rossi", results_count: 1, meets_count: 1 }],
                total: 1,
                seasons: [],
              })),
              get: query(() => ({ athlete: { athleteName: "Ada Rossi", updatedAt: null }, results: [result] })),
            },
            meets: {
              list: query(() => ({
                items: [{ id: 1, meet_slug: "trofeo", meet_name: "Trofeo d'autunno", results_count: 1 }],
                total: 1,
                seasons: [],
              })),
              get: query(() => ({ meet: { meetName: "Trofeo d'autunno" }, stats: { resultsCount: 1, athletesCount: 1 } })),
              results: query(() => [result]),
            },
          },
        },
      },
    },
  };
});

vi.mock("@/components/AppLayout", () => {
  const AppLayout = ({ children }: any) => <div>{children}</div>;
  return { default: AppLayout, AppLayout };
});

function page(path: string, Page: ComponentType) {
  return (
    <Router hook={memoryLocation({ path }).hook}>
      <Page />
    </Router>
  );
}

describe("Storico del club: dal caricamento ai dati", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.loading = true;
  });

  it("storico atleti: la pagina si apre dopo il caricamento", () => {
    const { rerender } = render(page("/community/club/7/history/athletes", ClubHistoryAthletesPage));
    expect(screen.getByText(/Caricamento storico atleti/)).toBeTruthy();

    state.loading = false;
    rerender(page("/community/club/7/history/athletes", ClubHistoryAthletesPage));
    expect(screen.getByRole("heading", { name: "Storico Atleti" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ada Rossi" })).toBeTruthy();
  });

  it("storico meeting: la pagina si apre dopo il caricamento", () => {
    const { rerender } = render(page("/community/club/7/history/meets", ClubHistoryMeetsPage));
    expect(screen.getByText(/Caricamento storico meeting/)).toBeTruthy();

    state.loading = false;
    rerender(page("/community/club/7/history/meets", ClubHistoryMeetsPage));
    expect(screen.getByRole("heading", { name: "Storico Meeting" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Trofeo d'autunno" })).toBeTruthy();
  });
});
