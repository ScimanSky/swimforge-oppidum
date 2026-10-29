import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { CssResult } from "@shared/swimMetrics";
import { CssTestDialog } from "./CssTestDialog";

const state = vi.hoisted(() => ({
  saveCalls: [] as any[],
  clearCalls: 0,
  saveOptions: undefined as any,
  clearOptions: undefined as any,
  savePending: false,
  invalidate: undefined as any,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    statistics: {
      setCssTest: {
        useMutation: (options: any) => {
          state.saveOptions = options;
          return { mutate: (vars: any) => state.saveCalls.push(vars), isPending: state.savePending };
        },
      },
      clearCssTest: {
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

const testResult: CssResult = {
  paceSecondsPer100: 100,
  speedMps: 1,
  source: "test",
  confidence: null,
  points: [
    { distanceMeters: 200, seconds: 180, date: "2026-10-12" },
    { distanceMeters: 400, seconds: 380, date: "2026-10-12" },
  ],
  testDate: "2026-10-12",
};

async function openDialog(current: CssResult | null = null) {
  render(<CssTestDialog current={current} />);
  await userEvent.click(screen.getByRole("button", { name: "Inserisci un test" }));
  return screen.getByRole("dialog", { name: "Test del passo soglia" });
}

describe("Test del passo soglia", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.saveCalls.length = 0;
    state.clearCalls = 0;
    state.savePending = false;
    state.invalidate = vi.fn();
    vi.mocked(toast.success).mockClear();
  });

  it("spiega come fare il test; la data è oggi", async () => {
    const dialog = await openDialog();
    expect(dialog).toHaveTextContent(
      "Dopo il riscaldamento: 400 m a tutta, recupero completo (5-10 minuti facili), 200 m a tutta."
    );
    expect(within(dialog).getByLabelText("Tempo sui 400 m")).toHaveValue("");
    expect(within(dialog).getByLabelText("Tempo sui 200 m")).toHaveValue("");
    expect((within(dialog).getByLabelText("Data del test") as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // No test saved: nothing to remove.
    expect(within(dialog).queryByRole("button", { name: "Rimuovi test" })).toBeNull();
  });

  it("tempi non in m:ss: errore sotto il campo, niente invio", async () => {
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText("Tempo sui 400 m"), "6:2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva il test" }));
    const t400 = within(dialog).getByLabelText("Tempo sui 400 m");
    expect(t400).toHaveAttribute("aria-invalid", "true");
    expect(t400).toHaveAccessibleDescription(/Scrivi il tempo come minuti:secondi, per esempio 6:20\./);
    expect(within(dialog).getByLabelText("Tempo sui 200 m")).toHaveAccessibleDescription(
      /Inserisci il tempo sui 200 m\./
    );
    expect(state.saveCalls).toHaveLength(0);
  });

  it("invia i secondi e la data; accetta anche il punto al posto dei due punti", async () => {
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText("Tempo sui 400 m"), "6.20");
    await userEvent.type(within(dialog).getByLabelText("Tempo sui 200 m"), "3:00");
    fireEvent.change(within(dialog).getByLabelText("Data del test"), { target: { value: "2026-10-12" } });
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva il test" }));
    expect(state.saveCalls).toEqual([{ t400Seconds: 380, t200Seconds: 180, date: "2026-10-12" }]);

    act(() => state.saveOptions.onSuccess({ success: true }));
    expect(state.invalidate).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Test salvato: il passo soglia è aggiornato.");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("l'errore del server compare sotto i campi", async () => {
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText("Tempo sui 400 m"), "9:00");
    await userEvent.type(within(dialog).getByLabelText("Tempo sui 200 m"), "3:00");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva il test" }));
    act(() =>
      state.saveOptions.onError({
        message: "Il tempo sui 400 m deve essere tra 1,9 e 2,4 volte quello sui 200 m: controlla i tempi.",
        data: { code: "BAD_REQUEST" },
      })
    );
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Il tempo sui 400 m deve essere tra 1,9 e 2,4 volte quello sui 200 m: controlla i tempi."
    );
    expect(screen.getByRole("dialog")).toBeTruthy();

    // Any other failure (network, server down): a plain Italian message, never the raw one.
    act(() => state.saveOptions.onError({ message: "Failed to fetch", data: undefined }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Non riesco a salvare il test. Riprova.");
  });

  it("mentre salva il pulsante è disattivato", async () => {
    state.savePending = true;
    const dialog = await openDialog();
    expect(within(dialog).getByRole("button", { name: "Salvataggio…" })).toBeDisabled();
  });

  it("con un test salvato: campi già compilati e «Rimuovi test»", async () => {
    const dialog = await openDialog(testResult);
    expect(within(dialog).getByLabelText("Tempo sui 400 m")).toHaveValue("6:20");
    expect(within(dialog).getByLabelText("Tempo sui 200 m")).toHaveValue("3:00");
    expect(within(dialog).getByLabelText("Data del test")).toHaveValue("2026-10-12");
    await userEvent.click(within(dialog).getByRole("button", { name: "Rimuovi test" }));
    expect(state.clearCalls).toBe(1);
    act(() => state.clearOptions.onSuccess({ success: true }));
    expect(state.invalidate).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Test rimosso.");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
