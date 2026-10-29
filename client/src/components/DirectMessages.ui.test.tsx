import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import DirectMessages from "./DirectMessages";

const state = vi.hoisted(() => ({
  unread: 3 as unknown,
  recent: [] as any[] | undefined,
  recentError: null as unknown,
  chats: {} as Record<number, any[]>,
  chatError: null as unknown,
  people: [] as any[],
  enabled: {} as Record<string, Array<boolean | undefined>>,
  sends: [] as unknown[],
  sendError: null as unknown,
  marks: [] as unknown[],
  searches: [] as unknown[],
  refetch: vi.fn(),
}));

vi.mock("@/lib/trpc", () => {
  const cache = { invalidate: vi.fn() };
  // Like TanStack Query: a disabled query has no data and stays pending.
  const query = (name: string, data: (input: any) => unknown, error: () => unknown = () => null) => ({
    useQuery: (input: any, options?: { enabled?: boolean }) => {
      (state.enabled[name] ??= []).push(options?.enabled);
      const base = { refetch: state.refetch };
      if (options?.enabled === false) return { ...base, data: undefined, isPending: true, isError: false };
      const value = data(input);
      if (error()) return { ...base, data: undefined, isPending: false, isError: true };
      if (value === undefined) return { ...base, data: undefined, isPending: true, isError: false };
      return { ...base, data: value, isPending: false, isError: false };
    },
  });
  return {
    trpc: {
      useUtils: () => ({
        community: { messages: { unreadCount: cache, recent: cache, conversation: cache } },
      }),
      profile: { get: { useQuery: () => ({ data: { userId: 4 } }) } },
      community: {
        messages: {
          unreadCount: query("unreadCount", () => ({ count: state.unread })),
          recent: query("recent", () => state.recent, () => state.recentError),
          conversation: query("conversation", (input) => state.chats[input.otherUserId] ?? [], () => state.chatError),
          markRead: {
            useMutation: () => ({ mutate: (vars: unknown) => state.marks.push(vars), isPending: false }),
          },
          send: {
            useMutation: (options?: { onError?: (error: unknown) => void }) => ({
              mutate: (vars: unknown, callOptions?: { onSuccess?: () => void }) => {
                state.sends.push(vars);
                if (state.sendError) options?.onError?.(state.sendError);
                else callOptions?.onSuccess?.();
              },
              isPending: false,
            }),
          },
        },
        users: {
          search: query("search", (input) => {
            state.searches.push(input);
            return state.people;
          }),
        },
      },
    },
  };
});

vi.mock("@/lib/supabase", () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: { channel: () => channel, removeChannel: vi.fn() } };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Radix ScrollArea measures itself; jsdom has no ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const msg = (id: number, senderId: number, receiverId: number, content: string, isRead = true) => ({
  message: {
    id,
    senderId,
    receiverId,
    content,
    messageType: "text",
    metadata: null,
    isRead,
    readAt: null,
    createdAt: new Date(),
  },
  sender: { id: senderId, username: senderId === 5 ? "Ada Rossi" : "Io", profilePicture: null },
});

const conversation = (otherId: number, name: string, content: string, unreadCount: unknown, minutesAgo: number) => ({
  lastMessage: { ...msg(100 + otherId, otherId, 4, content).message, createdAt: new Date(Date.now() - minutesAgo * 60_000) },
  otherUser: { id: otherId, username: name, profilePicture: null },
  unreadCount,
});

function renderIn(ui: React.ReactElement) {
  const location = memoryLocation({ path: "/messages", record: true });
  render(<Router hook={location.hook}>{ui}</Router>);
  return location;
}

const setPhone = (phone: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: phone
      ? (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })
      : undefined,
  });
};

describe("DirectMessages (Corsia)", () => {
  afterEach(() => {
    cleanup();
    setPhone(false);
  });
  beforeEach(() => {
    state.unread = 3;
    state.recent = [conversation(5, "Ada Rossi", "Ci sei domani?", "2", 1), conversation(6, "Bruno", "Ok!", 0, 60)];
    state.recentError = null;
    state.chats = {
      5: [msg(1, 4, 5, "Ciao Ada"), msg(2, 5, 4, "Ci sei domani?", false)],
      6: [],
    };
    state.chatError = null;
    state.people = [];
    state.enabled = {};
    state.sends = [];
    state.sendError = null;
    state.marks = [];
    state.searches = [];
    state.refetch.mockClear();
    vi.mocked(toast.error).mockClear();
  });

  describe("header link", () => {
    it("goes to /messages and says how many are unread", () => {
      renderIn(<DirectMessages mode="link" />);
      expect(screen.getByRole("link", { name: "Messaggi, 3 non letti" })).toHaveAttribute("href", "/messages");
      cleanup();

      state.unread = 0;
      renderIn(<DirectMessages mode="link" />);
      expect(screen.getByRole("link", { name: "Messaggi" })).toBeInTheDocument();
    });
  });

  describe("page", () => {
    it("lists the conversations; on desktop the newest opens and its unread messages are marked read", () => {
      renderIn(<DirectMessages mode="page" />);
      expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
      const rows = screen.getAllByRole("button", { name: /Ada Rossi|Bruno/ });
      expect(rows[0]).toHaveAccessibleName(/^Ada Rossi \d\d:\d\d Ci sei domani\?, 2 non letti$/);
      expect(rows[0]).toHaveAttribute("aria-current", "true");

      expect(screen.getByRole("heading", { level: 2, name: "Ada Rossi" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Ada Rossi" })).toHaveAttribute("href", "/u/5");
      const log = screen.getByRole("log", { name: "Messaggi con Ada Rossi" });
      expect(within(log).getAllByRole("listitem").map((item) => item.textContent?.replace(/\d\d:\d\d$/, ""))).toEqual([
        "Tu: Ciao Ada",
        "Ricevuto: Ci sei domani?",
      ]);
      expect(state.marks).toEqual([{ senderId: 5 }]);
    });

    it("no fake tabs or call buttons: only what works", () => {
      renderIn(<DirectMessages mode="page" />);
      for (const name of ["Primary", "General", "Richieste", "Chiama", "Videochiamata", "Info"]) {
        expect(screen.queryByRole("button", { name })).toBeNull();
      }
    });

    it("sends a message and clears the field; a failure keeps the text and says so in Italian", async () => {
      renderIn(<DirectMessages mode="page" />);
      const field = screen.getByRole("textbox", { name: "Messaggio" });
      expect(screen.getByRole("button", { name: "Invia" })).toBeDisabled();
      await userEvent.type(field, "Ci vediamo alle 7{Enter}");
      expect(state.sends).toEqual([{ receiverId: 5, content: "Ci vediamo alle 7" }]);
      expect(field).toHaveValue("");

      state.sendError = Object.assign(new Error("FORBIDDEN"), { data: { code: "FORBIDDEN" } });
      await userEvent.type(field, "Riprovo");
      await userEvent.click(screen.getByRole("button", { name: "Invia" }));
      expect(toast.error).toHaveBeenCalledWith("Messaggio non inviato, riprova");
      expect(field).toHaveValue("Riprovo");
    });

    it("the search field filters the conversations by name", async () => {
      renderIn(<DirectMessages mode="page" />);
      await userEvent.type(screen.getByRole("searchbox", { name: "Cerca tra le conversazioni" }), "bru");
      expect(screen.queryByRole("button", { name: /^Ada Rossi/ })).toBeNull();
      expect(screen.getByRole("button", { name: /^Bruno/ })).toBeInTheDocument();
    });

    it("«Nuovo messaggio» searches swimmers by name, shows @username (never an email) and opens the chat", async () => {
      state.people = [{ userId: 8, name: "Carla Bianchi", username: "carla", avatarUrl: null, level: 3 }];
      state.chats[8] = [];
      renderIn(<DirectMessages mode="page" />);
      await userEvent.click(screen.getByRole("button", { name: "Nuovo messaggio" }));
      const search = screen.getByRole("searchbox", { name: "Cerca un nuotatore" });
      expect(search).toHaveFocus();
      expect(screen.getByText("Scrivi un nome per cercare un nuotatore.")).toBeInTheDocument();

      await userEvent.type(search, "car");
      const person = await screen.findByRole("button", { name: "Carla Bianchi @carla" });
      expect(state.searches.at(-1)).toEqual({ query: "car", limit: 10 });
      expect(screen.queryByText(/@.*\./)).toBeNull();
      await userEvent.click(person);
      expect(screen.getByRole("heading", { level: 2, name: "Carla Bianchi" })).toBeInTheDocument();
      expect(screen.getByText("Nessun messaggio: scrivi il primo.")).toBeInTheDocument();

      await userEvent.type(screen.getByRole("textbox", { name: "Messaggio" }), "Ciao!{Enter}");
      expect(state.sends).toEqual([{ receiverId: 8, content: "Ciao!" }]);
    });

    it("«Annulla» leaves the search and gives focus back to «Nuovo messaggio»", async () => {
      renderIn(<DirectMessages mode="page" />);
      await userEvent.click(screen.getByRole("button", { name: "Nuovo messaggio" }));
      await userEvent.click(screen.getByRole("button", { name: "Annulla" }));
      expect(screen.getByRole("button", { name: "Nuovo messaggio" })).toHaveFocus();
      expect(screen.getByRole("heading", { level: 2, name: "Conversazioni" })).toBeInTheDocument();
    });

    it("on a phone nothing opens by itself; a chat has a way back to the list", async () => {
      setPhone(true);
      renderIn(<DirectMessages mode="page" />);
      expect(screen.queryByRole("log")).toBeNull();
      expect(state.marks).toEqual([]);

      await userEvent.click(screen.getByRole("button", { name: /^Ada Rossi/ }));
      expect(screen.getByRole("textbox", { name: "Messaggio" })).toHaveFocus();
      await userEvent.click(screen.getByRole("button", { name: "Torna alle conversazioni" }));
      expect(screen.getByRole("heading", { level: 2, name: "Conversazioni" })).toHaveFocus();
      expect(screen.queryByRole("log")).toBeNull();
    });

    it("loading, error with «Riprova» and empty list are three different answers", async () => {
      state.recent = undefined;
      renderIn(<DirectMessages mode="page" />);
      expect(screen.getByRole("status")).toHaveTextContent("Caricamento delle conversazioni…");
      cleanup();

      state.recent = [];
      state.recentError = new Error("boom");
      renderIn(<DirectMessages mode="page" />);
      expect(screen.queryByText("Nessun messaggio.")).toBeNull();
      await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
      expect(state.refetch).toHaveBeenCalled();
      cleanup();

      state.recentError = null;
      renderIn(<DirectMessages mode="page" />);
      expect(screen.getByText("Nessun messaggio.")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Scrivi un messaggio" }));
      expect(screen.getByRole("searchbox", { name: "Cerca un nuotatore" })).toHaveFocus();
    });

    it("a chat that cannot load offers «Riprova»", () => {
      state.chatError = new Error("boom");
      renderIn(<DirectMessages mode="page" />);
      expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a caricare i dati");
    });
  });

  describe("dialog from a profile", () => {
    it("«Messaggio» opens the chat with that swimmer, asked for only once open; focus returns on close", async () => {
      renderIn(<DirectMessages recipientId={5} recipientName="Ada Rossi" />);
      // Nothing is asked for before the dialog opens.
      expect(state.enabled.conversation ?? []).toEqual([]);
      const trigger = screen.getByRole("button", { name: "Messaggio" });
      await userEvent.click(trigger);

      const dialog = screen.getByRole("dialog", { name: "Ada Rossi" });
      expect(dialog).toHaveAccessibleDescription(/eliminati automaticamente dal server dopo \d+ giorni/);
      expect(within(dialog).getByRole("log", { name: "Messaggi con Ada Rossi" })).toHaveTextContent("Ci sei domani?");
      await userEvent.type(within(dialog).getByRole("textbox", { name: "Messaggio" }), "Sì!{Enter}");
      expect(state.sends).toEqual([{ receiverId: 5, content: "Sì!" }]);

      await userEvent.click(within(dialog).getByRole("button", { name: "Chiudi" }));
      await waitFor(() => expect(trigger).toHaveFocus());
    });
  });
});
