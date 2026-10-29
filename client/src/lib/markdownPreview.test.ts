import { describe, expect, it } from "vitest";
import { renderMarkdownPreview, splitMarkdownTitle } from "./markdownPreview";

describe("markdownPreview (documenti legali)", () => {
  it("separa il titolo «# …» dal resto del testo", () => {
    expect(splitMarkdownTitle("# Privacy Policy di SwimForge\n\n## Introduzione\n")).toEqual({
      title: "Privacy Policy di SwimForge",
      body: "\n## Introduzione\n",
    });
    expect(splitMarkdownTitle("## Senza titolo\n")).toEqual({ title: "", body: "## Senza titolo\n" });
  });

  it("titoli da h2 a h4, righe orizzontali e nessun «####» letterale", () => {
    const html = renderMarkdownPreview("## 1. Dati\n### 1.1 Garmin\n#### Garmin Connect\n---\n# Altro");
    expect(html).toBe(
      "<h2>1. Dati</h2><h3>1.1 Garmin</h3><h4>Garmin Connect</h4><hr /><h2>Altro</h2>"
    );
  });

  it("paragrafi, elenchi, grassetto e corsivo; le righe vuote non diventano <br>", () => {
    const html = renderMarkdownPreview("**Data**: 26 Gennaio 2026\n\n- uno\n- *due*\n\nFine");
    expect(html).toBe(
      "<p><strong>Data</strong>: 26 Gennaio 2026</p><ul><li>uno</li><li><em>due</em></li></ul><p>Fine</p>"
    );
  });

  it("`codice` in linea", () => {
    expect(renderMarkdownPreview("Usa `localStorage` per il `theme`")).toBe(
      "<p>Usa <code>localStorage</code> per il <code>theme</code></p>"
    );
  });

  it("l'HTML nel testo resta testo", () => {
    expect(renderMarkdownPreview("<script>x</script> & co")).toBe(
      "<p>&lt;script&gt;x&lt;/script&gt; &amp; co</p>"
    );
  });
});
