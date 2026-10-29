import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Progress } from "./progress";

describe("Progress", () => {
  afterEach(cleanup);

  it("annuncia il valore, limitato fra 0 e 100", () => {
    render(
      <>
        <Progress value={42.5} aria-label="Metà" />
        <Progress value={130} aria-label="Oltre" />
        <Progress value={-5} aria-label="Sotto" />
        <Progress value={null} aria-label="Senza valore" />
      </>
    );
    const valueOf = (name: string) => screen.getByRole("progressbar", { name }).getAttribute("aria-valuenow");
    expect(valueOf("Metà")).toBe("42.5");
    expect(valueOf("Oltre")).toBe("100");
    expect(valueOf("Sotto")).toBe("0");
    expect(valueOf("Senza valore")).toBe("0");
  });
});
