import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DateTimePickerField } from "./DateTimePickerField";

function Field({ initial = "", required = false }: { initial?: string; required?: boolean }) {
  const [value, setValue] = useState(initial);
  return <DateTimePickerField label="Inizio" required={required} value={value} onChange={setValue} />;
}

describe("DateTimePickerField", () => {
  afterEach(cleanup);

  it("the name is the label and the chosen date, not just «Inizio *»", () => {
    render(<Field initial="2026-10-30T10:47" required />);
    const trigger = screen.getByRole("button", { name: /^Inizio\b/ });
    expect(trigger).toHaveAccessibleName("Inizio ven 30/10/2026, 10:47");
    expect(trigger).toHaveAccessibleDescription("Obbligatorio");
    // The «*» is seen, never read.
    expect(screen.getByText("*", { exact: false }).getAttribute("aria-hidden")).toBe("true");
  });

  it("without a date it says what to do; optional fields have no description", () => {
    render(<Field />);
    const trigger = screen.getByRole("button", { name: /^Inizio\b/ });
    expect(trigger).toHaveAccessibleName("Inizio Seleziona data e ora");
    expect(trigger).not.toHaveAccessibleDescription();
  });

  it("a new time is announced with the name", async () => {
    render(<Field initial="2026-10-30T10:47" required />);
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: /^Inizio\b/ }));
    fireEvent.change(screen.getByLabelText("Ora"), { target: { value: "11:15" } });
    expect(screen.getByRole("button", { name: /^Inizio\b/, hidden: true })).toHaveAccessibleName(
      "Inizio ven 30/10/2026, 11:15"
    );
  });
});
