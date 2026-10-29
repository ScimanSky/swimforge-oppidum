import { describe, expect, it } from "vitest";
import { insightChip } from "./coach-insights";

describe("insightChip", () => {
  it.each([
    ["Il passo è migliorato del **4.5%**", "4,5 %"],
    ["in B1–B2 il 40% del volume", "40 %"],
    ["volume +12% sulle 4 settimane precedenti", "+12 %"],
    ["calo nel finale −3,5 % rispetto alla tua base", "−3,5 %"],
    ["il tuo equilibrio è −7,8: stai caricando", "−7,8"],
  ])("«%s» → %s", (text, chip) => {
    expect(insightChip(text)).toBe(chip);
  });

  it.each([
    "Lavora in B1–B2 con calma",
    "il tuo passo 1:49 tiene bene",
    "una nuotata con un tratto continuo lungo (800 m o più) la renderebbe più solida",
    "fai 2-3 nuotate a settimana",
    "Aggiungi una nuotata",
  ])("no chip: «%s»", (text) => {
    expect(insightChip(text)).toBeNull();
  });
});
