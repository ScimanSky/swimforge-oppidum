import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { afterEach, describe, expect, it } from "vitest";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import PostReactions from "./PostReactions";

afterEach(cleanup);

const RESPONSES: Record<string, unknown> = {
  "community.reactions.list": [
    { reactionType: "fire", count: 2 },
    { reactionType: "clap", count: 1 },
  ],
  "community.reactions.userReaction": null,
};

function renderWithServer(ui: React.ReactElement) {
  const calls: string[] = [];
  const link: TRPCLink<AppRouter> = () => ({ op }) =>
    observable(observer => {
      calls.push(op.path);
      observer.next({ result: { data: RESPONSES[op.path] ?? null } } as never);
      observer.complete();
    });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const client = trpc.createClient({ links: [link] });
  render(
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </trpc.Provider>,
  );
  return calls;
}

describe("PostReactions: conteggio senza dati iniziali", () => {
  it("carica le reazioni al mount e mostra il totale sul cuore", async () => {
    const calls = renderWithServer(<PostReactions postId={7} variant="heart" />);
    expect(await screen.findByRole("button", { name: "Reagisci, 3 reazioni" })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(calls).toContain("community.reactions.list");
  });

  it("con dati iniziali mostra subito il totale", () => {
    renderWithServer(
      <PostReactions postId={8} variant="heart" initialReactions={[{ reactionType: "fire", count: 4 }]} />,
    );
    expect(screen.getByRole("button", { name: "Reagisci, 4 reazioni" })).toBeInTheDocument();
  });
});
