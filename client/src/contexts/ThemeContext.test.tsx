import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeContext";

const mocks = vi.hoisted(() => ({ syncNativeSystemBars: vi.fn() }));
vi.mock("@/lib/native-runtime", () => ({ syncNativeSystemBars: mocks.syncNativeSystemBars }));

let api: ReturnType<typeof useTheme> | null = null;
function Probe() {
  api = useTheme();
  return <button onClick={() => api?.toggleTheme?.()}>tema {api.theme}</button>;
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    mocks.syncNativeSystemBars.mockClear();
    api = null;
  });
  afterEach(cleanup);

  it("applica il tema salvato e allinea le barre di sistema", () => {
    localStorage.setItem("theme", "light");
    render(
      <ThemeProvider defaultTheme="dark" switchable>
        <Probe />
      </ThemeProvider>
    );
    expect(document.documentElement).not.toHaveClass("dark");
    expect(mocks.syncNativeSystemBars).toHaveBeenLastCalledWith("light");
  });

  it("setTheme sceglie il tema, lo salva e aggiorna le barre di sistema", () => {
    render(
      <ThemeProvider defaultTheme="dark" switchable>
        <Probe />
      </ThemeProvider>
    );
    expect(document.documentElement).toHaveClass("dark");
    expect(mocks.syncNativeSystemBars).toHaveBeenLastCalledWith("dark");

    act(() => api?.setTheme?.("light"));
    expect(screen.getByRole("button")).toHaveTextContent("tema light");
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem("theme")).toBe("light");
    expect(mocks.syncNativeSystemBars).toHaveBeenLastCalledWith("light");
  });

  it("toggleTheme resta disponibile", async () => {
    render(
      <ThemeProvider defaultTheme="dark" switchable>
        <Probe />
      </ThemeProvider>
    );
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("tema light");
    expect(mocks.syncNativeSystemBars).toHaveBeenLastCalledWith("light");
  });

  it("senza switchable il tema è fisso", () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <Probe />
      </ThemeProvider>
    );
    expect(api?.setTheme).toBeUndefined();
    expect(api?.toggleTheme).toBeUndefined();
  });
});
