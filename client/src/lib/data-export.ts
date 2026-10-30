import { apiUrl } from "./api-base";
import { authenticatedApiInit } from "./api-auth";
import { isNativePlatform } from "./platform";

/** The streamed JSON export of the caller's data (server/routes/account_export.ts). */
export const DATA_EXPORT_PATH = "/api/account/export";

const EXPORT_FAILED = "Impossibile esportare i dati.";

/**
 * The Android WebView does not save a blob through <a download> (and @capacitor/filesystem is not
 * part of the app): there the export is downloaded from the website.
 */
export const NATIVE_DATA_EXPORT_MESSAGE =
  "Scarica i tuoi dati dal sito swimforge.it: accedi da un browser e apri Impostazioni → Privacy → Esporta i dati."

/** False in the Android app, where the file cannot be saved (see NATIVE_DATA_EXPORT_MESSAGE). */
export function canDownloadDataExportHere(): boolean {
  return !isNativePlatform();
}

/** «swimforge-dati-2026-10-29.json». */
export function dataExportFileName(now: Date = new Date()): string {
  return `swimforge-dati-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Downloads the export as a file. The server streams it (it can hold thousands of laps), so the
 * app only keeps the file, never a parsed copy. Throws with the server's Italian message.
 */
export async function downloadDataExport(fetchImpl: typeof fetch = fetch): Promise<void> {
  // Never a fake «completata» in the app: nothing would be saved.
  if (!canDownloadDataExportHere()) throw new Error(NATIVE_DATA_EXPORT_MESSAGE);
  const response = await fetchImpl(apiUrl(DATA_EXPORT_PATH), authenticatedApiInit({ method: "GET" }));
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    throw new Error(typeof body?.error === "string" && body.error ? body.error : EXPORT_FAILED);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = dataExportFileName();
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
