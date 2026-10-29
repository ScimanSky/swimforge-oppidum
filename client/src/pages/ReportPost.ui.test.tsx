import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ReportPost from "./ReportPost";

const state = vi.hoisted(() => ({
  reports: [] as unknown[],
  failure: null as unknown,
  previous: null as string | null,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    community: {
      reportPost: {
        useMutation: (options?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => ({
          mutate: (vars: unknown) => {
            state.reports.push(vars);
            if (state.failure) options?.onError?.(state.failure);
            else options?.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
  },
}));
vi.mock("@/lib/in-app-history", () => ({ previousInAppPath: () => state.previous }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/AppLayout", () => ({ default: ({ children }: any) => <div>{children}</div> }));

const trpcError = (code: string, message: string) => Object.assign(new Error(message), { data: { code } });

function renderReport(path = "/home/report/post/12?from=%2Fpost%2F12") {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <Route path="/home/report/post/:postId" component={ReportPost} />
    </Router>
  );
  return location;
}

describe("ReportPost (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.reports = [];
    state.failure = null;
    state.previous = null;
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("a form with an h2, the reasons as radios (Spam first) and labelled details", () => {
    renderReport();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("form", { name: "Segnala il post" })).toBeInTheDocument();
    const reasons = screen.getByRole("group", { name: "Motivo" });
    expect(reasons).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Spam/ })).toBeChecked();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByRole("textbox", { name: "Dettagli (facoltativi)" })).toBeInTheDocument();
  });

  it("sends the report and goes back to the page it came from, replacing the form", async () => {
    const location = renderReport();
    await userEvent.click(screen.getByRole("radio", { name: /^Molestie/ }));
    await userEvent.type(screen.getByRole("textbox", { name: "Dettagli (facoltativi)" }), "  Insulti nei commenti  ");
    await userEvent.click(screen.getByRole("button", { name: "Invia segnalazione" }));
    expect(state.reports).toEqual([{ postId: 12, reason: "harassment", details: "Insulti nei commenti" }]);
    expect(toast.success).toHaveBeenCalledWith("Segnalazione inviata. Grazie.");
    expect(toast.error).not.toHaveBeenCalled();
    expect(location.history).toEqual(["/post/12"]);
  });

  it("«Altro» needs ten characters of details before it can be sent", async () => {
    renderReport();
    await userEvent.click(screen.getByRole("radio", { name: /^Altro/ }));
    const details = screen.getByRole("textbox", { name: "Dettagli" });
    expect(details).toHaveAccessibleDescription("Per «Altro» servono almeno 10 caratteri.");
    expect(screen.getByRole("button", { name: "Invia segnalazione" })).toBeDisabled();
    await userEvent.type(details, "Pubblicità di un negozio");
    expect(screen.getByRole("button", { name: "Invia segnalazione" })).toBeEnabled();
  });

  it("«Annulla» goes back in history when the previous entry is the page it came from", async () => {
    state.previous = "/post/12";
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    renderReport();
    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(back).toHaveBeenCalled();
    back.mockRestore();
  });

  it.each([
    ["%2F%2Fevil.example"],
    ["%2F%5Cevil.example"],
    ["%2F%255Cevil.example"],
    ["https%3A%2F%2Fevil.example%2Fpost%2F12"],
  ])("an external ?from=%s never leaves the app: «Annulla» goes back to the feed", async (from) => {
    const location = renderReport(`/home/report/post/12?from=${from}`);
    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(location.history).toEqual(["/home"]);
  });

  it("errors: the server's Italian validation message, else an Italian fallback (never English)", async () => {
    state.failure = trpcError("BAD_REQUEST", "Per 'Altro' inserisci almeno 10 caratteri di dettaglio.");
    renderReport();
    await userEvent.click(screen.getByRole("button", { name: "Invia segnalazione" }));
    expect(toast.error).toHaveBeenLastCalledWith("Per 'Altro' inserisci almeno 10 caratteri di dettaglio.");

    state.failure = trpcError("INTERNAL_SERVER_ERROR", "Cannot report your own post");
    await userEvent.click(screen.getByRole("button", { name: "Invia segnalazione" }));
    expect(toast.error).toHaveBeenLastCalledWith("Impossibile inviare la segnalazione");
  });

  it("an invalid id: «Post non trovato.» with a way back", () => {
    renderReport("/home/report/post/abc");
    expect(screen.getByText("Post non trovato.")).toBeInTheDocument();
    expect(screen.queryByRole("form")).toBeNull();
  });
});
