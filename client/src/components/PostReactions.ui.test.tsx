import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import PostReactions from "./PostReactions";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const server = vi.hoisted(() => ({
  responses: {} as Record<string, unknown>,
  failing: new Set<string>(),
  calls: [] as Array<{ path: string; input: unknown }>,
}));

function renderWithServer(ui: React.ReactElement) {
  const link: TRPCLink<AppRouter> = () => ({ op }) =>
    observable(observer => {
      server.calls.push({ path: op.path, input: op.input });
      if (server.failing.has(op.path)) {
        observer.error(
          TRPCClientError.from({ error: { message: "FORBIDDEN", code: -32603, data: { code: "FORBIDDEN" } } } as never)
        );
        return;
      }
      observer.next({ result: { data: server.responses[op.path] ?? null } } as never);
      observer.complete();
    });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const client = trpc.createClient({ links: [link] });
  render(
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </trpc.Provider>
  );
}

describe("PostReactions (emoji)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    server.responses = {
      "community.reactions.list": [
        { reactionType: "fire", count: "2" },
        { reactionType: "love", count: 1 },
      ],
      "community.reactions.userReaction": null,
      "community.reactions.toggle": { actionXp: { awardedXp: 5 } },
    };
    server.failing = new Set();
    server.calls = [];
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it("names the trigger and reads the grouped reactions with their counts", async () => {
    renderWithServer(<PostReactions postId={7} />);
    expect(screen.getByRole("button", { name: "Reagisci" })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Reazioni" });
    expect(within(list).getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "🔥Fuoco 2",
      "❤️Cuore 1",
    ]);
  });

  it("your reaction names the trigger and is pressed in the picker", async () => {
    server.responses["community.reactions.userReaction"] = { reactionType: "clap" };
    renderWithServer(<PostReactions postId={7} />);
    const trigger = await screen.findByRole("button", { name: "La tua reazione: Applauso. Cambia reazione" });
    await userEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Applauso" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Fuoco" })).toHaveAttribute("aria-pressed", "false");
  });

  it("picking a reaction sends it; no «+N XP»: XP comes only from swimming", async () => {
    renderWithServer(<PostReactions postId={7} />);
    await userEvent.click(screen.getByRole("button", { name: "Reagisci" }));
    await userEvent.click(screen.getByRole("button", { name: "Onda" }));
    await waitFor(() =>
      expect(server.calls).toContainEqual({
        path: "community.reactions.toggle",
        input: { postId: 7, reactionType: "wave" },
      })
    );
    // Even an old server's answer with XP shows no toast.
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("a failed reaction is an Italian toast, never the bare code", async () => {
    server.failing.add("community.reactions.toggle");
    renderWithServer(<PostReactions postId={7} />);
    await userEvent.click(screen.getByRole("button", { name: "Reagisci" }));
    await userEvent.click(screen.getByRole("button", { name: "Fuoco" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Reazione non riuscita, riprova"));
  });
});

describe("PostReactions (heart, in the feed)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    server.responses = {
      "community.reactions.list": [{ reactionType: "fire", count: 3 }],
      "community.reactions.userReaction": { reactionType: "fire" },
    };
    server.failing = new Set();
    server.calls = [];
  });

  it("your reaction fills the heart in the action blue, never the XP orange", async () => {
    renderWithServer(<PostReactions postId={7} variant="heart" />);
    const trigger = await screen.findByRole("button", { name: "Cambia reazione, 3 reazioni" });
    const heart = trigger.querySelector("svg");
    expect(heart).toHaveClass("fill-current", "text-action-text");
    expect(heart).not.toHaveClass("text-xp");
  });
});
