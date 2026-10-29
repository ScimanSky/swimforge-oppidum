import { describe, expect, it } from "vitest";
import { CSRF_ERR_MSG, NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { errorToastMessage } from "./trpc-errors";

describe("errorToastMessage", () => {
  it("keeps the server's own message", () => {
    const error = { message: "Hai già creato un evento oggi.", data: { code: "PRECONDITION_FAILED" } };
    expect(errorToastMessage(error, "Evento non creato")).toBe("Hai già creato un evento oggi.");
  });

  it("FORBIDDEN and UNAUTHORIZED never show the bare code or «Forbidden»", () => {
    for (const code of ["FORBIDDEN", "UNAUTHORIZED"]) {
      expect(errorToastMessage({ message: code, data: { code } }, "Eliminazione non riuscita")).toBe(
        "Eliminazione non riuscita"
      );
      expect(errorToastMessage({ message: "Forbidden", data: { code } }, "Risposta non salvata")).toBe(
        "Risposta non salvata"
      );
    }
  });

  it("FORBIDDEN keeps the server's own reason (Italian), not the English admin and CSRF checks", () => {
    const club = { message: "Devi iscriverti al club per visualizzare i contenuti.", data: { code: "FORBIDDEN" } };
    expect(errorToastMessage(club, "Questo post non è visibile per te.")).toBe(
      "Devi iscriverti al club per visualizzare i contenuti."
    );
    for (const message of [NOT_ADMIN_ERR_MSG, CSRF_ERR_MSG]) {
      expect(errorToastMessage({ message, data: { code: "FORBIDDEN" } }, "Non consentito")).toBe("Non consentito");
    }
  });

  it("UNAUTHORIZED always gets the fallback: its messages are the session's, in English", () => {
    for (const message of [UNAUTHED_ERR_MSG, "Invalid credentials"]) {
      expect(errorToastMessage({ message, data: { code: "UNAUTHORIZED" } }, "Accedi di nuovo")).toBe("Accedi di nuovo");
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
