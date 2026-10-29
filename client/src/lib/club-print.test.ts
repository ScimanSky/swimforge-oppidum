import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMeetEntriesPrintHtml,
  buildMeetRosterPrintHtml,
  buildWorkoutPrintHtml,
  escapeHtml,
  formatTimeCs,
  openPrintTab,
  type MeetRosterRow,
} from "./club-print";

describe("club-print", () => {
  afterEach(() => vi.restoreAllMocks());

  it("escapeHtml neutralizza i caratteri dell'HTML, anche su valori mancanti", () => {
    expect(escapeHtml(`<b>"Ada" & 'Bo'</b>`)).toBe("&lt;b&gt;&quot;Ada&quot; &amp; &#39;Bo&#39;&lt;/b&gt;");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("formatTimeCs: centesimi come «1:05.32»", () => {
    expect(formatTimeCs(6532)).toBe("1:05.32");
    expect(formatTimeCs(null)).toBe("-");
  });

  it("elenco iscritti della gara: solo le iscrizioni attive, in ordine di nome", () => {
    const html = buildMeetEntriesPrintHtml({
      meet: { name: "Trofeo <Città>" },
      events: [{ id: 1, label: "100 SL", distanceMeters: 100, stroke: "SL" }],
      groupedEntries: new Map([
        [
          1,
          [
            { user: { name: "Zeno" }, entry: { status: "confirmed", seedTimeCs: 6532 } },
            { user: { name: "Ada" }, entry: { status: "pending" } },
            { user: { name: "Bruno" }, entry: { status: "withdrawn" } },
          ],
        ],
      ]),
    });
    expect(html).toContain("Trofeo &lt;Città&gt;");
    expect(html.indexOf("Ada")).toBeLessThan(html.indexOf("Zeno"));
    expect(html).not.toContain("Bruno");
    expect(html).toContain("1:05.32");
  });

  it("roster del coach e scheda allenamento sono documenti interi con il loro titolo", () => {
    const row: MeetRosterRow = {
      entryId: 1,
      firstName: "Ada",
      lastName: "<Rossi>",
      fullName: "Ada <Rossi>",
      email: "ada@example.com",
      eventLabel: "100 SL",
      stroke: "SL",
      distance: "100m",
      status: "Confermata",
      seedTime: "1:05.32",
    };
    const roster = buildMeetRosterPrintHtml({ name: "Trofeo" }, [row]);
    expect(roster.startsWith("<!doctype html>")).toBe(true);
    expect(roster).toContain("<h1>Elenco iscritti gare</h1>");
    expect(roster).toContain("<td>&lt;Rossi&gt;</td>");

    const workout = buildWorkoutPrintHtml({ title: "Soglia", description: "", sessionDate: "2026-10-29", plan: null });
    expect(workout).toContain("<h1>Soglia</h1>");
    expect(workout).toContain("Nessun blocco disponibile.");
  });

  it("openPrintTab dice false quando il browser blocca la nuova scheda", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    URL.createObjectURL ??= () => "blob:test";
    URL.revokeObjectURL ??= () => {};
    expect(openPrintTab("<!doctype html><html><body></body></html>")).toBe(false);
  });
});
