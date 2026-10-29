import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import Coach from "./Coach";
import { emptySwimMetricsFixture, swimMetricsFixture } from "@/components/stats/metrics-fixture";
import { paceZoneRanges } from "@shared/swimMetrics";

const state = vi.hoisted(() => ({
  metrics: undefined as any,
  metricsError: false,
  coachInsights: undefined as any,
  insightsOptions: undefined as any,
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
      getMetrics: { useQuery: () => ({ data: state.metrics, isError: state.metricsError }) },
      getInsights: {
        useQuery: (_input: unknown, options: unknown) => {
          state.insightsOptions = options;
          return { data: state.coachInsights };
        },
      },
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
    state.metricsError = false;
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
    // The fixture's balance, −7,3, is in the neutral band (−10 to +5).
    expect(summary).toHaveTextContent("EquilibrioNeutro");
    expect(within(summary).getByText("Ultima analisi")).toBeTruthy();
    expect(within(summary).queryByText("Focus di oggi")).toBeNull();

    const metrics = screen.getByRole("region", { name: "Metriche" });
    expect(metrics).toHaveTextContent("1:49 /100 m Passo soglia");
    expect(metrics).toHaveTextContent("64% in zona A Intensità");
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

  it("chiede i consigli AI fuori dal batch, così le metriche non aspettano Gemini", () => {
    render(<Coach />);
    expect(state.insightsOptions).toMatchObject({ trpc: { context: { skipBatch: true } } });
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

  // A generated workout as the server stores it: zones checked, levels and paces added, a split rep.
  const zonedWorkout = () => ({
    type: "pool",
    title: "Soglia e velocità",
    description: "Lavoro sulla soglia",
    duration: "60 minuti",
    difficulty: "Intermedio",
    totalMeters: 2400,
    zoneSource: "auto",
    sections: [
      {
        title: "Centrale",
        exercises: [
          {
            name: "6×100 a soglia", repeats: 6, repMeters: 100, rest: "a 2:10", zone: "B2", level: "Soglia",
            targetPace: { fastPace: 108.5, slowPace: 114.2 },
          },
          {
            name: "8×150 C1 a ritmo gara", repeats: 8, repMeters: 150, rest: "30 sec", zone: "C1", level: "Soglia",
            targetPace: { fastPace: 104.3, slowPace: 108.5 },
            zoneNote: "Spezzato in 8×150 m: in C1 la ripetuta più lunga è 200 m.",
          },
          { name: "4×50 dorso", repeats: 4, repMeters: 50, zone: "B1", level: "Medio", targetPace: null },
        ],
      },
    ],
    coachNotes: [],
  });

  it("allenamento con le zone: chip, passo obiettivo e spiegazione in ogni ripetuta; il totale", async () => {
    state.workouts = { pool: zonedWorkout(), dryland: undefined, canGenerate: true };
    window.history.replaceState(null, "", "/coach?tab=workouts");
    render(<Coach />);
    expect(screen.getByText("60 minuti · Intermedio · 2,4 km")).toBeTruthy();
    const rep = screen.getByText("6×100 a soglia").closest("li")!;
    expect(within(rep).getByRole("button", { name: "B2 · Soglia" })).toBeTruthy();
    expect(rep).toHaveTextContent("1:49–1:54 /100 m");
    expect(rep).toHaveTextContent("Respiro impegnato, poche parole tra una vasca e l'altra; alza la soglia.");
    const split = screen.getByText("8×150 C1 a ritmo gara").closest("li")!;
    expect(split).toHaveTextContent("Spezzato in 8×150 m: in C1 la ripetuta più lunga è 200 m.");
    // Another stroke: zone and level as effort, no freestyle pace.
    const back = screen.getByText("4×50 dorso").closest("li")!;
    expect(within(back).getByRole("button", { name: "B1 · Medio" })).toBeTruthy();
    expect(back).not.toHaveTextContent("/100 m");
  });

  it("ripartenza e recupero hanno il loro nome; il livello non si ripete come intensità", () => {
    state.workouts = { pool: zonedWorkout(), dryland: undefined, canGenerate: true };
    window.history.replaceState(null, "", "/coach?tab=workouts");
    render(<Coach />);
    expect(screen.getByText("6×100 a soglia").closest("li")).toHaveTextContent("Ripartenza: a 2:10");
    const split = screen.getByText("8×150 C1 a ritmo gara").closest("li")!;
    expect(split).toHaveTextContent("Recupero: 30 sec");
    expect(split).not.toHaveTextContent("Intensità");
  });

  it("i passi vengono dalle tue zone di oggi; quello salvato resta come storia se è cambiato", () => {
    const metrics = swimMetricsFixture();
    // Manual zones saved after the workout: B2 1:50–1:56 instead of 1:49–1:54.
    const bounds = { a1a2: 130, a2b1: 122, b1b2: 116, b2c1: 110, c1c2: 105 };
    metrics.zones = { ...metrics.zones, source: "manuali", bounds, ranges: paceZoneRanges(bounds) };
    state.metrics = metrics;
    const pool = zonedWorkout();
    // Generated without zones: no pace stored, today's zones give one.
    pool.sections[0].exercises.push({ name: "4×100 progressivi", repeats: 4, repMeters: 100, zone: "B1", level: "Medio", targetPace: null } as any);
    state.workouts = { pool, dryland: undefined, canGenerate: true };
    window.history.replaceState(null, "", "/coach?tab=workouts");
    render(<Coach />);
    const rep = screen.getByText("6×100 a soglia").closest("li")!;
    expect(rep).toHaveTextContent("1:50–1:56 /100 m");
    expect(rep).toHaveTextContent("Passo dalle tue zone di oggi; quando l'allenamento è stato generato era 1:49–1:54 /100 m.");
    expect(screen.getByText("4×100 progressivi").closest("li")).toHaveTextContent("1:56–2:02 /100 m");
    // Another stroke never gets a pace.
    expect(screen.getByText("4×50 dorso").closest("li")).not.toHaveTextContent("/100 m");
  });

  it("finché le metriche non arrivano resta il passo salvato, senza storia", () => {
    state.metrics = undefined;
    state.workouts = { pool: zonedWorkout(), dryland: undefined, canGenerate: true };
    window.history.replaceState(null, "", "/coach?tab=workouts");
    render(<Coach />);
    const rep = screen.getByText("6×100 a soglia").closest("li")!;
    expect(rep).toHaveTextContent("1:49–1:54 /100 m");
    expect(rep).not.toHaveTextContent("quando l'allenamento è stato generato");
  });

  it("mostra tutti gli esercizi della parte, ognuno con il suo chip; una parte senza esercizi non rompe la pagina", () => {
    const pool = zonedWorkout();
    pool.sections[0].exercises.push(
      { name: "4×50 C2 forte", repeats: 4, repMeters: 50, rest: "1′", zone: "C2", level: "Sopra soglia" } as any,
      { name: "200 sciolto", repeats: 1, repMeters: 200, zone: "A1", level: "Facile" } as any,
    );
    pool.sections.push({ title: "Note finali" } as any);
    state.workouts = { pool, dryland: undefined, canGenerate: true };
    window.history.replaceState(null, "", "/coach?tab=workouts");
    render(<Coach />);
    for (const name of ["6×100 a soglia", "8×150 C1 a ritmo gara", "4×50 dorso", "4×50 C2 forte", "200 sciolto"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "C2 · Sopra soglia" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "A1 · Facile" })).toBeTruthy();
    expect(screen.queryByText(/esercizi aggiuntivi/)).toBeNull();
  });

  it("«Le zone A1–C3» mentre le metriche caricano o se falliscono non dice «serve il passo soglia»", async () => {
    state.metrics = undefined;
    state.workouts = { pool: zonedWorkout(), dryland: undefined, canGenerate: true };
    window.history.replaceState(null, "", "/coach?tab=workouts");
    render(<Coach />);
    await userEvent.click(screen.getByRole("button", { name: "C1 · Soglia" }));
    let glossary = screen.getByRole("dialog", { name: "Le zone A1–C3" });
    expect(within(glossary).getByRole("status")).toHaveTextContent("Caricamento dei tuoi passi…");
    expect(glossary).not.toHaveTextContent("serve il passo soglia");
    cleanup();

    state.metricsError = true;
    render(<Coach />);
    await userEvent.click(screen.getByRole("button", { name: "C1 · Soglia" }));
    glossary = screen.getByRole("dialog", { name: "Le zone A1–C3" });
    expect(within(glossary).getByRole("alert")).toHaveTextContent("Non riesco a caricare i tuoi passi: riprova più tardi.");
    expect(glossary).not.toHaveTextContent("serve il passo soglia");
  });

  it("il numero del consiglio: solo una percentuale o una variazione con segno", async () => {
    state.coachInsights = [
      "💪 Intensità: in B1–B2 il 40% del volume",
      "🏊 Tecnica: il tuo passo 1:49 tiene fino in fondo",
      "🎯 Obiettivi: una nuotata con un tratto continuo lungo (800 m o più) renderebbe la stima più solida",
    ];
    render(<Coach />);
    const header = () => screen.getByRole("heading", { level: 2, name: /^Consiglio/ }).parentElement!;
    expect(header()).toHaveTextContent(/^Consiglio 1\s*40 %$/);
    await userEvent.click(screen.getByRole("button", { name: "Consiglio 2" }));
    expect(header().textContent).toBe("Consiglio 2");
    await userEvent.click(screen.getByRole("button", { name: "Consiglio 3" }));
    expect(header().textContent).toBe("Consiglio 3");
  });

  it("toccando il chip si apre «Le zone A1–C3» su quella zona", async () => {
    state.workouts = { pool: zonedWorkout(), dryland: undefined, canGenerate: true };
    window.history.replaceState(null, "", "/coach?tab=workouts");
    render(<Coach />);
    await userEvent.click(screen.getByRole("button", { name: "C1 · Soglia" }));
    const glossary = screen.getByRole("dialog", { name: "Le zone A1–C3" });
    expect(within(glossary).getByRole("heading", { level: 3, name: "C1 Soglia anaerobica · Soglia" })).toHaveFocus();
    // The user's paces today, from the metrics.
    expect(within(glossary).getByRole("region", { name: "C1 Soglia anaerobica · Soglia" })).toHaveTextContent(
      "Il tuo passo1:44–1:49 /100 m"
    );
  });

  it("un allenamento salvato prima delle zone si vede come prima, senza chip", () => {
    window.history.replaceState(null, "", "/coach?tab=workouts");
    render(<Coach />);
    expect(screen.getByText("400 m sciolti")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /·/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Le zone A1–C3" })).toBeNull();
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
