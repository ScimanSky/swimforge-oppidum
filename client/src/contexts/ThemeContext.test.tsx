import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeContext";

const mocks = vi.hoisted(() => ({ syncNativeStatusBar: vi.fn() }));
vi.mock("@/lib/native-runtime", () => ({ syncNativeStatusBar: mocks.syncNativeStatusBar }));

let api: ReturnType<typeof useTheme> | null = null;
function Probe() {
  api = useTheme();
  return <button onClick={() => api?.toggleTheme?.()}>tema {api.theme}</button>;
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    mocks.syncNativeStatusBar.mockClear();
    api = null;
  });
  afterEach(cleanup);

  it("applica il tema salvato e allinea la barra di stato", () => {
    localStorage.setItem("theme", "light");
    render(
      <ThemeProvider defaultTheme="dark" switchable>
        <Probe />
      </ThemeProvider>
    );
    expect(document.documentElement).not.toHaveClass("dark");
    expect(mocks.syncNativeStatusBar).toHaveBeenLastCalledWith("light");
  });

  it("setTheme sceglie il tema, lo salva e aggiorna la barra di stato", () => {
    render(
      <ThemeProvider defaultTheme="dark" switchable>
        <Probe />
      </ThemeProvider>
    );
    expect(document.documentElement).toHaveClass("dark");
    expect(mocks.syncNativeStatusBar).toHaveBeenLastCalledWith("dark");

    act(() => api?.setTheme?.("light"));
    expect(screen.getByRole("button")).toHaveTextContent("tema light");
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem("theme")).toBe("light");
    expect(mocks.syncNativeStatusBar).toHaveBeenLastCalledWith("light");
  });

  it("toggleTheme resta disponibile", async () => {
    render(
      <ThemeProvider defaultTheme="dark" switchable>
        <Probe />
      </ThemeProvider>
    );
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("tema light");
    expect(mocks.syncNativeStatusBar).toHaveBeenLastCalledWith("light");
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
