import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { paceZoneRanges, type SwimMetrics } from "@shared/swimMetrics";
import { PaceZonesDialog } from "./PaceZonesDialog";
import { emptySwimMetricsFixture, swimMetricsFixture } from "./metrics-fixture";

const state = vi.hoisted(() => ({
  saveCalls: [] as any[],
  clearCalls: 0,
  saveOptions: undefined as any,
  clearOptions: undefined as any,
  invalidate: undefined as any,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    statistics: {
      setPaceZones: {
        useMutation: (options: any) => {
          state.saveOptions = options;
          return { mutate: (vars: any) => state.saveCalls.push(vars), isPending: false };
        },
      },
      clearPaceZones: {
        useMutation: (options: any) => {
          state.clearOptions = options;
          return { mutate: () => (state.clearCalls += 1), isPending: false };
        },
      },
    },
    useUtils: () => ({ statistics: { getMetrics: { invalidate: state.invalidate } } }),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const LABELS = ["Tra A1 e A2", "Tra A2 e B1", "Tra B1 e B2", "Tra B2 e C1", "Tra C1 e C2"];

async function openEditor(metrics: SwimMetrics = swimMetricsFixture()) {
  render(<PaceZonesDialog zones={metrics.zones} css={metrics.css.current} />);
  await userEvent.click(screen.getByRole("button", { name: "Le tue zone" }));
  return screen.getByRole("dialog", { name: "Le tue zone" });
}

const field = (dialog: HTMLElement, label: string) => within(dialog).getByLabelText(label) as HTMLInputElement;
const preview = (dialog: HTMLElement) =>
  within(within(dialog).getByRole("list", { name: "Anteprima delle zone" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

async function retype(dialog: HTMLElement, label: string, value: string) {
  await userEvent.clear(field(dialog, label));
  await userEvent.type(field(dialog, label), value);
}

describe("Le tue zone", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.saveCalls.length = 0;
    state.clearCalls = 0;
    state.invalidate = vi.fn();
    vi.mocked(toast.success).mockClear();
  });

  it("cinque confini, ognuno tra due zone, con i valori in uso e da dove vengono", async () => {
    const dialog = await openEditor();
    expect(LABELS.map((label) => field(dialog, label).value)).toEqual(["2:08", "2:01", "1:54", "1:49", "1:44"]);
    expect(field(dialog, "Tra A1 e A2")).toHaveAccessibleDescription(
      "Più lento: A1 Recupero attivo. Uguale o più veloce: A2 Fondo lento."
    );
    expect(dialog).toHaveTextContent(
      "Calcolo automatico: dal tuo passo soglia 1:49 (stima, affidabilità media), che è il confine tra B2 e C1; gli altri confini sono all'85%, 90%, 95% e 104% della velocità soglia."
    );
    // Automatic zones: nothing to restore.
    expect(within(dialog).queryByRole("button", { name: "Ripristina calcolo automatico" })).toBeNull();
  });

  it("anteprima delle sette zone mentre scrivi; accetta 1,50 e 1'50", async () => {
    const dialog = await openEditor();
    expect(preview(dialog)).toEqual([
      "A1 Recupero attivo · più lento di 2:08",
      "A2 Fondo lento · 2:01–2:08",
      "B1 Fondo medio · 1:54–2:01",
      "B2 Fondo medio-alto · 1:49–1:54",
      "C1 Soglia anaerobica · 1:44–1:49 · max 200 m",
      "C2 Capacità anaerobica · più veloce di 1:44 · max 150 m",
      "C3 Potenza anaerobica · più veloce di 1:44 · max 25 m",
    ]);
    await retype(dialog, "Tra B2 e C1", "1,50");
    await retype(dialog, "Tra C1 e C2", "1'45");
    expect(preview(dialog).slice(3, 5)).toEqual([
      "B2 Fondo medio-alto · 1:50–1:54",
      "C1 Soglia anaerobica · 1:45–1:50 · max 200 m",
    ]);
    await retype(dialog, "Tra C1 e C2", "1:55");
    expect(within(dialog).queryByRole("list", { name: "Anteprima delle zone" })).toBeNull();
    expect(dialog).toHaveTextContent("Ogni confine deve essere più veloce del precedente.");
  });

  it("salva i secondi per 100 m; il coach e le statistiche si aggiornano", async () => {
    const dialog = await openEditor();
    await retype(dialog, "Tra B2 e C1", "1.50");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva" }));
    expect(state.saveCalls).toEqual([{ a1a2: 128, a2b1: 121, b1b2: 114, b2c1: 110, c1c2: 104 }]);
    act(() => state.saveOptions.onSuccess({ success: true }));
    expect(state.invalidate).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Zone salvate: valgono ovunque, anche per il coach.");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("un passo non in m:ss: errore sotto il campo, niente invio", async () => {
    const dialog = await openEditor();
    await retype(dialog, "Tra A2 e B1", "2:1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva" }));
    expect(field(dialog, "Tra A2 e B1")).toHaveAttribute("aria-invalid", "true");
    expect(field(dialog, "Tra A2 e B1")).toHaveAccessibleDescription(
      "Scrivi il passo come minuti:secondi, per esempio 1:50."
    );
    expect(state.saveCalls).toHaveLength(0);
  });

  it("gli errori del server stanno sotto il loro campo, il primo prende il focus", async () => {
    const dialog = await openEditor();
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva" }));
    const order = "Il confine tra C1 e C2 deve essere più veloce di quello tra B2 e C1 (1:49).";
    const range = "Scrivi un passo tra 1:00 e 4:00 per 100 m.";
    act(() =>
      state.saveOptions.onError({
        message: "[zod]",
        data: { code: "BAD_REQUEST", zodError: { formErrors: [], fieldErrors: { a2b1: [range], c1c2: [order] } } },
      })
    );
    expect(field(dialog, "Tra A2 e B1")).toHaveAccessibleDescription(range);
    expect(field(dialog, "Tra A2 e B1")).toHaveFocus();
    expect(field(dialog, "Tra C1 e C2")).toHaveAccessibleDescription(order);
    expect(field(dialog, "Tra A1 e A2")).not.toHaveAttribute("aria-invalid");
    expect(dialog).not.toHaveTextContent("[zod]");
  });

  it("con le tue zone: «Ripristina calcolo automatico» e i valori che darebbe", async () => {
    const metrics = swimMetricsFixture();
    const bounds = { a1a2: 130, a2b1: 122, b1b2: 116, b2c1: 110, c1c2: 105 };
    metrics.zones = { ...metrics.zones, source: "manuali", bounds, ranges: paceZoneRanges(bounds), manualUpdatedAt: "2026-10-25T09:00:00.000Z" };
    const dialog = await openEditor(metrics);
    expect(LABELS.map((label) => field(dialog, label).value)).toEqual(["2:10", "2:02", "1:56", "1:50", "1:45"]);
    expect(dialog).toHaveTextContent("Il calcolo automatico darebbe: 2:08 · 2:01 · 1:54 · 1:49 · 1:44.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Ripristina calcolo automatico" }));
    expect(state.clearCalls).toBe(1);
    act(() => state.clearOptions.onSuccess({ success: true }));
    expect(toast.success).toHaveBeenCalledWith("Zone automatiche ripristinate.");
  });

  it("senza passo soglia: campi vuoti e cosa fare", async () => {
    const dialog = await openEditor(emptySwimMetricsFixture());
    expect(LABELS.map((label) => field(dialog, label).value)).toEqual(["", "", "", "", ""]);
    expect(dialog).toHaveTextContent(
      "Senza passo soglia non c'è un calcolo automatico: scrivi i tuoi confini o inserisci un test del passo soglia."
    );
    expect(dialog).toHaveTextContent("Completa i cinque confini per vedere le zone.");
  });
});
