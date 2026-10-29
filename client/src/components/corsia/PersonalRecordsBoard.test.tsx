import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalRecordsBoard } from "./PersonalRecordsBoard";

const state = vi.hoisted(() => ({
  inputs: [] as Array<{ userId: number; finaGender: "male" | "female" }>,
  options: [] as Array<{ enabled?: boolean; placeholderData?: unknown }>,
  records: [] as any[],
  isPending: false,
  isPlaceholderData: false,
  error: null as unknown,
  refetch: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    records: {
      getByUser: {
        // Like TanStack Query: a disabled query has no data and stays pending.
        useQuery: (input: any, options: any) => {
          state.inputs.push(input);
          state.options.push(options);
          const base = { refetch: state.refetch, isPlaceholderData: state.isPlaceholderData };
          if (options?.enabled === false || state.isPending) {
            return { ...base, data: undefined, isPending: true, isError: false };
          }
          if (state.error) return { ...base, data: undefined, isPending: false, isError: true };
          return { ...base, data: { records: state.records }, isPending: false, isError: false };
        },
      },
    },
  },
}));

const record = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  strokeType: "freestyle",
  distanceMeters: 100,
  poolLengthMeters: 25,
  timeCs: 6512,
  source: "official",
  achievedAt: new Date(2026, 4, 3),
  finaPoints: 612.4,
  ...overrides,
});

const lastGender = () => state.inputs[state.inputs.length - 1]?.finaGender;
const lastOptions = () => state.options[state.options.length - 1];

describe("PersonalRecordsBoard", () => {
  beforeEach(() => {
    state.inputs = [];
    state.options = [];
    state.records = [record()];
    state.isPending = false;
    state.isPlaceholderData = false;
    state.error = null;
    state.refetch.mockClear();
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
  });

  it("a record: stroke and distance, pool, time, source, FINA points and date", () => {
    render(<PersonalRecordsBoard userId={7} />);
    const board = screen.getByRole("region", { name: "Record personali" });
    const item = within(board).getByRole("listitem");
    expect(item).toHaveTextContent("Stile libero 100 m");
    expect(item).toHaveTextContent("Vasca 25 m");
    expect(item).toHaveTextContent("1:05.12");
    expect(item).toHaveTextContent("Gara · 612 punti FINA");
    expect(item).toHaveTextContent("3 mag 2026");
  });

  it("null FINA points and a missing date are left out, never a «—» or «0 punti»", () => {
    state.records = [record({ finaPoints: null, achievedAt: null })];
    render(<PersonalRecordsBoard userId={7} />);
    const item = screen.getByRole("listitem");
    expect(item).not.toHaveTextContent("punti FINA");
    expect(item).not.toHaveTextContent("—");
  });

  it("«Tabelle FINA» is a visible label; switching keeps the list on screen while loading", () => {
    render(<PersonalRecordsBoard userId={7} />);
    expect(screen.getByText("Tabelle FINA")).toBeVisible();
    expect(screen.getByRole("radiogroup", { name: "Tabelle FINA" })).toBeInTheDocument();
    expect(lastOptions()?.placeholderData).toBeTypeOf("function");
  });

  it("men's tables by default; «Donne» switches the query, not saved without persist", async () => {
    localStorage.setItem("swimforge:finaGender", "female");
    render(<PersonalRecordsBoard userId={7} />);
    const group = screen.getByRole("radiogroup", { name: "Tabelle FINA" });
    expect(within(group).getByRole("radio", { name: "Uomini" })).toBeChecked();
    expect(lastGender()).toBe("male");

    localStorage.clear();
    await userEvent.click(within(group).getByRole("radio", { name: "Donne" }));
    expect(within(group).getByRole("radio", { name: "Donne" })).toBeChecked();
    expect(lastGender()).toBe("female");
    expect(state.inputs.every(input => input.userId === 7)).toBe(true);
    expect(localStorage.getItem("swimforge:finaGender")).toBeNull();
  });

  it("with persist: starts from the remembered choice and saves the new one", async () => {
    localStorage.setItem("swimforge:finaGender", "female");
    render(<PersonalRecordsBoard userId={7} persist />);
    expect(screen.getByRole("radio", { name: "Donne" })).toBeChecked();
    expect(lastGender()).toBe("female");

    await userEvent.click(screen.getByRole("radio", { name: "Uomini" }));
    expect(localStorage.getItem("swimforge:finaGender")).toBe("male");
  });

  it("loading and empty states", () => {
    state.isPending = true;
    state.records = [];
    render(<PersonalRecordsBoard userId={7} />);
    expect(screen.getByRole("status")).toHaveTextContent("Caricamento dei record…");
    cleanup();

    state.isPending = false;
    render(<PersonalRecordsBoard userId={7} emptyText="Nessun record pubblico." />);
    expect(screen.getByText("Nessun record pubblico.")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("not enabled yet (the swimmer is loading): loading state, nothing asked, never «nessun record»", () => {
    render(<PersonalRecordsBoard userId={0} enabled={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("Caricamento dei record…");
    expect(screen.queryByText("Ancora nessun record personale.")).toBeNull();
    expect(lastOptions()?.enabled).toBe(false);
  });

  it("the other tables with an empty previous list: loading, not «nessun record»", () => {
    state.isPlaceholderData = true;
    state.records = [];
    render(<PersonalRecordsBoard userId={7} />);
    expect(screen.getByRole("status")).toHaveTextContent("Caricamento dei record…");
    expect(screen.queryByText("Ancora nessun record personale.")).toBeNull();
  });

  it("a failed load says so with «Riprova», never «nessun record»", async () => {
    state.error = new Error("boom");
    render(<PersonalRecordsBoard userId={7} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a caricare i dati");
    // Inside the records card: no card of its own.
    expect(screen.getByRole("alert")).not.toHaveClass("surface-panel");
    expect(screen.queryByText("Ancora nessun record personale.")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch).toHaveBeenCalled();
  });
});
