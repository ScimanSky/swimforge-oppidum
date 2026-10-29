import { describe, expect, it } from "vitest";
import { errorToastMessage } from "./trpc-errors";

describe("errorToastMessage", () => {
  it("keeps the server's own message", () => {
    const error = { message: "Hai già creato un evento oggi.", data: { code: "PRECONDITION_FAILED" } };
    expect(errorToastMessage(error, "Evento non creato")).toBe("Hai già creato un evento oggi.");
  });

  it("FORBIDDEN and UNAUTHORIZED never show the code, whatever the message", () => {
    for (const code of ["FORBIDDEN", "UNAUTHORIZED"]) {
      expect(errorToastMessage({ message: code, data: { code } }, "Eliminazione non riuscita")).toBe(
        "Eliminazione non riuscita"
      );
      expect(errorToastMessage({ message: "Forbidden", data: { code } }, "Risposta non salvata")).toBe(
        "Risposta non salvata"
      );
    }
  });

  it("a bare code, an empty message or the db layer's «Forbidden» get the fallback", () => {
    expect(errorToastMessage({ message: "NOT_FOUND", data: { code: "NOT_FOUND" } }, "Non trovato")).toBe("Non trovato");
    expect(errorToastMessage({ message: "  ", data: null }, "Non riuscito")).toBe("Non riuscito");
    expect(errorToastMessage({ message: "Forbidden", data: { code: "INTERNAL_SERVER_ERROR" } }, "Non riuscito")).toBe(
      "Non riuscito"
    );
    expect(errorToastMessage(undefined, "Non riuscito")).toBe("Non riuscito");
  });

  it("a plain Error keeps its message", () => {
    expect(errorToastMessage(new Error("Formato non supportato"), "Non riuscito")).toBe("Formato non supportato");
  });
});
