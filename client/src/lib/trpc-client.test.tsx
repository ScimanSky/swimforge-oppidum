import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trpc } from "./trpc";
import { createTrpcLinks } from "./trpc-client";

/** A request answered only when the test says so (Gemini taking its time). */
function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

const DATA: Record<string, unknown> = {
  "statistics.getMetrics": { generatedAt: "2026-10-29T10:00:00.000Z" },
  "aiCoach.getWorkouts": { pool: null, dryland: null },
  "statistics.getInsights": ["🏊 Tecnica: la bracciata rende di più."],
};

let insightsGate = gate();
const requests: string[] = [];

/** The /api/trpc server: batched and single calls, superjson bodies; getInsights waits for its gate. */
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = new URL(String(input), "https://swimforge.it");
  const procedures = decodeURIComponent(url.pathname.replace(/^\/api\/trpc\//, "")).split(",");
  requests.push(`${procedures.join(",")}${url.searchParams.get("batch") ? " (batch)" : ""}`);
  if (procedures.includes("statistics.getInsights")) await insightsGate.promise;
  const answer = (name: string) => ({ result: { data: { json: DATA[name] } } });
  const body = url.searchParams.get("batch") ? procedures.map(answer) : answer(procedures[0]);
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
});

/** The Coach page's three queries, with or without the insights outside the batch. */
function CoachQueries({ skipBatch }: { skipBatch: boolean }) {
  const metrics = trpc.statistics.getMetrics.useQuery();
  const workouts = trpc.aiCoach.getWorkouts.useQuery();
  const insights = trpc.statistics.getInsights.useQuery(undefined, {
    trpc: { context: { skipBatch } },
  });
  return (
    <div>
      <p>{metrics.data ? "metriche pronte" : "metriche in caricamento"}</p>
      <p>{workouts.data ? "allenamenti pronti" : "allenamenti in caricamento"}</p>
      <p>{insights.data ? `consigli: ${insights.data.length}` : "consigli in caricamento"}</p>
    </div>
  );
}

function renderCoachQueries(skipBatch: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const client = trpc.createClient({ links: createTrpcLinks() });
  render(
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <CoachQueries skipBatch={skipBatch} />
      </QueryClientProvider>
    </trpc.Provider>,
  );
}

describe("tRPC links: a slow procedure outside the batch", () => {
  beforeEach(() => {
    insightsGate = gate();
    requests.length = 0;
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    insightsGate.open();
    cleanup();
    vi.unstubAllGlobals();
  });

  it("with skipBatch the metrics render while the AI insights are still loading", async () => {
    renderCoachQueries(true);

    expect(await screen.findByText("metriche pronte")).toBeTruthy();
    expect(screen.getByText("allenamenti pronti")).toBeTruthy();
    expect(screen.getByText("consigli in caricamento")).toBeTruthy();
    expect(requests.sort()).toEqual(["statistics.getInsights", "statistics.getMetrics,aiCoach.getWorkouts (batch)"]);

    await act(async () => insightsGate.open());
    expect(await screen.findByText("consigli: 1")).toBeTruthy();
  });

  it("without it the whole batch waits for the insights (what skipBatch avoids)", async () => {
    renderCoachQueries(false);

    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toBe("statistics.getMetrics,aiCoach.getWorkouts,statistics.getInsights (batch)");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getByText("metriche in caricamento")).toBeTruthy();

    await act(async () => insightsGate.open());
    expect(await screen.findByText("metriche pronte")).toBeTruthy();
    expect(screen.getByText("consigli: 1")).toBeTruthy();
  });

  it("every request keeps the credentials (cookie session on the web)", async () => {
    renderCoachQueries(true);
    await screen.findByText("metriche pronte");
    await act(async () => insightsGate.open());
    await screen.findByText("consigli: 1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls as unknown as Array<[unknown, RequestInit]>) {
      expect(init.credentials).toBe("include");
    }
  });
});
