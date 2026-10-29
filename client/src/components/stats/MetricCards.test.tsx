import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SwimMetrics } from "@shared/swimMetrics";
import { MetricCards } from "./MetricCards";
import { emptySwimMetricsFixture, swimMetricsFixture } from "./metrics-fixture";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    statistics: {
      setCssTest: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      clearCssTest: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    useUtils: () => ({ statistics: { getMetrics: { invalidate: vi.fn() } } }),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// recharts measures its container: jsdom has no layout.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return { ...actual, ResponsiveContainer: ({ children }: any) => <div>{children}</div> };
});

const NAMES = [
  "Passo soglia",
  "Forma e fatica",
  "Intensità",
  "Efficienza della bracciata",
  "Regolarità e tenuta nelle ripetute",
  "Volume e costanza",
];

const card = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

function renderCards(metrics: SwimMetrics = swimMetricsFixture()) {
  render(<MetricCards metrics={metrics} />);
}

describe("Metriche: riquadri", () => {
  afterEach(cleanup);

  it("sei riquadri chiusi all'avvio, titoli h3, nessun grafico montato", () => {
    renderCards();
    for (const name of NAMES) {
      expect(card(name).getAttribute("aria-expanded")).toBe("false");
      expect(screen.getByRole("heading", { level: 3, name: new RegExp(`^${name}`) })).toBeTruthy();
    }
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("l'intestazione mostra nome, valore principale e lettura breve", () => {
    renderCards();
    // CSS 108,5 s/100 m (200 in 3:20, 400 in 6:57) is shown to the second.
    expect(card("Passo soglia")).toHaveTextContent("Passo soglia 1:49 /100 m stima, affidabilità media");
    // −7,3 is in the neutral band (−10 to +5) of TrainingPeaks.
    expect(card("Forma e fatica")).toHaveTextContent("Forma e fatica −7 neutro");
    expect(card("Intensità")).toHaveTextContent("Intensità 64% facile 16% medio, 20% intenso");
    expect(card("Efficienza della bracciata")).toHaveTextContent("1,52 +7% sulla tua base");
    expect(card("Regolarità e tenuta nelle ripetute")).toHaveTextContent(
      "Regolarità e tenuta nelle ripetute 2,6% variabilità regolare"
    );
    expect(card("Volume e costanza")).toHaveTextContent("7,7 km/sett. serie: 9 settimane");
  });

  it("aprendo un riquadro compaiono il grafico con la sua sintesi, come si legge e la base dei dati", async () => {
    renderCards();
    await userEvent.click(card("Intensità"));
    expect(card("Intensità").getAttribute("aria-expanded")).toBe("true");
    const region = screen.getByRole("region", { name: /^Intensità/ });
    expect(
      within(region).getByRole("img", {
        name: "Ultime 8 settimane: 13,6 km a stile libero nelle zone, 8,6 in Z1–Z2 (facile), 2,4 in Z3 (medio), 2,6 in Z4–Z5 (intenso); 1,8 km di altri stili, tecnica o gambe non classificati.",
      })
    ).toBeTruthy();
    expect(region).toHaveTextContent("Come si legge: Gli studi sugli sport di resistenza");
    expect(region).toHaveTextContent(
      "Su 3 nuotate in vasca con i giri degli ultimi 28 giorni: 8,4 km a stile libero nelle zone."
    );
    // Legend of the zones and the split of the last 4 weeks.
    for (const zone of ["Facile", "Aerobico", "Medio", "Soglia", "Sopra soglia"]) {
      expect(within(region).getAllByText(new RegExp(zone)).length).toBeGreaterThan(0);
    }
    // The other cards stay closed and without charts.
    expect(card("Passo soglia").getAttribute("aria-expanded")).toBe("false");
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("intensità: quanta parte del volume è nelle zone, cosa resta fuori e i passi delle zone", async () => {
    renderCards();
    await userEvent.click(card("Intensità"));
    const region = screen.getByRole("region", { name: /^Intensità/ });
    expect(region).toHaveTextContent(
      "Zone calcolate sul 72% del volume delle ultime 4 settimane. Fuori dalle zone: 1,2 km di altri stili, tecnica o gambe; 2 km in acque libere."
    );
    // The zones as paces you can swim, from the threshold pace 1:48,5.
    const table = within(region).getByRole("table", { name: "Passo delle zone, dal passo soglia 1:49" });
    expect(
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent)
    ).toEqual([
      "Z1 Facilepiù lento di 2:08 /100 m",
      "Z2 Aerobico1:58–2:08 /100 m",
      "Z3 Medio1:52–1:58 /100 m",
      "Z4 Soglia1:45–1:52 /100 m",
      "Z5 Sopra sogliapiù veloce di 1:45 /100 m",
    ]);
    // The weekly bars keep the unzoned metres apart, in a neutral grey with its own legend.
    expect(within(region).getByText("Non classificati (altri stili, tecnica, gambe)")).toBeTruthy();
  });

  it("intensità: tutto a stile libero, zone su tutto il volume e niente segmento grigio", async () => {
    const metrics = swimMetricsFixture();
    metrics.sessions = metrics.sessions.filter((session) => !session.isOpenWater);
    metrics.intensity.last28 = { ...metrics.intensity.last28!, unclassifiedMeters: 0, coveragePct: 100 };
    metrics.intensity.weeks = metrics.intensity.weeks.map((week) => ({ ...week, unclassifiedMeters: 0 }));
    renderCards(metrics);
    await userEvent.click(card("Intensità"));
    const region = screen.getByRole("region", { name: /^Intensità/ });
    expect(region).toHaveTextContent("Zone calcolate su tutto il volume delle ultime 4 settimane.");
    expect(region).not.toHaveTextContent("Fuori dalle zone");
    expect(region).not.toHaveTextContent("Non classificati");
    expect(
      within(region).getByRole("img", {
        name: "Ultime 8 settimane: 13,6 km a stile libero nelle zone, 8,6 in Z1–Z2 (facile), 2,4 in Z3 (medio), 2,6 in Z4–Z5 (intenso).",
      })
    ).toBeTruthy();
  });

  it("intensità: le nuotate in vasca senza giri sono dette a parte", async () => {
    const metrics = swimMetricsFixture();
    metrics.sessions = metrics.sessions.map((session) =>
      session.isOpenWater ? { ...session, isOpenWater: false, poolLengthMeters: 25 } : session
    );
    renderCards(metrics);
    await userEvent.click(card("Intensità"));
    expect(screen.getByRole("region", { name: /^Intensità/ })).toHaveTextContent(
      "Fuori dalle zone: 1,2 km di altri stili, tecnica o gambe; 2 km di nuotate senza giri."
    );
  });

  it("si possono aprire più riquadri insieme", async () => {
    renderCards();
    await userEvent.click(card("Passo soglia"));
    await userEvent.click(card("Volume e costanza"));
    expect(card("Passo soglia").getAttribute("aria-expanded")).toBe("true");
    expect(card("Volume e costanza").getAttribute("aria-expanded")).toBe("true");
  });

  it("passo soglia: storia mensile, tratti usati e scartati, retta, fonte", async () => {
    renderCards();
    await userEvent.click(card("Passo soglia"));
    const region = screen.getByRole("region", { name: /^Passo soglia/ });
    expect(
      within(region).getByRole("img", {
        name: "Passo soglia a fine mese, per 100 m: maggio nessuna stima, giugno nessuna stima, luglio 1:52, agosto 1:51, settembre 1:49, ottobre 1:49.",
      })
    ).toBeTruthy();
    const points = within(region).getByRole("list", { name: "Tratti usati per la stima" });
    expect(within(points).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "200 m in 3:20 · 6 ott",
      "400 m in 6:57 · 20 ott",
    ]);
    // The 300 was slower per 100 m than the 400: not at full effort, left out and said so.
    const dropped = within(region).getByRole("list", {
      name: "Non usati: più lenti per 100 m di un tratto più lungo, quindi non a tutta",
    });
    expect(within(dropped).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "300 m in 5:56 · 29 set, a 1:59/100 m: più lento del tuo 400 m (1:44/100 m)",
    ]);
    expect(region).toHaveTextContent(
      "Retta distanza = velocità × tempo + D′ su 2 tratti: riserva D′ 16 m, R² 1,00 (con due tratti la retta passa per entrambi: R² è sempre 1)."
    );
    expect(region).toHaveTextContent("Stima su 2 tratti continui a stile libero in vasca degli ultimi 90 giorni.");
    await userEvent.click(within(region).getByRole("button", { name: "Inserisci un test" }));
    expect(screen.getByRole("dialog", { name: "Test del passo soglia" })).toBeTruthy();
  });

  it("forma e fatica: sintesi, rampa, lettura di oggi, carichi stimati e base", async () => {
    renderCards();
    await userEvent.click(card("Forma e fatica"));
    const region = screen.getByRole("region", { name: /^Forma e fatica/ });
    expect(
      within(region).getByRole("img", {
        name: "Ultimi 90 giorni: forma da 30 a 41, fatica 49, equilibrio −7 (neutro).",
      })
    ).toBeTruthy();
    expect(region).toHaveTextContent("Forma +2,1 punti nell'ultima settimana.");
    expect(region).toHaveTextContent("Oggi l'equilibrio è −7: neutro.");
    // The open-water swim has no laps: its load is estimated, and the card says how many are.
    expect(region).toHaveTextContent(
      "1 nuotata senza giri: carico stimato su distanza e durata totale, come fa TrainingPeaks."
    );
    expect(region).toHaveTextContent("Carico di 7 nuotate degli ultimi 90 giorni");
  });

  it("forma: la lettura lunga nel «Come si legge», quella breve nell'intestazione", async () => {
    const metrics = swimMetricsFixture();
    metrics.load.today = { ctl: 52.1, atl: 24.7, tsb: 27.4, reading: "molto_riposato" };
    renderCards(metrics);
    expect(card("Forma e fatica")).toHaveTextContent("Forma e fatica +27 molto riposato");
    expect(card("Forma e fatica")).not.toHaveTextContent("rischio");
    await userEvent.click(card("Forma e fatica"));
    expect(screen.getByRole("region", { name: /^Forma e fatica/ })).toHaveTextContent(
      "Oggi l'equilibrio è +27: molto riposato (rischio di perdere forma se dura)."
    );
  });

  it("forma: nessuna nota sul carico stimato quando ogni nuotata ha i giri", async () => {
    const metrics = swimMetricsFixture();
    metrics.sessions = metrics.sessions.map((session) => ({ ...session, loadEstimated: false }));
    renderCards(metrics);
    await userEvent.click(card("Forma e fatica"));
    expect(screen.getByRole("region", { name: /^Forma e fatica/ })).not.toHaveTextContent("carico stimato");
  });

  it("forma: una crescita oltre la soglia è detta come tale", async () => {
    const metrics = swimMetricsFixture();
    metrics.load.rampPerWeek = 9.4;
    renderCards(metrics);
    await userEvent.click(card("Forma e fatica"));
    expect(screen.getByText("Forma +9,4 punti nell'ultima settimana: crescita molto rapida.")).toBeTruthy();
  });

  it("efficienza: grafico con la base, confronto di distanza per ciclo e passo, numeri di nuotate", async () => {
    renderCards();
    await userEvent.click(card("Efficienza della bracciata"));
    const region = screen.getByRole("region", { name: /^Efficienza della bracciata/ });
    expect(
      within(region).getByRole("img", {
        name: "Stroke Index per nuotata in vasca da 25 m, ultimi 90 giorni: 6 nuotate, da 1,40 a 1,54, ultima 1,54; la tua base è 1,42.",
      })
    ).toBeTruthy();
    const table = within(region).getByRole("table", { name: "Ultime 4 settimane e la tua base (mediane)" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Ultime 4 settimane",
      "La tua base",
    ]);
    expect(within(table).getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual([
      "Stroke Index1,521,42",
      "Distanza per ciclo1,72 m1,70 m",
      "Passo1:53 /100 m2:00 /100 m",
    ]);
    expect(region).toHaveTextContent("Lo Stroke Index sale con una bracciata più lunga e un passo più veloce.");
    expect(region).toHaveTextContent("1,54 Ultima nuotata");
    expect(region).toHaveTextContent("31 Bracciate al minuto");
    expect(region).toHaveTextContent(
      "Mediana di 3 nuotate in vasca da 25 m degli ultimi 28 giorni; la tua base è la mediana di 3 nuotate dei 90 giorni precedenti."
    );
  });

  it("efficienza: se la distanza per ciclo non cresce, lo Stroke Index sale solo con la velocità", async () => {
    const metrics = swimMetricsFixture();
    metrics.efficiency = { ...metrics.efficiency, dps28: 1.7, dpsBaseline: 1.7 };
    renderCards(metrics);
    await userEvent.click(card("Efficienza della bracciata"));
    expect(screen.getByRole("region", { name: /^Efficienza della bracciata/ })).toHaveTextContent(
      "Lo Stroke Index sale solo perché vai più veloce: la distanza per ciclo non cresce."
    );
  });

  it("efficienza senza base: mostra i valori, quante nuotate ci sono e cosa manca", async () => {
    const metrics = swimMetricsFixture();
    const missing = "Per la tua base servono almeno 3 nuotate in questa vasca nei 90 giorni prima delle ultime 4 settimane.";
    metrics.efficiency = {
      ...metrics.efficiency,
      baseline: null,
      deltaPct: null,
      nBaseline: 2,
      dpsBaseline: null,
      paceBaseline: null,
      missing,
    };
    renderCards(metrics);
    expect(card("Efficienza della bracciata")).toHaveTextContent("1,52 vasca da 25 m");
    await userEvent.click(card("Efficienza della bracciata"));
    const region = screen.getByRole("region", { name: /^Efficienza della bracciata/ });
    expect(region).toHaveTextContent(missing);
    expect(region).toHaveTextContent(
      "Mediana di 3 nuotate in vasca da 25 m degli ultimi 28 giorni; nei 90 giorni precedenti ci sono 2 nuotate in questa vasca."
    );
    const table = within(region).getByRole("table", { name: "Ultime 4 settimane (mediane)" });
    expect(within(table).getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual([
      "Stroke Index1,52",
      "Distanza per ciclo1,72 m",
      "Passo1:53 /100 m",
    ]);
    expect(region).not.toHaveTextContent("La tua base");
    expect(region).not.toHaveTextContent("Lo Stroke Index sale");
  });

  it("vasca da 25 yarde: «25 yd», mai «23 m»", async () => {
    const metrics = swimMetricsFixture();
    metrics.sessions = metrics.sessions.map((session) =>
      session.isOpenWater ? session : { ...session, poolLengthMeters: 23 }
    );
    metrics.efficiency = { ...metrics.efficiency, poolLengthMeters: 23, baseline: null, deltaPct: null };
    const yards = (nominalDistance: number, distanceMeters: number, seconds: number, date: string) => ({
      distanceMeters, seconds, date, nominalDistance, distanceUnit: "yd" as const,
    });
    const best400 = yards(400, 365.76, 380, "2026-10-20");
    metrics.css.current = {
      ...metrics.css.current!,
      points: [yards(200, 182.88, 182, "2026-10-06"), best400],
      droppedPoints: [{ ...yards(300, 274.32, 330, "2026-09-29"), slowerThan: best400 }],
    };
    renderCards(metrics);
    expect(card("Efficienza della bracciata")).toHaveTextContent("1,52 vasca da 25 yd");
    await userEvent.click(card("Efficienza della bracciata"));
    const efficiency = screen.getByRole("region", { name: /^Efficienza della bracciata/ });
    expect(within(efficiency).getByRole("img", { name: /^Stroke Index per nuotata in vasca da 25 yd,/ })).toBeTruthy();
    expect(efficiency).toHaveTextContent("Mediana di 3 nuotate in vasca da 25 yd degli ultimi 28 giorni");
    expect(efficiency).not.toHaveTextContent("23 m");

    await userEvent.click(card("Passo soglia"));
    const css = screen.getByRole("region", { name: /^Passo soglia/ });
    expect(
      within(within(css).getByRole("list", { name: "Tratti usati per la stima" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual(["200 yd in 3:02 · 6 ott", "400 yd in 6:20 · 20 ott"]);
    expect(css).toHaveTextContent("300 yd in 5:30 · 29 set, a 2:00/100 m: più lento del tuo 400 yd (1:44/100 m)");
  });

  it("ripetute: tempi e distanza per bracciata dell'ultima serie, tenuta e variabilità per nuotata", async () => {
    renderCards();
    await userEvent.click(card("Regolarità e tenuta nelle ripetute"));
    const region = screen.getByRole("region", { name: /^Regolarità e tenuta nelle ripetute/ });
    expect(
      within(region).getByRole("img", {
        name: "Ultima serie, 27 ott: 6 × 100 m stile libero in 1:43, 1:45, 1:46, 1:48, 1:49, 1:51.",
      })
    ).toBeTruthy();
    // The same set, rep by rep: its distance per cycle drops 5,6% (over the 5% convention).
    expect(
      within(region).getByRole("img", {
        name: "Distanza per bracciata nell'ultima serie: 1,80, 1,78, 1,76, 1,74, 1,70, 1,68 m; dal primo all'ultimo terzo cala del 5,6%: la bracciata si accorcia nel finale.",
      })
    ).toBeTruthy();
    expect(
      within(region).getByRole("img", {
        name: "Variabilità per nuotata negli ultimi 90 giorni: 5 nuotate, da 2,4% a 3,1%, ultima 2,7%.",
      })
    ).toBeTruthy();
    expect(region).toHaveTextContent("+4,0 % Calo nel finale");
    // Stroke holding over 28 days: median 3,4% (under 5%), the stroke rate rises 4,1%.
    expect(region).toHaveTextContent("−3,4 % Distanza per bracciata nel finale");
    expect(region).toHaveTextContent("+4,1 % Frequenza nel finale");
    expect(region).toHaveTextContent(
      "Tenuta della bracciata: dal primo all'ultimo terzo delle serie la distanza per bracciata cala del 3,4%, la frequenza sale del 4,1%: la bracciata tiene. Mediana di 3 nuotate degli ultimi 28 giorni."
    );
  });

  it("ripetute: con un calo oltre la soglia la lettura lo dice", () => {
    const metrics = swimMetricsFixture();
    metrics.pacing.fade28 = 6.2;
    renderCards(metrics);
    expect(card("Regolarità e tenuta nelle ripetute")).toHaveTextContent("regolare, cali nel finale");
  });

  it("ripetute: distanza per bracciata che cala oltre il 5%: la bracciata si accorcia nel finale", async () => {
    const metrics = swimMetricsFixture();
    metrics.pacing.dpsDrop28 = 6.1;
    renderCards(metrics);
    await userEvent.click(card("Regolarità e tenuta nelle ripetute"));
    const region = screen.getByRole("region", { name: /^Regolarità e tenuta nelle ripetute/ });
    expect(region).toHaveTextContent("−6,1 % Distanza per bracciata nel finale");
    expect(region).toHaveTextContent("cala del 6,1%, la frequenza sale del 4,1%: la bracciata si accorcia nel finale.");
  });

  it("ripetute senza bracciate per ripetuta: niente grafico della bracciata e cosa serve", async () => {
    const metrics = swimMetricsFixture();
    metrics.pacing = {
      ...metrics.pacing,
      dpsDrop28: null,
      strokeRateRise28: null,
      latestSet: { ...metrics.pacing.latestSet!, repDps: null, dpsDropPct: null },
    };
    renderCards(metrics);
    await userEvent.click(card("Regolarità e tenuta nelle ripetute"));
    const region = screen.getByRole("region", { name: /^Regolarità e tenuta nelle ripetute/ });
    expect(within(region).queryByRole("img", { name: /^Distanza per bracciata/ })).toBeNull();
    expect(region).not.toHaveTextContent("Frequenza nel finale");
    expect(region).toHaveTextContent(
      "Tenuta della bracciata: servono serie con le bracciate registrate in ogni ripetuta."
    );
  });

  it("volume: barre settimanali con sintesi e medie", async () => {
    renderCards();
    await userEvent.click(card("Volume e costanza"));
    const region = screen.getByRole("region", { name: /^Volume e costanza/ });
    expect(
      within(region).getByRole("img", {
        name: "Km per settimana nelle ultime 12 settimane: massimo 8,6 km nella settimana del 19 ott; settimana in corso 3 km con 1 nuotata.",
      })
    ).toBeTruthy();
    expect(region).toHaveTextContent("2,8 Nuotate a settimana");
    expect(region).toHaveTextContent("+30 % Sulle 4 precedenti");
    expect(region).toHaveTextContent("Ultime 12 settimane: 25 nuotate, 68,8 km.");
  });

  it("passo soglia da test: la lettura dice la data del test", () => {
    const metrics = swimMetricsFixture();
    metrics.css.current = {
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
    renderCards(metrics);
    expect(card("Passo soglia")).toHaveTextContent("1:40 /100 m test del 12 ott");
  });

  it("senza dati: «—» nell'intestazione e, aperto, cosa serve", async () => {
    const metrics = emptySwimMetricsFixture();
    renderCards(metrics);
    for (const name of NAMES.slice(0, 5)) {
      expect(card(name)).toHaveTextContent(`${name} — servono più dati`);
    }
    // Two swims this week: the volume has a value.
    expect(card("Volume e costanza")).toHaveTextContent("0 km/sett. serie: 1 settimana");

    await userEvent.click(card("Passo soglia"));
    const css = screen.getByRole("region", { name: /^Passo soglia/ });
    expect(css).toHaveTextContent(metrics.css.missing!);
    expect(within(css).queryByRole("img")).toBeNull();
    // Without data the test is the way to get a threshold pace.
    expect(within(css).getByRole("button", { name: "Inserisci un test" })).toBeTruthy();

    await userEvent.click(card("Intensità"));
    const intensity = screen.getByRole("region", { name: /^Intensità/ });
    expect(intensity).toHaveTextContent("Servono il passo soglia e nuotate con i giri.");
    expect(within(intensity).queryByRole("img")).toBeNull();
    // No threshold pace: no zone paces.
    expect(within(intensity).queryByRole("table")).toBeNull();
  });

  it("volume senza nuotate: «—» e il motivo", async () => {
    const metrics = emptySwimMetricsFixture();
    metrics.volume.weeks = metrics.volume.weeks.map((week) => ({ ...week, km: 0, sessions: 0 }));
    metrics.volume.streakWeeks = 0;
    renderCards(metrics);
    expect(card("Volume e costanza")).toHaveTextContent("Volume e costanza — servono più dati");
    await userEvent.click(card("Volume e costanza"));
    expect(screen.getByText("Nessuna nuotata nelle ultime 12 settimane.")).toBeTruthy();
  });

  it("«Come si calcola» apre formula, fonte e convenzioni", async () => {
    renderCards();
    await userEvent.click(card("Forma e fatica"));
    await userEvent.click(screen.getByRole("button", { name: "Come si calcola: Forma e fatica" }));
    const dialog = screen.getByRole("dialog", { name: "Forma e fatica" });
    expect(dialog).toHaveTextContent("Carico = IF³ × ore × 100");
    expect(within(dialog).getByRole("heading", { name: "Fonte" })).toBeTruthy();
    expect(dialog).toHaveTextContent("modello di Banister");
    const conventions = within(dialog).getByRole("list", { name: "Convenzioni" });
    // The five TrainingPeaks bands, the ramp and our IF for the other strokes.
    expect(within(conventions).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Equilibrio sopra +25: molto riposato (rischio di perdere forma se dura).",
      "Da +5 (escluso) a +25: fresco.",
      "Da −10 a +5: neutro.",
      "Da −30 a −10 (escluso): in costruzione.",
      "Sotto −30: carico alto.",
      "Forma che cresce più di 8 punti a settimana: crescita molto rapida.",
      "Giri non a stile libero (altri stili, tecnica, gambe, stile non registrato): IF fisso 0,80, perché il passo soglia è a stile libero. È una convenzione nostra.",
    ]);
  });

  it("il volume non ha convenzioni: il dialogo non ne mostra", async () => {
    renderCards();
    await userEvent.click(card("Volume e costanza"));
    await userEvent.click(screen.getByRole("button", { name: "Come si calcola: Volume e costanza" }));
    const dialog = screen.getByRole("dialog", { name: "Volume e costanza" });
    expect(within(dialog).queryByRole("list", { name: "Convenzioni" })).toBeNull();
    expect(dialog).toHaveTextContent("Misura diretta del volume di allenamento.");
  });
});
