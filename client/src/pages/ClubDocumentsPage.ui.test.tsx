import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ClubDocumentsPage from "./ClubDocumentsPage";

const state = vi.hoisted(() => ({
  club: null as any,
  clubError: null as any,
  docs: [] as any[] | undefined,
  docsError: null as any,
  docsPending: false,
  uploads: [] as any[],
  onUploadSuccess: null as null | (() => void),
  refetch: { club: vi.fn(), docs: vi.fn() },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    community: {
      clubs: {
        get: {
          useQuery: () =>
            state.clubError
              ? { data: undefined, isPending: false, isError: true, error: state.clubError, refetch: state.refetch.club }
              : { data: state.club, isPending: false, isError: false, error: null, refetch: state.refetch.club },
        },
        media: {
          list: {
            useQuery: (_input: unknown, options?: { enabled?: boolean }) => {
              const base = { refetch: state.refetch.docs };
              if (options?.enabled === false || state.docsPending) {
                return { ...base, data: undefined, isPending: true, isError: false, error: null };
              }
              if (state.docsError) return { ...base, data: undefined, isPending: false, isError: true, error: state.docsError };
              return { ...base, data: state.docs, isPending: false, isError: false, error: null };
            },
          },
          uploadPdfFile: {
            useMutation: (options: { onSuccess: () => void }) => {
              state.onUploadSuccess = options.onSuccess;
              return { mutate: (vars: any) => state.uploads.push(vars), isPending: false };
            },
          },
        },
      },
    },
    useUtils: () => ({ community: { clubs: { media: { list: { invalidate: vi.fn() } } } } }),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

const doc = (id: number, caption: string | null, createdAt: string) => ({
  media: { id, caption, mediaUrl: `https://cdn.example.com/club/${id}-programma.pdf`, createdAt },
  uploader: { username: "coach.ada" },
});

function renderPage() {
  render(
    <Router hook={memoryLocation({ path: "/community/club/7/documents" }).hook}>
      <ClubDocumentsPage />
    </Router>
  );
}

describe("Documenti del club (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.club = { id: 7, name: "Rari Nantes", is_member: true, member_role: "member" };
    state.clubError = null;
    state.docs = [
      doc(1, "Regolamento", "2026-09-01T10:00:00.000Z"),
      doc(2, null, "2026-10-20T10:00:00.000Z"),
    ];
    state.docsError = null;
    state.docsPending = false;
    state.uploads.length = 0;
    state.refetch.club.mockClear();
    state.refetch.docs.mockClear();
  });

  it("senza h1: PDF più recenti in testa, Apri e Scarica come link con il nome del documento", () => {
    renderPage();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    const panel = screen.getByRole("heading", { level: 2, name: "PDF condivisi" }).closest("section")!;
    expect(within(panel).getByText("Da coach e staff di Rari Nantes: aprili o scaricali.")).toBeTruthy();
    expect(within(panel).getByText("2 PDF")).toBeTruthy();

    const items = within(panel).getAllByRole("listitem");
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual(["programma.pdf", "Regolamento"]);
    // Without a caption the file name is the title: not repeated underneath.
    expect(within(items[0]).getByText(/^caricato da coach\.ada · /)).toBeTruthy();
    expect(within(items[1]).getByText(/^programma\.pdf · caricato da coach\.ada · /)).toBeTruthy();

    const open = within(items[1]).getByRole("link", { name: "Apri Regolamento" });
    expect(open.getAttribute("href")).toBe("https://cdn.example.com/club/1-programma.pdf");
    expect(open.getAttribute("target")).toBe("_blank");
    const download = within(items[1]).getByRole("link", { name: "Scarica Regolamento" });
    expect(download.getAttribute("download")).toBe("programma.pdf");
    expect(within(panel).queryByRole("button")).toBeNull();
    expect(screen.queryByLabelText("File PDF")).toBeNull();
  });

  it("coach e staff caricano un PDF; dopo il caricamento il campo si svuota", async () => {
    state.club = { ...state.club, member_role: "coach" };
    renderPage();
    const user = userEvent.setup({ delay: null });
    const upload = screen.getByRole("button", { name: "Carica PDF" });
    expect(upload).toBeDisabled();

    const fileInput = screen.getByLabelText("File PDF") as HTMLInputElement;
    await user.upload(fileInput, new File(["%PDF-1.4"], "gare.pdf", { type: "application/pdf" }));
    await user.type(screen.getByLabelText("Titolo o nota"), "Gare di marzo");
    await user.click(upload);
    await waitFor(() => expect(state.uploads).toHaveLength(1));
    expect(state.uploads[0]).toMatchObject({
      clubId: 7,
      caption: "Gare di marzo",
      fileName: "gare.pdf",
      mimeType: "application/pdf",
    });
    expect(state.uploads[0].fileBase64).toBe(btoa("%PDF-1.4"));

    act(() => state.onUploadSuccess?.());
    expect(fileInput.value).toBe("");
    expect((screen.getByLabelText("Titolo o nota") as HTMLInputElement).value).toBe("");
  });

  it("in caricamento e in errore: scheletri e Riprova, mai «Nessun PDF» né «0 PDF»", async () => {
    state.docsPending = true;
    renderPage();
    expect(screen.getByRole("status").textContent).toContain("Caricamento dei documenti");
    expect(screen.queryByText("0 PDF")).toBeNull();

    cleanup();
    state.docsPending = false;
    state.docs = undefined;
    state.docsError = { data: { code: "INTERNAL_SERVER_ERROR" } };
    renderPage();
    expect(screen.queryByText("Nessun PDF condiviso per ora.")).toBeNull();
    expect(screen.queryByText("0 PDF")).toBeNull();
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch.docs).toHaveBeenCalled();
  });

  it("solo per i membri; un errore del club si riprova", async () => {
    state.club = { ...state.club, is_member: false };
    renderPage();
    expect(screen.getByText("Iscriviti al club per vedere i documenti.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "PDF condivisi" })).toBeNull();

    cleanup();
    state.club = undefined;
    state.clubError = { data: { code: "INTERNAL_SERVER_ERROR" } };
    renderPage();
    expect(screen.queryByText("Iscriviti al club per vedere i documenti.")).toBeNull();
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch.club).toHaveBeenCalled();
  });
});
