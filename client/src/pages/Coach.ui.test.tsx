import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import Coach from "./Coach";
import { emptySwimMetricsFixture, swimMetricsFixture } from "@/components/stats/metrics-fixture";

const state = vi.hoisted(() => ({
  metrics: undefined as any,
  coachInsights: undefined as any,
  workouts: undefined as any,
  insights: [] as any[],
  generateCalls: 0,
  chatCalls: [] as any[],
  chatResponse: { message: "Risposta del coach", provider: "gemini", fallback: false } as any,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ data: { id: 7 } }) } },
    statistics: {
      getMetrics: { useQuery: () => ({ data: state.metrics }) },
      getInsights: { useQuery: () => ({ data: state.coachInsights }) },
    },
    aiCoach: {
      getWorkouts: { useQuery: () => ({ data: state.workouts }) },
      generateWorkouts: {
        useMutation: () => ({
          mutateAsync: async () => {
            state.generateCalls += 1;
            return state.workouts;
          },
        }),
      },
      chat: {
        useMutation: () => ({
          mutateAsync: async (input: any) => {
            state.chatCalls.push(input);
            return state.chatResponse;
          },
          isPending: false,
        }),
      },
    },
    activityInsights: { list: { useQuery: () => ({ data: state.insights }) } },
    useUtils: () => ({
      aiCoach: { getWorkouts: { setData: vi.fn(), refetch: vi.fn(async () => undefined) } },
    }),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

vi.mock("@/components/AppLayout", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("streamdown", () => ({ Streamdown: ({ children }: any) => <p>{children}</p> }));

const workout = (title: string) => ({
  type: "pool",
  title,
  description: "Lavoro aerobico",
  duration: "45 min",
  difficulty: "Media",
  sections: [
    { title: "Riscaldamento", exercises: [{ name: "400 m sciolti", distance: "400 m" }] },
    { title: "Centrale", exercises: [{ name: "8x100 m", rest: "20 s" }] },
  ],
  coachNotes: [],
});

// jsdom has no layout APIs: the chat scrolls to the newest message, Radix Select scrolls options.
Element.prototype.scrollTo ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

describe("Coach AI", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
  });
  beforeEach(() => {
    localStorage.clear();
    state.generateCalls = 0;
    state.chatCalls = [];
    state.chatResponse = { message: "Risposta del coach", provider: "gemini", fallback: false };
    vi.mocked(toast.warning).mockClear();
    vi.mocked(toast.info).mockClear();
    state.metrics = swimMetricsFixture();
    state.coachInsights = ["Il passo è migliorato del **4.5%**", "Aggiungi una nuotata"];
    state.workouts = { pool: workout("Aerobico in vasca"), dryland: undefined, canGenerate: true };
    state.insights = [
      {
        id: 1,
        title: "Buona costanza",
        summary: "Passo regolare",
        bullets: JSON.stringify(["Vasche regolari"]),
        activity_date: "2026-10-20T08:00:00Z",
        activity_distance_meters: 1500,
        activity_duration_seconds: 3000,
      },
    ];
  });

  it("non ripete il titolo e mostra riepilogo, metriche e consigli", async () => {
    render(<Coach />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    const summary = screen.getByRole("region", { name: "Riepilogo del coach" });
    expect(summary).toHaveTextContent("EquilibrioIn costruzione");
    expect(within(summary).getByText("Ultima analisi")).toBeTruthy();
    expect(within(summary).queryByText("Focus di oggi")).toBeNull();

    const metrics = screen.getByRole("region", { name: "Metriche" });
    expect(metrics).toHaveTextContent("1:48 /100 m Passo soglia");
    expect(metrics).toHaveTextContent("64% facile Intensità");
    expect(metrics).toHaveTextContent("7,7 km/sett. Volume");
    expect(metrics).toHaveTextContent("9 sett. Serie");
    // The invented scores are gone.
    for (const old of ["Prestazione", "Costanza", "Recupero", "SEI", "TCI", "SER", "ACS", "POI"]) {
      expect(screen.queryByText(old)).toBeNull();
    }

    expect(screen.getByRole("heading", { level: 2, name: "Consiglio 1" })).toBeTruthy();
    expect(screen.getByText("4,5 %")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Consiglio 2" }));
    expect(screen.getByText("Aggiungi una nuotata")).toBeTruthy();
  });

  it("senza dati per una metrica non la mostra; senza consigli lo dice", () => {
    state.metrics = emptySwimMetricsFixture();
    state.coachInsights = [];
    render(<Coach />);
    expect(screen.queryByText("Equilibrio")).toBeNull();
    const metrics = screen.getByRole("region", { name: "Metriche" });
    expect(within(metrics).queryByText("Passo soglia")).toBeNull();
    expect(within(metrics).queryByText("Intensità")).toBeNull();
    expect(metrics).toHaveTextContent("1 sett. Serie");
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.getByText(/Nessun consiglio disponibile/)).toBeTruthy();
  });

  it("apre la scheda dal parametro tab e genera gli allenamenti", async () => {
    window.history.replaceState(null, "", "/coach?tab=workouts");
    render(<Coach />);
    expect(screen.getByRole("tab", { name: "Piano" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { level: 3, name: "Aerobico in vasca" })).toBeTruthy();
    expect(screen.getByText("400 m sciolti")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Centrale" }));
    expect(screen.getByText("8x100 m")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "A secco" }));
    expect(screen.getByText(/Allenamento a secco non disponibile/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Genera allenamenti" }));
    expect(state.generateCalls).toBe(1);
  });

  it("mostra l'ultima analisi e la chat in italiano", async () => {
    window.history.replaceState(null, "", "/coach?tab=session-iq");
    render(<Coach />);
    expect(screen.getByRole("heading", { level: 3, name: "Buona costanza" })).toBeTruthy();
    expect(screen.getByText(/1,5 km · 50 min/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Apri archivio" }));
    expect(screen.getByText("1 di 1 analisi")).toBeTruthy();

    await userEvent.click(screen.getByRole("tab", { name: "Chat" }));
    expect(screen.getByRole("heading", { level: 2, name: "Chat con il coach" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Messaggio" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Invia" })).toBeTruthy();
  });

  it("arrivando da Oggi su ?tab=session-iq apre «Analisi» con l'analisi più recente", () => {
    state.insights = [
      {
        id: 2,
        title: "Virate lente",
        summary: "Lavora sulle virate",
        bullets: "[]",
        activity_date: "2026-10-10T08:00:00Z",
      },
      ...state.insights,
    ];
    window.history.replaceState(null, "", "/coach?tab=session-iq");
    render(<Coach />);
    expect(screen.getByRole("tab", { name: "Analisi" }).getAttribute("aria-selected")).toBe("true");
    const panel = screen.getByRole("tabpanel");
    // The older analysis comes first in the data; the newest (20 Oct) is the one shown.
    expect(within(panel).getByRole("heading", { level: 3, name: "Buona costanza" })).toBeTruthy();
    expect(within(panel).queryByText("Virate lente")).toBeNull();
  });

  it("segue il parametro tab quando cambia solo la query", async () => {
    window.history.replaceState(null, "", "/coach?tab=chat");
    render(<Coach />);
    expect(screen.getByRole("tab", { name: "Chat" }).getAttribute("aria-selected")).toBe("true");
    act(() => {
      window.history.pushState(null, "", "/coach?tab=session-iq");
    });
    expect(screen.getByRole("tab", { name: "Analisi" }).getAttribute("aria-selected")).toBe("true");
  });

  it("invia in chat: modalità base segnalata una volta, cronologia per utente, svuota", async () => {
    const user = userEvent.setup({ delay: null });
    state.chatResponse = { message: "Risposta semplice", provider: "rule_based", fallback: true };
    window.history.replaceState(null, "", "/coach?tab=chat");
    render(<Coach />);

    const box = screen.getByRole("textbox", { name: "Messaggio" });
    await user.type(box, "Come va il passo?");
    await user.click(screen.getByRole("button", { name: "Invia" }));
    expect(await screen.findByText("Risposta semplice")).toBeTruthy();
    expect(state.chatCalls[0].messages).toEqual([{ role: "user", content: "Come va il passo?" }]);
    expect(screen.getByText(/Modalità base/)).toBeTruthy();
    expect(toast.warning).toHaveBeenCalledTimes(1);

    await user.type(box, "E la virata?");
    await user.click(screen.getByRole("button", { name: "Invia" }));
    expect(await screen.findAllByText("Risposta semplice")).toHaveLength(2);
    expect(toast.warning).toHaveBeenCalledTimes(1);

    const stored = JSON.parse(localStorage.getItem("coach_chat_history_v1:u:7") ?? "[]");
    expect(stored).toHaveLength(4);
    expect(stored[0]).toEqual({ role: "user", content: "Come va il passo?" });

    await user.click(screen.getByRole("button", { name: "Svuota chat" }));
    expect(screen.queryByText("Risposta semplice")).toBeNull();
    expect(localStorage.getItem("coach_chat_history_v1:u:7")).toBe("[]");
  });

  it("taglia un messaggio oltre i 2000 caratteri e lo dice", async () => {
    window.history.replaceState(null, "", "/coach?tab=chat");
    render(<Coach />);
    const box = screen.getByRole("textbox", { name: "Messaggio" });
    // fireEvent bypasses the textarea maxLength, like a paste in some browsers.
    fireEvent.change(box, { target: { value: "a".repeat(2100) } });
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Invia" }));
    expect(toast.info).toHaveBeenCalledWith("Messaggio troppo lungo: inviati i primi 2000 caratteri.");
    expect(state.chatCalls[0].messages[0].content).toHaveLength(2000);
  });

  it("archivio: cerca e ordina dal meno recente", async () => {
    const user = userEvent.setup({ delay: null });
    state.insights = [
      {
        id: 1,
        title: "Buona costanza",
        summary: "Passo regolare",
        bullets: JSON.stringify(["Vasche regolari"]),
        activity_date: "2026-10-20T08:00:00Z",
        activity_distance_meters: 1500,
        activity_duration_seconds: 3000,
      },
      {
        id: 2,
        title: "Virate lente",
        summary: "Lavora sulle virate",
        bullets: "[]",
        activity_date: "2026-10-10T08:00:00Z",
        activity_distance_meters: 2000,
        activity_duration_seconds: 3600,
      },
    ];
    window.history.replaceState(null, "", "/coach?tab=session-iq");
    render(<Coach />);
    await user.click(screen.getByRole("button", { name: "Apri archivio" }));
    const archive = screen.getByRole("heading", { level: 3, name: "Archivio analisi" }).parentElement!.parentElement!;
    const titles = () =>
      within(archive)
        .getAllByRole("listitem")
        .map((item) => item.querySelector("p.font-semibold")?.textContent)
        .filter(Boolean);
    expect(titles()).toEqual(["Buona costanza", "Virate lente"]);

    await user.click(screen.getByRole("combobox", { name: "Ordina" }));
    await user.click(await screen.findByRole("option", { name: "Meno recenti" }));
    expect(titles()).toEqual(["Virate lente", "Buona costanza"]);

    await user.type(screen.getByRole("textbox", { name: "Cerca nelle analisi" }), "virate");
    expect(titles()).toEqual(["Virate lente"]);
    expect(within(archive).getByText("1 di 2 analisi")).toBeTruthy();
  });
});
