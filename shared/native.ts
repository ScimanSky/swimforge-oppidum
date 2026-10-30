export const NATIVE_CLIENT_HEADER = "x-swimforge-client";
export const NATIVE_CLIENT_VALUE = "native";

/**
 * The Android WebView does not save a blob through <a download> (and @capacitor/filesystem is not
 * part of the app): there the data export is downloaded from the website. Shown by the app and
 * sent by the server to the older app builds that still ask for the export in memory.
 */
export const NATIVE_DATA_EXPORT_MESSAGE =
  "Scarica i tuoi dati dal sito swimforge.it: accedi da un browser e apri Impostazioni → Privacy → Esporta i dati.";
