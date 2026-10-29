import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("../middleware/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { DB_UNAVAILABLE_ERR_MSG } from "@shared/const";
import { AppError, handleError, UNEXPECTED_ERR_MSG } from "./errors";

describe("handleError: what an unhandled error tells the user", () => {
  it("the database being down: the Italian message, still INTERNAL_SERVER_ERROR", () => {
    expect(handleError(new Error(DB_UNAVAILABLE_ERR_MSG))).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Servizio momentaneamente non disponibile, riprova tra poco.",
    });
  });

  it("any other error: a generic Italian message, never its own text", () => {
    const error = handleError(new Error('relation "users" does not exist'));
    expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: UNEXPECTED_ERR_MSG });
    expect(UNEXPECTED_ERR_MSG).toBe("Si è verificato un errore imprevisto, riprova tra poco.");
  });

  it("tRPC and app errors keep their code and message", () => {
    const trpcError = new TRPCError({ code: "NOT_FOUND", message: "Profilo non trovato" });
    expect(handleError(trpcError)).toBe(trpcError);
    expect(handleError(new AppError("Troppe richieste", "TOO_MANY_REQUESTS"))).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "Troppe richieste",
    });
  });
});
