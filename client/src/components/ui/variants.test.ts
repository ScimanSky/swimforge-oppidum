import { afterEach, describe, expect, it } from "vitest";
import { buttonVariants } from "./button";
import { badgeVariants } from "./badge";
import { Input } from "./input";
import { Select, SelectTrigger, SelectValue } from "./select";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";

const BANNED = [/shadow-\[0_0/, /\buppercase\b/, /tracking-widest/, /linear-gradient/, /neon-(?:glow|soft)/, /-translate-y-/];

const buttonVariantNames = ["default", "destructive", "outline", "secondary", "ghost", "link"] as const;
const badgeVariantNames = ["default", "secondary", "destructive", "outline", "rank-gold", "rank-silver", "rank-bronze"] as const;

describe("Corsia variants", () => {
  afterEach(() => {
    cleanup();
  });
  it.each(buttonVariantNames)("button %s è piatto", (variant) => {
    const classes = buttonVariants({ variant });
    for (const pattern of BANNED) expect(classes).not.toMatch(pattern);
  });
  it("i bottoni hanno almeno 44px di altezza di default", () => {
    expect(buttonVariants({})).toMatch(/\bh-11\b/);
  });
  it("le varianti legacy neon non esistono più", () => {
    // An unknown variant adds no variant classes: only the base and the size remain.
    const bare = buttonVariants({ variant: null });
    for (const legacy of ["neon", "outline-neon", "ghost-neon"]) {
      expect(buttonVariants({ variant: legacy as never }), legacy).toBe(bare);
    }
    expect(badgeVariants({ variant: "neon" as never })).toBe(badgeVariants({ variant: null }));
  });
  it("destructive usa il testo dedicato (contrasto testato sui token)", () => {
    expect(buttonVariants({ variant: "destructive" })).toMatch(/\btext-destructive-foreground\b/);
    expect(badgeVariants({ variant: "destructive" })).toMatch(/\btext-destructive-foreground\b/);
  });
  it("l'input è alto 44px come il bottone", () => {
    render(createElement(Input, { "aria-label": "campo" }));
    expect(screen.getByLabelText("campo").className).toMatch(/\bh-11\b/);
  });
  it("il select è alto 44px come input e bottone (sm 40px), superficie a token in entrambi i temi", () => {
    const trigger = (size?: "sm" | "default") =>
      render(
        createElement(
          Select,
          null,
          createElement(SelectTrigger, { "aria-label": `ordina-${size ?? "default"}`, size }, createElement(SelectValue))
        )
      );
    trigger();
    trigger("sm");
    const regular = screen.getByLabelText("ordina-default").className;
    const small = screen.getByLabelText("ordina-sm").className;
    expect(regular).toMatch(/data-\[size=default\]:h-11\b/);
    expect(small).toMatch(/data-\[size=sm\]:h-10\b/);
    expect(regular).toMatch(/\bbg-card\b/);
    expect(regular).toMatch(/\bhover:bg-raised\b/);
    expect(regular).toMatch(/\brounded-xl\b/);
    expect(regular).not.toMatch(/dark:bg-input|dark:hover:bg-input|\bshadow-xs\b|\bh-9\b|\bh-8\b|\brounded-md\b/);
  });
  it.each(badgeVariantNames)("badge %s è piatto", (variant) => {
    const classes = badgeVariants({ variant });
    for (const pattern of BANNED) expect(classes).not.toMatch(pattern);
    expect(classes).not.toMatch(/text-\[0\.6\d*rem\]/);
  });
});
