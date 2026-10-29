/**
 * The number of a Coach page insight shown as a chip next to its title: a percentage («40 %»,
 * «+4,5 %») or a signed change («−7,8»). Never a digit glued to letters or to «:» (the 1 of «B1»,
 * a pace «1:49») and never a plain number («800 m»): those are not the point of the advice.
 */

/** A percentage, the sign optional: «40%», «4.5 %», «+12%» (not after a letter, «:» or a digit). */
const PERCENT = /(?<![A-Za-zÀ-ÖØ-öø-ÿ:\d.,])([+−-]?\d+(?:[.,]\d+)?)\s*%/;
/** A signed change on its own: «−7,8», «+3» (not a time «−1:30», not glued to a word). */
const SIGNED = /(?<![A-Za-zÀ-ÖØ-öø-ÿ:\d.,])([+−-]\d+(?:[.,]\d+)?)(?![.,]?\d|:\d|%|[A-Za-zÀ-ÖØ-öø-ÿ])/;

const numberFormat = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

/** «40 %», «+4,5 %», «−7,8», or null when the insight has no such number. */
export function insightChip(text: string): string | null {
  const clean = text.replace(/\*\*/g, "");
  const percent = clean.match(PERCENT);
  const raw = (percent ?? clean.match(SIGNED))?.[1];
  if (!raw) return null;
  const value = Number(raw.replace(/^[+−-]/, "").replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const sign = raw.startsWith("+") ? "+" : /^[−-]/.test(raw) ? "−" : "";
  return `${sign}${numberFormat.format(value)}${percent ? " %" : ""}`;
}
