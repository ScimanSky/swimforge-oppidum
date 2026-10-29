import { describe, expect, it } from "vitest";
import { authErrorMessage, isPlausibleEmail } from "./auth-errors";

describe("authErrorMessage", () => {
  it("un codice noto ha il suo messaggio in italiano", () => {
    expect(authErrorMessage({ code: "invalid_credentials", message: "Invalid login credentials" }, "x")).toBe(
      "Email o password non corretti."
    );
    expect(authErrorMessage({ code: "over_email_send_rate_limit" }, "x")).toBe(
      "Troppe email inviate: riprova tra qualche minuto."
    );
  });

  it("senza codice riconosce i vecchi messaggi inglesi", () => {
    expect(authErrorMessage(new Error("Email not confirmed"), "x")).toBe(
      "Conferma prima l'email: apri il link che ti abbiamo inviato."
    );
  });

  it("il resto non mostra mai l'inglese: usa il messaggio di riserva", () => {
    expect(authErrorMessage({ code: "unexpected_failure", message: "Database error" }, "Accesso non riuscito.")).toBe(
      "Accesso non riuscito."
    );
    expect(authErrorMessage(null, "Accesso non riuscito.")).toBe("Accesso non riuscito.");
  });
});

describe("isPlausibleEmail", () => {
  it("accetta nome@dominio.it e rifiuta il resto", () => {
    expect(isPlausibleEmail(" ada@swimforge.it ")).toBe(true);
    expect(isPlausibleEmail("ada@swimforge")).toBe(false);
    expect(isPlausibleEmail("ada swimforge.it")).toBe(false);
    expect(isPlausibleEmail("")).toBe(false);
  });
});
