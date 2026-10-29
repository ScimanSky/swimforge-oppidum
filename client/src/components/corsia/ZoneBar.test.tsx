import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ZoneBar, zoneShares } from "./ZoneBar";

afterEach(cleanup);

describe("zoneShares", () => {
  it("percentuali intere che sommano a 100, zona prevalente segnata", () => {
    const shares = zoneShares([80, 220, 380, 240, 80])!;
    expect(shares.map(share => share.percent)).toEqual([8, 22, 38, 24, 8]);
    expect(shares.filter(share => share.dominant).map(share => share.zone)).toEqual([3]);
  });

  it("arrotonda col resto maggiore: tre terzi fanno 100", () => {
    const shares = zoneShares([100, 100, 100, 0, 0])!;
    expect(shares.map(share => share.percent)).toEqual([34, 33, 33, 0, 0]);
    expect(shares.reduce((sum, share) => sum + share.percent, 0)).toBe(100);
    // Parità: vince la zona più bassa.
    expect(shares.find(share => share.dominant)?.zone).toBe(1);
  });

  it("nessun tempo (o valori non validi) → null", () => {
    expect(zoneShares([0, 0, 0, 0, 0])).toBeNull();
    expect(zoneShares([null, undefined, -5, Number.NaN])).toBeNull();
  });

  it("valori mancanti contano zero", () => {
    expect(zoneShares([null, 60])!.map(share => share.percent)).toEqual([0, 100, 0, 0, 0]);
  });
});

describe("ZoneBar", () => {
  it("cinque etichette, la prevalente in <strong> e detta, segmenti solo per le zone con tempo", () => {
    const { container } = render(<ZoneBar seconds={[0, 300, 900, 0, 0]} />);
    const items = screen.getAllByRole("listitem");
    expect(items.map(item => item.textContent)).toEqual([
      "Z1 0%",
      "Z2 25%",
      "Z3 75%, prevalente",
      "Z4 0%",
      "Z5 0%",
    ]);
    expect(items[2].querySelector("strong")).toHaveTextContent("Z3 75%, prevalente");
    expect(items[1].querySelector("strong")).toBeNull();
    const segments = container.querySelectorAll("[aria-hidden] > div");
    expect(Array.from(segments, segment => segment.className)).toEqual([
      expect.stringContaining("bg-zone-2"),
      expect.stringContaining("bg-zone-3"),
    ]);
  });

  it("senza dati non disegna nulla", () => {
    const { container } = render(<ZoneBar seconds={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
