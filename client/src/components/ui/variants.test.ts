import { describe, expect, it } from "vitest";
import { buttonVariants } from "./button";
import { badgeVariants } from "./badge";
import { Input } from "./input";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";

const BANNED = [/shadow-\[0_0/, /\buppercase\b/, /tracking-widest/, /linear-gradient/, /neon-(?:glow|soft)/, /-translate-y-/];

const buttonVariantNames = ["default", "neon", "outline-neon", "ghost-neon", "destructive", "outline", "secondary", "ghost", "link"] as const;
const badgeVariantNames = ["default", "secondary", "destructive", "outline", "neon", "rank-gold", "rank-silver", "rank-bronze"] as const;

describe("Corsia variants", () => {
  it.each(buttonVariantNames)("button %s è piatto", (variant) => {
    const classes = buttonVariants({ variant });
    for (const pattern of BANNED) expect(classes).not.toMatch(pattern);
  });
  it("i bottoni hanno almeno 44px di altezza di default", () => {
    expect(buttonVariants({})).toMatch(/\bh-11\b/);
  });
  it("i nomi legacy coincidono con le varianti Corsia", () => {
    expect(buttonVariants({ variant: "neon" })).toBe(buttonVariants({ variant: "default" }));
    expect(buttonVariants({ variant: "outline-neon" })).toBe(buttonVariants({ variant: "outline" }));
  });
  it("destructive usa il testo dedicato (contrasto testato sui token)", () => {
    expect(buttonVariants({ variant: "destructive" })).toMatch(/\btext-destructive-foreground\b/);
    expect(badgeVariants({ variant: "destructive" })).toMatch(/\btext-destructive-foreground\b/);
  });
  it("l'input è alto 44px come il bottone", () => {
    render(createElement(Input, { "aria-label": "campo" }));
    expect(screen.getByLabelText("campo").className).toMatch(/\bh-11\b/);
  });
  it.each(badgeVariantNames)("badge %s è piatto", (variant) => {
    const classes = badgeVariants({ variant });
    for (const pattern of BANNED) expect(classes).not.toMatch(pattern);
    expect(classes).not.toMatch(/text-\[0\.6\d*rem\]/);
  });
});
