import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from "./dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./sheet";

afterEach(cleanup);

const overlay = (slot: string) => document.querySelector(`[data-slot="${slot}"]`);

describe("velo di dialoghi e fogli", () => {
  it("il dialogo usa il token del velo, non un nero fisso", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Titolo</DialogTitle>
          <DialogDescription>Testo</DialogDescription>
        </DialogContent>
      </Dialog>
    );
    expect(overlay("dialog-overlay")?.className).toMatch(/(?:^|\s)bg-overlay(?:\s|$)/);
    expect(overlay("dialog-overlay")?.className).not.toMatch(/bg-black/);
  });

  it("il foglio usa il token del velo, non un nero fisso", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Titolo</SheetTitle>
          <SheetDescription>Testo</SheetDescription>
        </SheetContent>
      </Sheet>
    );
    expect(overlay("sheet-overlay")?.className).toMatch(/(?:^|\s)bg-overlay(?:\s|$)/);
    expect(overlay("sheet-overlay")?.className).not.toMatch(/bg-black/);
  });

  it("uno sfondo passato dal chiamante sostituisce il velo (es. il tour)", () => {
    render(
      <Dialog open>
        <DialogPortal>
          <DialogOverlay className="bg-transparent" />
        </DialogPortal>
      </Dialog>
    );
    const classes = overlay("dialog-overlay")?.className ?? "";
    expect(classes).toMatch(/\bbg-transparent\b/);
    expect(classes).not.toMatch(/(?:^|\s)bg-overlay(?:\s|$)/);
  });
});
