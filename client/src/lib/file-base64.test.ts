import { afterEach, describe, expect, it, vi } from "vitest";
import { fileToBase64 } from "./file-base64";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fileToBase64", () => {
  it("uses arrayBuffer path when available", async () => {
    const file = new File(["AB"], "photo.jpg", { type: "image/jpeg" });
    const result = await fileToBase64(file);
    expect(result).toBe("QUI=");
  });

  it("falls back to FileReader when arrayBuffer fails", async () => {
    const file = new File(["fallback"], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "arrayBuffer", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error("arrayBuffer not available")),
    });

    class MockFileReader {
      public result: string | ArrayBuffer | null = null;
      public onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null = null;
      public onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null = null;

      readAsDataURL() {
        this.result = "data:image/jpeg;base64,ZmFsbGJhY2s=";
        this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
      }
    }

    vi.stubGlobal("FileReader", MockFileReader as unknown as typeof FileReader);

    const result = await fileToBase64(file);
    expect(result).toBe("ZmFsbGJhY2s=");
  });

  it("throws readable error when fallback cannot produce a string", async () => {
    const file = new File(["err"], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "arrayBuffer", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error("arrayBuffer not available")),
    });

    class MockFileReaderInvalid {
      public result: string | ArrayBuffer | null = null;
      public onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null = null;
      public onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null = null;

      readAsDataURL() {
        this.result = new ArrayBuffer(8);
        this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
      }
    }

    vi.stubGlobal("FileReader", MockFileReaderInvalid as unknown as typeof FileReader);

    await expect(fileToBase64(file)).rejects.toThrow("Impossibile leggere il file");
  });
});
