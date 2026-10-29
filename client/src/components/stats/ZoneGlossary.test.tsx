import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ZoneGlossary, ZoneGlossaryButton } from "./ZoneGlossary";
import { swimMetricsFixture } from "./metrics-fixture";

const RANGES = swimMetricsFixture().zones.ranges;

describe("Le zone A1–C3", () => {
  afterEach(cleanup);

  it("ogni zona con descrizione, sensazioni, fatica, a cosa serve, il tuo passo e la ripetuta massima", () => {
    render(<ZoneGlossary ranges={RANGES} open onOpenChange={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Le zone A1–C3" });
    expect(dialog).toHaveTextContent(
      "Sette zone, dalla più lenta alla più esplosiva: più alta è la zona, più è intensa e più corte sono le ripetute."
    );
    expect(dialog).toHaveTextContent(
      "Le zone A sono aerobiche (lavoro facile e di base, potresti parlare), le B miste (aerobico sostenuto fino a ridosso della soglia, frasi brevi), le C anaerobiche (dalla soglia in su: ripetute brevi e recuperi lunghi)."
    );
    expect(within(dialog).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "A1 Recupero attivo · Facile",
      "A2 Fondo lento · Aerobico",
      "B1 Fondo medio · Medio",
      "B2 Fondo medio-alto · Soglia",
      "C1 Soglia anaerobica · Soglia",
      "C2 Capacità anaerobica · Sopra soglia",
      "C3 Potenza anaerobica · Sopra soglia",
    ]);
    const c1 = within(dialog).getByRole("region", { name: "C1 Soglia anaerobica · Soglia" });
    expect(c1).toHaveTextContent("Soglia anaerobica alta, ritmo gara su distanze medio-lunghe, massimo 200 m a ripetuta.");
    const terms = Array.from(c1.querySelectorAll("dt")).map((dt) => `${dt.textContent} ${dt.nextElementSibling?.textContent}`);
    expect(terms).toEqual([
      "Il tuo passo 1:44–1:49 /100 m",
      "Ripetuta massima 200 m",
      "Sensazione Respiro affannoso ma ancora controllato, una parola o due.",
      "Fatica (1–10) 7–8",
      "A cosa serve Abitua al ritmo gara su distanze medio-lunghe e spinge in alto il passo soglia.",
    ]);
    const a1 = within(dialog).getByRole("region", { name: "A1 Recupero attivo · Facile" });
    expect(Array.from(a1.querySelectorAll("dt")).map((dt) => dt.textContent)).not.toContain("Ripetuta massima");
  });

  it("si apre sulla zona scelta", () => {
    render(<ZoneGlossary ranges={RANGES} open onOpenChange={() => {}} focusZone="B2" />);
    expect(screen.getByRole("heading", { level: 3, name: "B2 Fondo medio-alto · Soglia" })).toHaveFocus();
  });

  it("senza zone: il passo manca e dice perché", () => {
    render(<ZoneGlossary ranges={[]} open onOpenChange={() => {}} />);
    const b2 = screen.getByRole("region", { name: "B2 Fondo medio-alto · Soglia" });
    expect(b2.querySelector("dd")).toHaveTextContent("serve il passo soglia o le tue zone");
  });

  it("il pulsante apre il glossario", async () => {
    render(<ZoneGlossaryButton ranges={RANGES} />);
    await userEvent.click(screen.getByRole("button", { name: "Le zone A1–C3" }));
    expect(screen.getByRole("dialog", { name: "Le zone A1–C3" })).toBeTruthy();
  });
});
