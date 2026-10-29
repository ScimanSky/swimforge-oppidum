import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalRecordsBoard } from "./PersonalRecordsBoard";

const state = vi.hoisted(() => ({
  inputs: [] as Array<{ userId: number; finaGender: "male" | "female" }>,
  records: [] as any[],
  isLoading: false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    records: {
      getByUser: {
        useQuery: (input: any) => {
          state.inputs.push(input);
          return { data: { records: state.records }, isLoading: state.isLoading };
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

describe("PersonalRecordsBoard", () => {
  beforeEach(() => {
    state.inputs = [];
    state.records = [record()];
    state.isLoading = false;
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

  it("men's tables by default; «Donne» switches the query and is remembered", async () => {
    render(<PersonalRecordsBoard userId={7} />);
    const group = screen.getByRole("radiogroup", { name: "Tabelle FINA" });
    expect(within(group).getByRole("radio", { name: "Uomini" })).toBeChecked();
    expect(lastGender()).toBe("male");

    await userEvent.click(within(group).getByRole("radio", { name: "Donne" }));
    expect(within(group).getByRole("radio", { name: "Donne" })).toBeChecked();
    expect(lastGender()).toBe("female");
    expect(state.inputs.every(input => input.userId === 7)).toBe(true);
    expect(localStorage.getItem("swimforge:finaGender")).toBe("female");
  });

  it("starts from the remembered choice", () => {
    localStorage.setItem("swimforge:finaGender", "female");
    render(<PersonalRecordsBoard userId={7} />);
    expect(screen.getByRole("radio", { name: "Donne" })).toBeChecked();
    expect(lastGender()).toBe("female");
  });

  it("loading and empty states", () => {
    state.isLoading = true;
    state.records = [];
    render(<PersonalRecordsBoard userId={7} />);
    expect(screen.getByRole("status")).toHaveTextContent("Caricamento dei record…");
    cleanup();

    state.isLoading = false;
    render(<PersonalRecordsBoard userId={7} emptyText="Nessun record pubblico." />);
    expect(screen.getByText("Nessun record pubblico.")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
