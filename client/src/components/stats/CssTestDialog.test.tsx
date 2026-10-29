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

  // The server's zod errors (statistics.setCssTest): error.message is the raw zod text, the
  // Italian messages are in error.data.zodError.fieldErrors.
  const zodError = (fieldErrors: Record<string, string[]>, formErrors: string[] = []) => ({
    message: JSON.stringify([{ code: "custom", path: Object.keys(fieldErrors), message: "…" }]),
    data: { code: "BAD_REQUEST", httpStatus: 400, path: "statistics.setCssTest", zodError: { formErrors, fieldErrors } },
  });

  async function submitTimes(t400: string, t200: string) {
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText("Tempo sui 400 m"), t400);
    await userEvent.type(within(dialog).getByLabelText("Tempo sui 200 m"), t200);
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva il test" }));
    return dialog;
  }

  it("errore del server sul rapporto 400/200: sotto il tempo sui 400, che prende il focus", async () => {
    const dialog = await submitTimes("5:00", "3:00");
    const ratio =
      "Il 400 è troppo veloce rispetto al 200: deve durare almeno 2,02 volte il tempo sui 200 m. Controlla i tempi.";
    act(() => state.saveOptions.onError(zodError({ t400Seconds: [ratio] })));
    const t400 = within(dialog).getByLabelText("Tempo sui 400 m");
    expect(t400).toHaveAttribute("aria-invalid", "true");
    expect(t400).toHaveAccessibleDescription(ratio);
    expect(t400).toHaveFocus();
    // The 200 is fine, nothing else is shown, never the raw zod message.
    expect(within(dialog).getByLabelText("Tempo sui 200 m")).not.toHaveAttribute("aria-invalid");
    expect(within(dialog).getByLabelText("Tempo sui 200 m")).toHaveAccessibleDescription("Minuti:secondi");
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(dialog).not.toHaveTextContent("custom");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("errori del server su più campi: ognuno sotto il suo", async () => {
    const dialog = await submitTimes("6:20", "1:30");
    act(() =>
      state.saveOptions.onError(
        zodError({
          t200Seconds: ["Il tempo sui 200 m deve essere tra 1:40 e 7:00."],
          date: ["La data del test non può essere nel futuro."],
        })
      )
    );
    const t200 = within(dialog).getByLabelText("Tempo sui 200 m");
    expect(t200).toHaveAccessibleDescription("Il tempo sui 200 m deve essere tra 1:40 e 7:00.");
    expect(t200).toHaveFocus();
    const date = within(dialog).getByLabelText("Data del test");
    expect(date).toHaveAttribute("aria-invalid", "true");
    expect(date).toHaveAccessibleDescription("La data del test non può essere nel futuro.");
    expect(within(dialog).getByLabelText("Tempo sui 400 m")).not.toHaveAttribute("aria-invalid");
  });

  it("un nuovo invio toglie gli errori del server", async () => {
    const dialog = await submitTimes("5:00", "3:00");
    act(() => state.saveOptions.onError(zodError({ t400Seconds: ["Il tempo sui 400 m deve essere tra 3:00 e 15:00."] })));
    expect(within(dialog).getByLabelText("Tempo sui 400 m")).toHaveAttribute("aria-invalid", "true");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva il test" }));
    expect(within(dialog).getByLabelText("Tempo sui 400 m")).not.toHaveAttribute("aria-invalid");
    expect(state.saveCalls).toHaveLength(2);
  });

  it("altri errori: il messaggio del server in italiano, altrimenti il nostro", async () => {
    const dialog = await submitTimes("6:20", "3:00");
    // A server error with its own message (no profile).
    act(() =>
      state.saveOptions.onError({ message: "Profilo non trovato", data: { code: "NOT_FOUND", zodError: null } })
    );
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Profilo non trovato");
    expect(within(dialog).getByLabelText("Tempo sui 400 m")).not.toHaveAttribute("aria-invalid");

    // A role check answers with the bare code: never shown.
    act(() => state.saveOptions.onError({ message: "UNAUTHORIZED", data: { code: "UNAUTHORIZED", zodError: null } }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Non riesco a salvare il test. Riprova.");

    // Validation without a message on our fields: our message, never the raw zod text.
    act(() => state.saveOptions.onError(zodError({})));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Non riesco a salvare il test. Riprova.");

    // Any other failure (network, server down): a plain Italian message, never the raw one.
    act(() => state.saveOptions.onError({ message: "Failed to fetch", data: undefined }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Non riesco a salvare il test. Riprova.");
    expect(screen.getByRole("dialog")).toBeTruthy();
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

  it("rimozione non riuscita: messaggio in italiano, il dialogo resta aperto", async () => {
    const dialog = await openDialog(testResult);
    await userEvent.click(within(dialog).getByRole("button", { name: "Rimuovi test" }));
    act(() => state.clearOptions.onError({ message: "Failed to fetch", data: undefined }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Non riesco a rimuovere il test. Riprova.");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
