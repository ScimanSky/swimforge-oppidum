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
  "Regolarità nelle ripetute",
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
    expect(card("Passo soglia")).toHaveTextContent("Passo soglia 1:48 /100 m stima, affidabilità media");
    expect(card("Forma e fatica")).toHaveTextContent("Forma e fatica −7 in costruzione");
    expect(card("Intensità")).toHaveTextContent("Intensità 64% facile 17% medio, 19% intenso");
    expect(card("Efficienza della bracciata")).toHaveTextContent("1,52 +7% sulla tua base");
    expect(card("Regolarità nelle ripetute")).toHaveTextContent("2,6% variabilità regolare");
    expect(card("Volume e costanza")).toHaveTextContent("7,7 km/sett. serie: 9 settimane");
  });

  it("aprendo un riquadro compaiono il grafico con la sua sintesi, come si legge e la base dei dati", async () => {
    renderCards();
    await userEvent.click(card("Intensità"));
    expect(card("Intensità").getAttribute("aria-expanded")).toBe("true");
    const region = screen.getByRole("region", { name: /^Intensità/ });
    expect(
      within(region).getByRole("img", {
        name: "Ultime 8 settimane: 15,4 km con i giri, 9,7 in Z1–Z2 (facile), 2,9 in Z3 (medio), 2,8 in Z4–Z5 (intenso).",
      })
    ).toBeTruthy();
    expect(region).toHaveTextContent("Come si legge: Gli studi sugli sport di resistenza");
    expect(region).toHaveTextContent("Su 3 nuotate con i giri degli ultimi 28 giorni (9,6 km).");
    // Legend of the zones and the split of the last 4 weeks.
    for (const zone of ["Facile", "Aerobico", "Medio", "Soglia", "Sopra soglia"]) {
      expect(within(region).getAllByText(new RegExp(zone)).length).toBeGreaterThan(0);
    }
    // The other cards stay closed and without charts.
    expect(card("Passo soglia").getAttribute("aria-expanded")).toBe("false");
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("si possono aprire più riquadri insieme", async () => {
    renderCards();
    await userEvent.click(card("Passo soglia"));
    await userEvent.click(card("Volume e costanza"));
    expect(card("Passo soglia").getAttribute("aria-expanded")).toBe("true");
    expect(card("Volume e costanza").getAttribute("aria-expanded")).toBe("true");
  });

  it("passo soglia: storia mensile, tratti usati, fonte", async () => {
    renderCards();
    await userEvent.click(card("Passo soglia"));
    const region = screen.getByRole("region", { name: /^Passo soglia/ });
    expect(
      within(region).getByRole("img", {
        name: "Passo soglia a fine mese, per 100 m: maggio nessuna stima, giugno nessuna stima, luglio 1:52, agosto 1:51, settembre 1:49, ottobre 1:48.",
      })
    ).toBeTruthy();
    const points = within(region).getByRole("list", { name: "Tratti usati per la stima" });
    expect(within(points).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "200 m in 3:16 · 6 ott",
      "400 m in 6:50 · 20 ott",
    ]);
    expect(region).toHaveTextContent("Stima su 2 tratti continui a stile libero in vasca degli ultimi 90 giorni.");
  });

  it("forma e fatica: sintesi, rampa e base", async () => {
    renderCards();
    await userEvent.click(card("Forma e fatica"));
    const region = screen.getByRole("region", { name: /^Forma e fatica/ });
    expect(
      within(region).getByRole("img", {
        name: "Ultimi 90 giorni: forma da 30 a 41, fatica 49, equilibrio −7 (in costruzione).",
      })
    ).toBeTruthy();
    expect(region).toHaveTextContent("Forma +2,1 punti nell'ultima settimana.");
    expect(region).toHaveTextContent("Carico di 7 nuotate degli ultimi 90 giorni");
  });

  it("forma: una crescita oltre la soglia è detta come tale", async () => {
    const metrics = swimMetricsFixture();
    metrics.load.rampPerWeek = 9.4;
    renderCards(metrics);
    await userEvent.click(card("Forma e fatica"));
    expect(screen.getByText("Forma +9,4 punti nell'ultima settimana: crescita molto rapida.")).toBeTruthy();
  });

  it("efficienza: grafico con la base, ultima nuotata, distanza per ciclo e frequenza", async () => {
    renderCards();
    await userEvent.click(card("Efficienza della bracciata"));
    const region = screen.getByRole("region", { name: /^Efficienza della bracciata/ });
    expect(
      within(region).getByRole("img", {
        name: "Stroke Index per nuotata in vasca da 25 m, ultimi 90 giorni: 6 nuotate, da 1,40 a 1,54, ultima 1,54; la tua base è 1,42.",
      })
    ).toBeTruthy();
    expect(region).toHaveTextContent("1,54 Ultima nuotata");
    expect(region).toHaveTextContent("1,42 La tua base");
    expect(region).toHaveTextContent("2,05 m Distanza per ciclo");
    expect(region).toHaveTextContent("31 Bracciate al minuto");
    expect(region).toHaveTextContent("Media di 3 nuotate in vasca da 25 m degli ultimi 28 giorni.");
  });

  it("efficienza senza base: mostra i valori e dice cosa manca", async () => {
    const metrics = swimMetricsFixture();
    metrics.efficiency = {
      ...metrics.efficiency,
      baseline: null,
      deltaPct: null,
      missing: "Serve qualche settimana di nuotate per avere la tua base.",
    };
    renderCards(metrics);
    expect(card("Efficienza della bracciata")).toHaveTextContent("1,52 vasca da 25 m");
    await userEvent.click(card("Efficienza della bracciata"));
    const region = screen.getByRole("region", { name: /^Efficienza della bracciata/ });
    expect(region).toHaveTextContent("Serve qualche settimana di nuotate per avere la tua base.");
    expect(region).not.toHaveTextContent("La tua base");
  });

  it("ripetute: tempi dell'ultima serie e variabilità per nuotata", async () => {
    renderCards();
    await userEvent.click(card("Regolarità nelle ripetute"));
    const region = screen.getByRole("region", { name: /^Regolarità nelle ripetute/ });
    expect(
      within(region).getByRole("img", {
        name: "Ultima serie, 27 ott: 6 × 100 m stile libero in 1:32, 1:33, 1:33, 1:34, 1:35, 1:36.",
      })
    ).toBeTruthy();
    expect(
      within(region).getByRole("img", {
        name: "Variabilità per nuotata negli ultimi 90 giorni: 5 nuotate, da 2,4% a 3,1%, ultima 3,0%.",
      })
    ).toBeTruthy();
    expect(region).toHaveTextContent("+4,0 % Calo nel finale");
  });

  it("ripetute: con un calo oltre la soglia la lettura lo dice", () => {
    const metrics = swimMetricsFixture();
    metrics.pacing.fade28 = 6.2;
    renderCards(metrics);
    expect(card("Regolarità nelle ripetute")).toHaveTextContent("regolare, cali nel finale");
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

    await userEvent.click(card("Intensità"));
    const intensity = screen.getByRole("region", { name: /^Intensità/ });
    expect(intensity).toHaveTextContent("Servono il passo soglia e nuotate con i giri.");
    expect(within(intensity).queryByRole("img")).toBeNull();
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
    expect(dialog).toHaveTextContent("Carico della nuotata = IF³ × ore × 100");
    expect(within(dialog).getByRole("heading", { name: "Fonte" })).toBeTruthy();
    expect(dialog).toHaveTextContent("modello di Banister");
    const conventions = within(dialog).getByRole("list", { name: "Convenzioni" });
    expect(within(conventions).getAllByRole("listitem")).toHaveLength(6);
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
