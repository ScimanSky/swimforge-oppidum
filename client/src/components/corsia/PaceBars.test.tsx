import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PaceBars, paceBars } from "./PaceBars";

afterEach(cleanup);

describe("paceBars", () => {
  it("più veloce = più alta (100%), più lenta al minimo, la più veloce segnata", () => {
    const bars = paceBars([
      { number: 1, pace: 120 },
      { number: 2, pace: 100 },
      { number: 3, pace: 110 },
    ])!;
    // Scaled on speed (100 / pace), not on pace: 110 s is 45% of the way from 120 s to 100 s.
    expect(bars.map(bar => bar.height)).toEqual([35, 100, 65]);
    expect(bars.filter(bar => bar.fastest).map(bar => bar.number)).toEqual([2]);
  });

  it("scarta passi mancanti o non validi; servono almeno due ripetute", () => {
    expect(paceBars([{ number: 1, pace: 100 }, { number: 2, pace: null }])).toBeNull();
    const bars = paceBars([
      { number: 1, pace: 0 },
      { number: 2, pace: 105 },
      { number: 3, pace: Number.NaN },
      { number: 4, pace: 105 },
    ])!;
    expect(bars.map(bar => bar.number)).toEqual([2, 4]);
    // Same pace everywhere: full height, the first one is the fastest.
    expect(bars.map(bar => [bar.height, bar.fastest])).toEqual([
      [100, true],
      [100, false],
    ]);
  });
});

describe("PaceBars", () => {
  it("dice in testo la prima, l'ultima e la ripetuta più veloce", () => {
    const bars = paceBars([
      { number: 1, pace: 115 },
      { number: 7, pace: 107 },
      { number: 10, pace: 112 },
    ])!;
    const { container } = render(<PaceBars bars={bars} />);
    expect(screen.getByText("Più veloce: rip. 7 · 1:47")).toBeInTheDocument();
    expect(container).toHaveTextContent("Rip. 1");
    // One bar per repeat; the tooltip marks the fastest, the height follows the speed.
    expect(screen.getAllByTitle(/^Rip\./).map(bar => bar.title)).toEqual([
      "Rip. 1 · 1:55",
      "Rip. 7 · 1:47 · la più veloce",
      "Rip. 10 · 1:52",
    ]);
    expect(screen.getByTitle("Rip. 7 · 1:47 · la più veloce")).toHaveStyle({ height: "100%" });
    expect(screen.getByTitle("Rip. 1 · 1:55")).toHaveStyle({ height: "35%" });
  });
});
