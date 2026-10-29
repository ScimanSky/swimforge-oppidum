import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import HistoryMetricCircle from "./HistoryMetricCircle";

describe("HistoryMetricCircle", () => {
  afterEach(() => {
    cleanup();
  });

  it("mostra valore ed etichetta, letti insieme", () => {
    const { container } = render(<HistoryMetricCircle label="Tempo" value={'1\'03"25'} />);

    expect(screen.getByText("Tempo")).toBeInTheDocument();
    expect(screen.getByText('1\'03"25')).toBeInTheDocument();
    expect(container.textContent).toBe('1\'03"25 Tempo');
  });

  it("un nuovo record si distingue solo per il colore del record, senza pulsare", () => {
    const { container } = render(<HistoryMetricCircle label="Record" value="SI" highlight />);

    expect(screen.getByText("SI").className).toContain("text-xp");
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });

  it("anche nella misura compatta l'etichetta resta di 12px", () => {
    render(<HistoryMetricCircle label="Punti" value="724.75" size="sm" />);

    expect(screen.getByText("Punti").className).toContain("text-xs");
  });
});
