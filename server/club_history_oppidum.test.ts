import { describe, expect, it } from "vitest";
import {
  parseOppidumAthleteHtml,
  parseOppidumIndexHtml,
  parseOppidumMeetHtml,
  parseOppidumPoints,
  parseOppidumSwimTimeToCentiseconds,
} from "./club_history_oppidum";

describe("club_history_oppidum parsing", () => {
  it("parses swim times in Oppidum formats", () => {
    expect(parseOppidumSwimTimeToCentiseconds("39\"60")).toBe(3960);
    expect(parseOppidumSwimTimeToCentiseconds("1'27\"32")).toBe(8732);
    expect(parseOppidumSwimTimeToCentiseconds("3'08\"85")).toBe(18885);
    expect(parseOppidumSwimTimeToCentiseconds("1'21'01")).toBe(8101);
    expect(parseOppidumSwimTimeToCentiseconds("-")).toBeNull();
    expect(parseOppidumSwimTimeToCentiseconds("Nota")).toBeNull();
  });

  it("parses points with comma and dot", () => {
    expect(parseOppidumPoints("724,75")).toBeCloseTo(724.75);
    expect(parseOppidumPoints("727.45")).toBeCloseTo(727.45);
    expect(parseOppidumPoints("-")).toBeNull();
  });

  it("extracts index athletes and meets", () => {
    const html = `
      <div>
        <p>29 Marzo 2025</p>
        <p>Sardegna Nuota</p>
        <p><a href="./2025-Sardegna-Nuota.html">Risultati</a></p>
        <p><a href="./Alessandra-Meloni.html">Alessandra Meloni</a></p>
      </div>
    `;

    const parsed = parseOppidumIndexHtml(html, "https://www.oppidumsport.it/master.html");
    expect(parsed.meets).toHaveLength(1);
    expect(parsed.meets[0]?.meetSlug).toBe("2025-sardegna-nuota");
    expect(parsed.athletes).toHaveLength(1);
    expect(parsed.athletes[0]?.athleteSlug).toBe("alessandra-meloni");
  });

  it("extracts athlete page rows", () => {
    const html = `
      <h1 class="w3-xlarge"><b>Alessandra Meloni</b></h1>
      <h1 class="w3-xlarge w3-text-red"><b>2024-2025</b></h1>
      <div class="w3-container">
        <div class="w3-half"><p class="w3-red">29/03/2025</p></div>
        <div class="w3-half"><p class="w3-red">Sardegna Nuota</p></div>
      </div>
      <!-- Inizio Gare -->
      <div class="w3-container">
        <div class="w3-quarter">
          <ul class="w3-ul">
            <li class="w3-padding-small"><b>100 sl</b></li>
            <li class="w3-padding-small">1'25\"06</li>
          </ul>
        </div>
      </div>
      <!-- Fine Gare -->
    `;

    const parsed = parseOppidumAthleteHtml(html, "https://www.oppidumsport.it/Alessandra-Meloni.html");
    expect(parsed.athleteName).toBe("Alessandra Meloni");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.eventLabel).toBe("100 sl");
    expect(parsed.rows[0]?.finalTimeCs).toBe(8506);
  });

  it("extracts meet page rows with points", () => {
    const html = `
      <h1 class="w3-xlarge w3-text-red"><b>29 Marzo 2025 Sardegna Nuota</b></h1>
      <!-- Inizio Atleta -->
      <div>
        <div class="w3-quarter">
          <ul class="w3-ul">
            <li class="w3-padding-small w3-red">Alessandra Meloni</li>
            <li class="w3-padding-small">100 sl</li>
          </ul>
        </div>
        <div class="w3-quarter">
          <ul class="w3-ul">
            <li class="w3-padding-small w3-red">Tempo</li>
            <li class="w3-padding-small">1'25\"06</li>
          </ul>
        </div>
        <div class="w3-quarter">
          <ul class="w3-ul">
            <li class="w3-padding-small w3-red">Punti</li>
            <li class="w3-padding-small">732,19</li>
          </ul>
        </div>
        <div class="w3-quarter">
          <ul class="w3-ul">
            <li class="w3-padding-small w3-red">Record</li>
            <li class="w3-padding-small">1'18\"78</li>
          </ul>
        </div>
      </div>
      <!-- Fine Atleta -->
    `;

    const parsed = parseOppidumMeetHtml(html, "https://www.oppidumsport.it/2025-Sardegna-Nuota.html");
    expect(parsed.meetSlug).toBe("2025-sardegna-nuota");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.athleteName).toBe("Alessandra Meloni");
    expect(parsed.rows[0]?.points).toBeCloseTo(732.19);
  });
});
