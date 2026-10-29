import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Settings from "./Settings";

type QueryState = { data?: unknown; isLoading?: boolean; isError?: boolean };

const state = vi.hoisted(() => ({
  search: "tab=profile",
  queries: {} as Record<string, QueryState>,
  refetch: {} as Record<string, ReturnType<typeof vi.fn>>,
  mutations: {} as Record<string, { calls: unknown[]; fail?: unknown; options?: any }>,
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/settings", vi.fn()],
  useSearch: () => state.search,
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/AppLayout", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/GarminSection", () => ({ default: () => <p>Garmin</p> }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock("@/lib/push", () => ({ registerPushToken: vi.fn(), unregisterPushToken: vi.fn(async () => {}) }));
// The Radix switch and select measure themselves; jsdom has no ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

vi.mock("@/lib/trpc", () => {
  const procedure = (path: string): any => ({
    useQuery: () => {
      state.refetch[path] ??= vi.fn();
      return { isLoading: false, isError: false, ...state.queries[path], refetch: state.refetch[path] };
    },
    useMutation: (options: any) => {
      const entry = (state.mutations[path] ??= { calls: [] });
      entry.options = options;
      const run = async (vars: unknown) => {
        entry.calls.push(vars);
        if (entry.fail) {
          options?.onError?.(entry.fail);
          throw entry.fail;
        }
        options?.onSuccess?.({});
        return {};
      };
      return {
        mutate: (vars: unknown) => void run(vars).catch(() => {}),
        mutateAsync: run,
        isPending: false,
      };
    },
    invalidate: vi.fn(),
    fetch: vi.fn(),
  });
  const utils: any = new Proxy({}, { get: () => new Proxy({}, { get: () => procedure("utils") }) });
  return {
    trpc: new Proxy(
      {},
      {
        get: (_target, router: string) => {
          if (router === "useUtils") return () => utils;
          return new Proxy({}, { get: (_t, name: string) => procedure(`${router}.${name}`) });
        },
      }
    ),
  };
});

const trpcError = (code: string, message: string) => Object.assign(new Error(message), { data: { code } });

const profile = {
  totalXp: 12480,
  nextLevelXp: 15000,
  lastName: "Lovelace",
  username: "ada",
  notificationSettings: { weekly_summary: true, social: false },
  preferences: { units: "metric", paceFormat: "100m", language: "it", timezone: "Europe/Rome", autoplayVideos: true },
  privacySettings: { profilePublic: true, activitiesPublic: false },
};

function seed() {
  state.queries = {
    "auth.me": { data: { id: 7, name: "Ada", email: "ada@swimforge.it" } },
    "auth.deleteAccountStatus": { data: { requiresPassword: true } },
    "profile.get": { data: profile },
    "activities.list": {
      data: [
        { activitySource: "garmin", strokeType: "freestyle", poolLengthMeters: 25 },
        { activitySource: "garmin", strokeType: "freestyle" },
        { activitySource: "manual", strokeType: "breaststroke" },
      ],
    },
    "garmin.status": { data: { connected: true, lastSync: null } },
    "strava.status": { data: { connected: false } },
    "consent.list": { data: { byType: { garmin_sync: { granted: true } }, versions: {} } },
  };
  state.refetch = {};
  state.mutations = {};
}

describe("Settings (Corsia)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.search = "tab=profile";
    seed();
  });
  afterEach(cleanup);

  it("sotto il titolo della shell: nessun h1, riepilogo in metriche, cinque schede", () => {
    render(<Settings />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    const summary = screen.getByRole("region", { name: "Riepilogo" });
    expect(summary).toHaveTextContent("12.480 XP totale");
    expect(summary).toHaveTextContent("1 di 2 Integrazioni attive");
    expect(summary).toHaveTextContent("3 Attività importate");
    expect(summary).toHaveTextContent("Stile libero Stile più nuotato");
    const tabs = screen.getByRole("tablist", { name: "Sezioni delle impostazioni" });
    expect(within(tabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Profilo",
      "Connessioni",
      "Notifiche",
      "Preferenze",
      "Privacy",
    ]);
    expect(screen.getByRole("tab", { name: "Profilo" })).toHaveAttribute("aria-selected", "true");
  });

  it("profilo: campi etichettati con autocompletamento, foto con il suo nome", () => {
    render(<Settings />);
    expect(screen.getByRole("heading", { level: 2, name: "Informazioni profilo" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toHaveValue("Ada");
    expect(screen.getByLabelText("Nome")).toHaveAttribute("autocomplete", "given-name");
    expect(screen.getByLabelText("Cognome")).toHaveValue("Lovelace");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@swimforge.it");
    expect(screen.getByLabelText("Data di nascita")).toHaveAttribute("autocomplete", "bday");
    expect(screen.getByLabelText("Bio")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambia foto profilo" })).toBeInTheDocument();
  });

  it("profilo in caricamento: scheletro, nessun modulo vuoto", () => {
    state.queries["profile.get"] = { isLoading: true };
    render(<Settings />);
    expect(screen.getByRole("status")).toHaveTextContent("Caricamento del profilo…");
    expect(screen.queryByLabelText("Nome")).toBeNull();
  });

  it("profilo non caricato: errore con «Riprova», mai interruttori con valori finti", async () => {
    state.queries["profile.get"] = { isError: true };
    state.search = "tab=notifications";
    render(<Settings />);
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a caricare i dati");
    expect(screen.queryByRole("switch")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch["profile.get"]).toHaveBeenCalled();
  });

  it("salvataggio del profilo fallito: lo dice, con il messaggio del server se in italiano", async () => {
    render(<Settings />);
    state.mutations["profile.update"].fail = trpcError("BAD_REQUEST", "Username già in uso");
    await userEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    expect(toast.error).toHaveBeenCalledWith("Username già in uso");
    expect(toast.success).not.toHaveBeenCalledWith("Profilo aggiornato.");
  });

  it("notifiche: ogni interruttore ha un nome e salva la scelta", async () => {
    state.search = "tab=notifications";
    render(<Settings />);
    const weekly = screen.getByRole("switch", { name: "Riepilogo settimanale" });
    expect(weekly).toBeChecked();
    expect(weekly).toHaveAccessibleDescription("Ricevi un riepilogo delle tue prestazioni ogni lunedì");
    await userEvent.click(weekly);
    expect(state.mutations["profile.update"].calls.at(-1)).toMatchObject({
      notificationSettings: expect.objectContaining({ weekly_summary: false }),
    });
  });

  it("privacy: interruttori dal profilo, consensi e link ai documenti", () => {
    state.search = "tab=privacy";
    render(<Settings />);
    expect(screen.getByRole("switch", { name: "Profilo pubblico" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Attività pubbliche" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Sincronizzazione Garmin" })).toBeChecked();
    expect(screen.getByRole("link", { name: "Apri la Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });

  it("connessioni: Garmin si gestisce nella sua scheda, Strava mostra solo lo stato", () => {
    state.search = "tab=connections";
    render(<Settings />);
    const accounts = screen.getByRole("region", { name: "Account collegati" });
    expect(within(accounts).getByText("Collegato")).toBeInTheDocument();
    expect(within(accounts).getByRole("button", { name: "Gestisci Garmin Connect" })).toBeInTheDocument();
    expect(within(accounts).getAllByRole("button")).toHaveLength(1);
    expect(within(accounts).getByText("Non collegato")).toBeInTheDocument();
    expect(within(accounts).getByText("Disponibile prossimamente")).toBeInTheDocument();
  });

  it("eliminazione con password sbagliata: errore sotto il campo e fuoco sul campo", async () => {
    state.search = "tab=privacy";
    render(<Settings />);
    await userEvent.click(screen.getByRole("button", { name: "Elimina" }));
    const dialog = screen.getByRole("dialog", { name: "Conferma eliminazione account" });
    state.mutations["auth.deleteAccount"].fail = trpcError("UNAUTHORIZED", "Password non corretta");
    const password = within(dialog).getByLabelText("Password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    await userEvent.type(password, "sbagliata");
    await userEvent.click(within(dialog).getByRole("button", { name: "Conferma eliminazione" }));

    await vi.waitFor(() => expect(password).toHaveAccessibleDescription("Password non corretta"));
    expect(password).toHaveFocus();
    expect(toast.error).not.toHaveBeenCalled();
    expect(state.mutations["auth.deleteAccount"].calls).toEqual([{ password: "sbagliata" }]);
  });
});
