import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { Spinner } from "./spinner";

afterEach(cleanup);

describe("etichette accessibili dei primitivi in italiano", () => {
  it("lo spinner si annuncia come «Caricamento»", () => {
    render(<Spinner />);
    expect(screen.getByRole("status", { name: "Caricamento" })).toBeTruthy();
  });

  it("il dialogo ha il pulsante «Chiudi»", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Titolo</DialogTitle>
          <DialogDescription>Testo</DialogDescription>
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByRole("button", { name: "Chiudi" })).toBeTruthy();
  });
});
