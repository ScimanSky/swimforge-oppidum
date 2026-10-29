import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import AdminReports from "./AdminReports";

const state = vi.hoisted(() => ({
  me: { id: 1, role: "admin" } as any,
  meLoading: false,
  reports: { items: [] as any[], total: 0 as unknown } as any,
  reportsError: null as unknown,
  reportsLoading: false,
  inputs: [] as unknown[],
  updates: [] as unknown[],
  updateError: null as unknown,
  refetch: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      me: {
        useQuery: () =>
          state.meLoading
            ? { data: undefined, isPending: true, isError: false, refetch: state.refetch }
            : { data: state.me, isPending: false, isError: false, refetch: state.refetch },
      },
    },
    admin: {
      listPostReports: {
        // Like TanStack Query: a disabled query has no data and stays pending.
        useQuery: (input: unknown, options?: { enabled?: boolean }) => {
          state.inputs.push({ input, enabled: options?.enabled });
          const base = { refetch: state.refetch };
          if (options?.enabled === false || state.reportsLoading) return { ...base, isPending: true, isError: false, isSuccess: false };
          if (state.reportsError) return { ...base, isPending: false, isError: true, isSuccess: false };
          return { ...base, data: state.reports, isPending: false, isError: false, isSuccess: true };
        },
      },
      updatePostReportStatus: {
        useMutation: (options?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => ({
          mutate: (vars: unknown) => {
            state.updates.push(vars);
            if (state.updateError) options?.onError?.(state.updateError);
            else options?.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
    useUtils: () => ({ admin: { listPostReports: { invalidate: vi.fn() } } }),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/AppLayout", () => ({ default: ({ children }: any) => <div>{children}</div> }));

const report = (overrides: Record<string, unknown> = {}) => ({
  id: 31,
  post_id: 12,
  reason: "harassment",
  status: "open",
  details: "Insulti nei commenti",
  post_content: "Testo del post",
  reporter_name: "Ada Rossi",
  reporter_user_id: 5,
  post_author_name: null,
  post_author_id: 9,
  admin_note: "Già visto",
  created_at: new Date(Date.now() - 2 * 3_600_000),
  ...overrides,
});

function renderPage() {
  const location = memoryLocation({ path: "/admin/reports", record: true });
  render(
    <Router hook={location.hook}>
      <AdminReports />
    </Router>
  );
}

describe("AdminReports (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.me = { id: 1, role: "admin" };
    state.meLoading = false;
    state.reports = { items: [report()], total: "1" };
    state.reportsError = null;
    state.reportsLoading = false;
    state.inputs = [];
    state.updates = [];
    state.updateError = null;
    state.refetch.mockClear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it("no h1: an h2 with the count, the open reports first, each with its facts and the reported post itself", () => {
    renderPage();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Segnalazioni dei post" })).toBeInTheDocument();
    expect(screen.getByText("1 segnalazione")).toBeInTheDocument();
    expect(state.inputs.at(-1)).toEqual({ input: { status: "open", limit: 50, offset: 0 }, enabled: true });
    expect(screen.getByRole("combobox", { name: "Stato" })).toHaveTextContent("Aperte");

    const item = screen.getByRole("article", { name: "Segnalazione n. 31" });
    expect(within(item).getByText("Aperta")).toBeInTheDocument();
    expect(within(item).getByText("2h fa")).toBeInTheDocument();
    const facts = within(item).getAllByRole("term").map((term) => `${term.textContent}: ${term.nextElementSibling?.textContent}`);
    expect(facts).toEqual([
      "Post: n. 12",
      "Motivo: Molestie",
      "Segnalata da: Ada Rossi",
      "Autore del post: Utente 9",
      "Dettagli: Insulti nei commenti",
      "Contenuto del post: Testo del post",
    ]);
    // The post page refuses a private or club post to the admin too: no link that dead-ends.
    expect(within(item).queryByRole("link")).toBeNull();
  });

  it("the reported post's photo or video is shown in the report", () => {
    state.reports = {
      items: [
        report({ post_media_url: "https://res.cloudinary.com/demo/image/upload/v1/foto.jpg" }),
        report({ id: 32, post_id: 13, post_content: null, post_media_url: "https://res.cloudinary.com/demo/video/upload/v1/clip.mp4" }),
      ],
      total: 2,
    };
    renderPage();
    const first = screen.getByRole("article", { name: "Segnalazione n. 31" });
    expect(within(first).getByRole("img", { name: "Foto del post n. 12" })).toHaveAttribute(
      "src",
      "https://res.cloudinary.com/demo/image/upload/v1/foto.jpg"
    );
    const second = screen.getByRole("article", { name: "Segnalazione n. 32" });
    expect(within(second).getByLabelText("Video del post n. 13")).toHaveAttribute(
      "src",
      "https://res.cloudinary.com/demo/video/upload/v1/clip.mp4"
    );
    expect(within(second).queryByText("Contenuto del post")).toBeNull();
  });

  it("a status button saves it with the note written; failures are Italian toasts", async () => {
    renderPage();
    const note = screen.getByRole("textbox", { name: "Nota dell'amministratore (facoltativa)" });
    expect(note).toHaveValue("Già visto");
    await userEvent.clear(note);
    await userEvent.type(note, "  Utente avvisato  ");
    await userEvent.click(screen.getByRole("button", { name: "Risolta" }));
    expect(state.updates).toEqual([{ reportId: 31, status: "resolved", adminNote: "Utente avvisato" }]);
    expect(toast.success).toHaveBeenCalledWith("Segnalazione aggiornata");

    state.updateError = Object.assign(new Error("FORBIDDEN"), { data: { code: "FORBIDDEN" } });
    await userEvent.click(screen.getByRole("button", { name: "Respingi" }));
    expect(toast.error).toHaveBeenCalledWith("Aggiornamento non riuscito");
    const group = screen.getByRole("group", { name: "Stato della segnalazione n. 31" });
    expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "In revisione",
      "Risolta",
      "Respingi",
      "Riapri",
    ]);
  });

  it("not an admin: a message, and the reports are never asked for", () => {
    state.me = { id: 2, role: "user" };
    renderPage();
    expect(screen.getByText("Accesso riservato agli amministratori.")).toBeInTheDocument();
    expect(state.inputs.every((entry: any) => entry.enabled === false)).toBe(true);
  });

  it("loading, error with «Riprova» and empty are three different answers; no count meanwhile", async () => {
    state.reportsLoading = true;
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("Caricamento delle segnalazioni…");
    expect(screen.queryByText(/segnalazion[ei]$/)).toBeNull();
    cleanup();

    state.reportsLoading = false;
    state.reportsError = new Error("boom");
    renderPage();
    expect(screen.queryByText(/^Nessuna segnalazione/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch).toHaveBeenCalled();
    cleanup();

    state.reportsError = null;
    state.reports = { items: [], total: 0 };
    renderPage();
    expect(screen.getByText("Nessuna segnalazione con questo stato.")).toBeInTheDocument();
    expect(screen.getByText("0 segnalazioni")).toBeInTheDocument();
  });

  it("while auth.me loads: a skeleton, not the «riservato» message", () => {
    state.meLoading = true;
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("Caricamento…");
    expect(screen.queryByText("Accesso riservato agli amministratori.")).toBeNull();
  });
});
