function normalizeTimeInput(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

export function parseSwimTimeToCentiseconds(raw: unknown): number | null {
  const value = normalizeTimeInput(raw);
  if (!value || value === "-" || /^n\/?d$/i.test(value) || /^n\.?a\.?$/i.test(value)) return null;
  if (/nota|dns|dnf|dq|squal/i.test(value)) return null;

  const minuteQuote = value.match(/^(\d+)'(\d{1,2})"(\d{1,2})$/);
  if (minuteQuote) {
    const minutes = Number(minuteQuote[1]);
    const seconds = Number(minuteQuote[2]);
    const cs = Number(minuteQuote[3].padEnd(2, "0"));
    if (Number.isFinite(minutes) && Number.isFinite(seconds) && Number.isFinite(cs)) {
      return (minutes * 60 + seconds) * 100 + cs;
    }
  }

  const minuteDoubleQuoteTypo = value.match(/^(\d+)'(\d{1,2})'(\d{1,2})$/);
  if (minuteDoubleQuoteTypo) {
    const minutes = Number(minuteDoubleQuoteTypo[1]);
    const seconds = Number(minuteDoubleQuoteTypo[2]);
    const cs = Number(minuteDoubleQuoteTypo[3].padEnd(2, "0"));
    if (Number.isFinite(minutes) && Number.isFinite(seconds) && Number.isFinite(cs)) {
      return (minutes * 60 + seconds) * 100 + cs;
    }
  }

  const secondsQuote = value.match(/^(\d{1,3})"(\d{1,2})$/);
  if (secondsQuote) {
    const seconds = Number(secondsQuote[1]);
    const cs = Number(secondsQuote[2].padEnd(2, "0"));
    if (Number.isFinite(seconds) && Number.isFinite(cs)) {
      return seconds * 100 + cs;
    }
  }

  const colon = value.match(/^(\d+):([0-5]?\d)(?:\.(\d{1,2}))?$/);
  if (colon) {
    const minutes = Number(colon[1]);
    const seconds = Number(colon[2]);
    const cs = Number((colon[3] ?? "0").padEnd(2, "0"));
    if (Number.isFinite(minutes) && Number.isFinite(seconds) && Number.isFinite(cs)) {
      return (minutes * 60 + seconds) * 100 + cs;
    }
  }

  const dot = value.match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
  if (dot) {
    const seconds = Number(dot[1]);
    const cs = Number((dot[2] ?? "0").padEnd(2, "0"));
    if (Number.isFinite(seconds) && Number.isFinite(cs)) {
      return seconds * 100 + cs;
    }
  }

  return null;
}

export function getSessionTimeCs(finalTimeCs: unknown, finalTimeRaw: unknown): number | null {
  const numeric = Number(finalTimeCs);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return parseSwimTimeToCentiseconds(finalTimeRaw);
}

export function formatSwimCentiseconds(value: unknown): string {
  const cs = Number(value);
  if (!Number.isFinite(cs) || cs <= 0) return "--";

  const totalCs = Math.round(cs);
  const totalSeconds = Math.floor(totalCs / 100);
  const centiseconds = totalCs % 100;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
  }
  return `${seconds}.${String(centiseconds).padStart(2, "0")}`;
}
