import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ClubInvite from "./ClubInvite";

const state = vi.hoisted(() => ({
  mutation: { isPending: false, data: undefined as any, error: null as any },
  calls: [] as any[],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    community: {
      clubs: {
        acceptInvite: {
          useMutation: () => ({
            ...state.mutation,
            mutate: (vars: any) => state.calls.push(vars),
          }),
        },
      },
    },
  },
}));

vi.mock("@/components/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

function renderInvite() {
  render(
    <Router hook={memoryLocation({ path: "/community/invite/abc123" }).hook}>
      <ClubInvite />
    </Router>
  );
}

describe("ClubInvite (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.mutation = { isPending: false, data: undefined, error: null };
    state.calls.length = 0;
  });

  it("accetta l'invito del link, senza h1", () => {
    renderInvite();
    expect(state.calls[0]).toEqual({ code: "abc123" });
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Invito al club" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Torna alla community" }).getAttribute("href")).toBe(
      "/home/community"
    );
  });

  it("dopo l'ingresso porta al club", () => {
    state.mutation = { isPending: false, data: { clubId: 5 }, error: null };
    renderInvite();
    expect(state.calls).toEqual([]);
    expect(screen.getByRole("status").textContent).toContain("Sei entrato nel club.");
    expect(screen.getByRole("link", { name: "Vai al club" }).getAttribute("href")).toBe(
      "/community/club/5"
    );
  });

  it("segnala un invito non valido", () => {
    state.mutation = { isPending: false, data: undefined, error: new Error("scaduto") };
    renderInvite();
    expect(screen.getByRole("status").textContent).toContain("Invito non valido o scaduto");
    expect(screen.queryByRole("link", { name: "Vai al club" })).toBeNull();
  });
});
