import { afterEach, describe, expect, it, vi } from "vitest";
import { DATA_EXPORT_PATH, NATIVE_DATA_EXPORT_MESSAGE, dataExportFileName, downloadDataExport } from "./data-export";

describe("data export download", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { Capacitor?: unknown }).Capacitor;
  });

  it("on the Android app claims nothing: no download (the WebView cannot save it), the site instead", async () => {
    (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    const fetchImpl = vi.fn();
    await expect(downloadDataExport(fetchImpl as unknown as typeof fetch)).rejects.toThrow(NATIVE_DATA_EXPORT_MESSAGE);
    expect(NATIVE_DATA_EXPORT_MESSAGE).toContain("Scarica i tuoi dati dal sito swimforge.it");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("names the file with the day", () => {
    expect(dataExportFileName(new Date("2026-10-29T21:00:00Z"))).toBe("swimforge-dati-2026-10-29.json");
  });

  it("downloads the streamed export with the session and saves it as a file", async () => {
    const createObjectURL = vi.fn(() => "blob:export");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response('{"version":2}', { status: 200 }));

    await downloadDataExport(fetchImpl as unknown as typeof fetch);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(DATA_EXPORT_PATH);
    expect(init).toMatchObject({ method: "GET", credentials: "include" });
    expect(click).toHaveBeenCalledTimes(1);
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
    expect(await blob.text()).toBe('{"version":2}');
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:export");
  });

  it("throws the server's Italian message", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Troppe esportazioni. Riprova tra un'ora." }), { status: 429 }),
    );
    await expect(downloadDataExport(fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      "Troppe esportazioni. Riprova tra un'ora.",
    );
  });

  it("falls back to a generic message", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad gateway", { status: 502 }));
    await expect(downloadDataExport(fetchImpl as unknown as typeof fetch)).rejects.toThrow("Impossibile esportare i dati.");
  });
});
