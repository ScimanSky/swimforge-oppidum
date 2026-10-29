/**
 * Print documents of the club pages (meet entries, meet roster, pool workout) and the way to print
 * them: a tab that prints itself, or a hidden iframe when the browser blocks the tab.
 *
 * Each builder returns a whole standalone HTML document with its own <h1>: it is printed on paper,
 * never shown inside the app shell (design-lint exempts this file from «titolo-pagina»).
 */

import type { ClubPoolWorkoutPlan } from "@shared/types";
import { getWorkoutSeriesDisplay } from "@/lib/workout-plan";

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** «29/10/2026, 10:47»; «-» for a missing or invalid date. */
export function formatPrintDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Centiseconds as «1:05.32»; «-» when not a number. */
export function formatTimeCs(value?: number | null) {
  if (!Number.isFinite(value ?? null)) return "-";
  const cs = Number(value);
  const minutes = Math.floor(cs / 6000);
  const seconds = Math.floor((cs % 6000) / 100);
  const centis = cs % 100;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

export function buildMeetEntriesPrintHtml({
  meet,
  events,
  groupedEntries,
}: {
  meet: any;
  events: any[];
  groupedEntries: Map<number, any[]>;
}) {
  const activeStatuses = new Set(["pending", "confirmed", "waitlist"]);
  const sections = events
    .map((event) => {
      const rows = (groupedEntries.get(Number(event.id)) ?? [])
        .filter((row: any) => activeStatuses.has(String(row?.entry?.status ?? "")))
        .sort((a: any, b: any) => {
          const aName = String(a?.user?.name || a?.user?.username || a?.user?.email || "").toLowerCase();
          const bName = String(b?.user?.name || b?.user?.username || b?.user?.email || "").toLowerCase();
          return aName.localeCompare(bName, "it");
        });

      if (rows.length === 0) return "";

      const body = rows
        .map((row: any, index: number) => {
          const athlete = row?.user?.name || row?.user?.username || row?.user?.email || "Atleta";
          const status = String(row?.entry?.status ?? "-");
          const seed = Number.isFinite(Number(row?.entry?.seedTimeCs))
            ? formatTimeCs(Number(row.entry.seedTimeCs))
            : "-";
          return `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(athlete)}</td>
              <td>${escapeHtml(status)}</td>
              <td>${escapeHtml(seed)}</td>
            </tr>
          `;
        })
        .join("");

      const eventMeta = `${event.distanceMeters ? `${event.distanceMeters}m` : "distanza n/d"} ${event.stroke ?? ""}`.trim();

      return `
        <section class="event-section">
          <h3>${escapeHtml(event.label)} <span class="meta">(${escapeHtml(eventMeta)})</span></h3>
          <p class="meta">Iscritti attivi: ${rows.length}</p>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Atleta</th>
                <th>Stato</th>
                <th>Seed time</th>
              </tr>
            </thead>
            <tbody>
              ${body}
            </tbody>
          </table>
        </section>
      `;
    })
    .filter(Boolean)
    .join("");

  return `
    <!doctype html>
    <html lang="it">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Lista iscritti - ${escapeHtml(meet?.name ?? "Meeting")}</title>
        <style>
          :root { color-scheme: light; }
          * { box-sizing: border-box; }
          body {
            margin: 20px;
            font-family: Arial, sans-serif;
            color: #0f172a;
            line-height: 1.35;
          }
          h1, h2, h3 { margin: 0; }
          .header { margin-bottom: 18px; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }
          .header h1 { font-size: 22px; margin-bottom: 4px; }
          .meta { color: #475569; font-size: 12px; }
          .event-section { margin-bottom: 18px; page-break-inside: avoid; }
          .event-section h3 { font-size: 16px; margin-bottom: 6px; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
          }
          th, td {
            border: 1px solid #cbd5e1;
            padding: 6px 8px;
            text-align: left;
            font-size: 12px;
          }
          th { background: #e2e8f0; font-weight: 700; }
          tbody tr:nth-child(even) { background: #f8fafc; }
          .footer {
            margin-top: 16px;
            border-top: 1px solid #e2e8f0;
            padding-top: 8px;
            font-size: 11px;
            color: #64748b;
          }
          @media print {
            body { margin: 12mm; }
            .event-section { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Lista iscritti gare</h1>
          <h2>${escapeHtml(meet?.name ?? "Meeting")}</h2>
          <p class="meta">${escapeHtml(meet?.venue ?? "Impianto n/d")} • ${escapeHtml(formatPrintDate(meet?.startDate))} - ${escapeHtml(formatPrintDate(meet?.endDate))}</p>
          <p class="meta">Generato il ${escapeHtml(formatPrintDate(new Date()))}</p>
        </div>
        ${sections || "<p>Nessun iscritto attivo da stampare.</p>"}
        <div class="footer">SwimForge Club Suite</div>
      </body>
    </html>
  `;
}

/** One active entry of a meet roster, ready to print (and to show in the coach area). */
export type MeetRosterRow = {
  entryId: number;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  eventLabel: string;
  stroke: string;
  distance: string;
  status: string;
  seedTime: string;
};

export function buildMeetRosterPrintHtml(meet: any, rows: MeetRosterRow[]) {
  const rowHtml = rows
    .map(
      (row, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(row.firstName)}</td>
          <td>${escapeHtml(row.lastName)}</td>
          <td>${escapeHtml(row.eventLabel)}</td>
          <td>${escapeHtml(row.stroke)}</td>
          <td>${escapeHtml(row.distance)}</td>
          <td>${escapeHtml(row.status)}</td>
          <td>${escapeHtml(row.seedTime)}</td>
          <td>${escapeHtml(row.email)}</td>
        </tr>
      `
    )
    .join("");

  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Iscritti gare - ${escapeHtml(String(meet?.name ?? "Meeting"))}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 12mm; color: #0f172a; }
      h1 { margin: 0 0 4px; font-size: 20px; }
      p { margin: 0 0 4px; color: #475569; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border: 1px solid #cbd5e1; padding: 6px 7px; text-align: left; font-size: 12px; }
      th { background: #e2e8f0; font-weight: 700; }
      tbody tr:nth-child(even) { background: #f8fafc; }
      @page { size: A4; margin: 12mm; }
    </style>
  </head>
  <body>
    <h1>Elenco iscritti gare</h1>
    <p>${escapeHtml(String(meet?.name ?? "Meeting"))}</p>
    <p>${escapeHtml(String(meet?.venue ?? "Impianto n/d"))} • ${escapeHtml(formatPrintDate(meet?.startDate))} - ${escapeHtml(formatPrintDate(meet?.endDate))}</p>
    <p>Generato il ${escapeHtml(formatPrintDate(new Date()))}</p>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Nome</th>
          <th>Cognome</th>
          <th>Gara</th>
          <th>Stile</th>
          <th>Distanza</th>
          <th>Stato</th>
          <th>Seed</th>
          <th>Email</th>
        </tr>
      </thead>
      <tbody>
        ${rowHtml || `<tr><td colspan="9">Nessun iscritto attivo.</td></tr>`}
      </tbody>
    </table>
  </body>
</html>`;
}

/** A pool workout on one A4 sheet: title, description, date, blocks with their series, coach notes. */
export function buildWorkoutPrintHtml({
  title,
  description,
  sessionDate,
  plan,
}: {
  title: string;
  description: string;
  sessionDate: string;
  plan: ClubPoolWorkoutPlan | null;
}) {
  const blocks = Array.isArray(plan?.blocks) ? plan.blocks : [];
  const notes = Array.isArray(plan?.coachNotes) ? plan.coachNotes : [];
  const blockHtml = blocks
    .map((block: any) => {
      const items = Array.isArray(block?.items) ? block.items : [];
      const itemsHtml = items
        .map((item: any) => {
          const label = String(item?.label ?? "").trim();
          if (!label) return "";
          const series = getWorkoutSeriesDisplay(item);
          const parts = [
            `Serie ${series.reps}`,
            `Distanza serie ${series.seriesDistance}`,
            `Ripartenza ${series.sendoff}`,
            series.betweenSetsRest ? `Recupero prima prossima serie ${series.betweenSetsRest}` : null,
            series.intensity ? `Intensità ${series.intensity}` : null,
            series.targetPace ? `Pace ${series.targetPace}` : null,
          ].filter(Boolean);
          return `<li><strong>${escapeHtml(label)}</strong>${parts.length ? ` — ${escapeHtml(parts.join(" • "))}` : ""}${
            series.notes ? `<br/><span>${escapeHtml(series.notes)}</span>` : ""
          }</li>`;
        })
        .filter((item: string) => item.length > 0)
        .join("");
      if (!itemsHtml) return "";
      return `<section><h3>${escapeHtml(String(block?.label ?? "Blocco"))}</h3><ul>${itemsHtml}</ul></section>`;
    })
    .filter((item: string) => item.length > 0)
    .join("");
  const notesHtml = notes.length
    ? `<section><h3>Note Coach</h3><ul>${notes.map((note: any) => `<li>${escapeHtml(String(note))}</li>`).join("")}</ul></section>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{size:A4;margin:12mm}html,body{margin:0;padding:0;color:#111;font-family:Arial,sans-serif;font-size:13px;line-height:1.35}.sheet{max-width:760px;margin:0 auto}h1,h2,h3{margin:0 0 6px}h1{font-size:20px}h3{font-size:14px}p{margin:0 0 8px}section{margin:10px 0;break-inside:avoid-page;page-break-inside:avoid}ul{margin:4px 0 0 18px;padding:0}li{margin:2px 0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><main class="sheet"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><p><strong>Data:</strong> ${escapeHtml(sessionDate)}</p>${blockHtml || "<p>Nessun blocco disponibile.</p>"}${notesHtml}</main></body></html>`;
}

function injectAutoPrintScript(html: string) {
  const script = `<script>(function(){const run=function(){setTimeout(function(){try{window.focus();window.print();}catch(_err){}},260);};if(document.readyState==="complete"){run();}else{window.addEventListener("load",run,{once:true});}window.addEventListener("afterprint",function(){setTimeout(function(){try{window.close();}catch(_err){}},120);});})();</script>`;
  return html.includes("</body>") ? html.replace("</body>", `${script}</body>`) : `${html}${script}`;
}

/** Opens the document in a new tab that prints itself and closes; false when the tab is blocked. */
export function openPrintTab(html: string) {
  try {
    const blob = new Blob([injectAutoPrintScript(html)], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const popup = window.open(url, "_blank");
    if (popup) {
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return true;
    }
    URL.revokeObjectURL(url);
    return false;
  } catch {
    return false;
  }
}

/**
 * Prints the document from a hidden iframe (when a new tab is not allowed, or for the workout
 * sheet); `onUnavailable` tells the user when the browser cannot print it.
 */
export function printInHiddenFrame(html: string, onUnavailable: () => void) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-9999px";
  iframe.style.top = "0";
  iframe.style.width = "794px";
  iframe.style.height = "1123px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDocument = frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    document.body.removeChild(iframe);
    onUnavailable();
    return;
  }

  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  iframe.onload = () => {
    frameWindow.onafterprint = cleanup;
    setTimeout(() => {
      try {
        frameWindow.focus();
        frameWindow.print();
      } catch {
        cleanup();
        onUnavailable();
      }
    }, 350);
  };

  try {
    iframe.srcdoc = html;
  } catch {
    try {
      frameDocument.open();
      frameDocument.write(html);
      frameDocument.close();
      frameWindow.onafterprint = cleanup;
      setTimeout(() => {
        try {
          frameWindow.focus();
          frameWindow.print();
        } catch {
          cleanup();
          onUnavailable();
        }
      }, 500);
    } catch {
      cleanup();
      onUnavailable();
    }
  }
}
