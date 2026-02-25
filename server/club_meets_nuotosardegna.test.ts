import { describe, expect, it } from "vitest";
import {
  extractArticleTitle,
  extractCategoryLinks,
  extractDateCandidates,
  extractFutureDateFromArticle,
  parseItalianDate,
} from "./club_meets_nuotosardegna";

describe("club_meets_nuotosardegna parser", () => {
  it("parses italian dates in slash and words format", () => {
    const slash = parseItalianDate("15/03/2026");
    const words = parseItalianDate("16 marzo 2026");

    expect(slash?.toISOString()).toContain("2026-03-15");
    expect(words?.toISOString()).toContain("2026-03-16");
  });

  it("extracts date candidates including date ranges", () => {
    const text = "Meeting Master 15-16 marzo 2026 e finale 22/03/2026";
    const dates = extractDateCandidates(text).map((item) => item.toISOString().slice(0, 10));

    expect(dates).toContain("2026-03-15");
    expect(dates).toContain("2026-03-22");
  });

  it("extracts article links from category html with dedupe", () => {
    const html = `
      <a href="https://www.nuotosardegna.it/category/comunicati-master/">Categoria</a>
      <a href="/2026/02/25/meeting-master-cagliari/">Meeting</a>
      <a href="/2026/02/25/meeting-master-cagliari/">Meeting duplicate</a>
      <a href="javascript:void(0)">ignore</a>
      <a href="/media/banner.jpg">image</a>
    `;

    const links = extractCategoryLinks(html, "https://www.nuotosardegna.it/category/comunicati-master/");

    expect(links).toHaveLength(1);
    expect(links[0]).toBe("https://www.nuotosardegna.it/2026/02/25/meeting-master-cagliari/");
  });

  it("extracts article title and selects first future date", () => {
    const html = `
      <html>
        <head><title>Convocazione Master</title></head>
        <body>
          <h1>Comunicato Master Regionale</h1>
          <p>La gara è prevista il 05/03/2026 con apertura iscrizioni.</p>
          <p>Seconda data di riferimento 12/03/2026.</p>
        </body>
      </html>
    `;

    const title = extractArticleTitle(html);
    const date = extractFutureDateFromArticle(html, title, new Date("2026-03-01T09:00:00.000Z"));

    expect(title).toContain("Comunicato Master Regionale");
    expect(date?.toISOString().slice(0, 10)).toBe("2026-03-05");
  });
});
