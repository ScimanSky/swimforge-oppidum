import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { cloneElement } from "react";
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
  intervals: {} as Record<string, unknown[]>,
  focusRefetch: {} as Record<string, unknown[]>,
  sends: [] as unknown[],
  sendError: null as unknown,
  marks: [] as unknown[],
  markError: null as unknown,
  /** Bumped by a poll: when the conversation's data was last fetched. */
  polledAt: 1,
  visibility: "visible" as DocumentVisibilityState,
  searches: [] as unknown[],
  profiles: {} as Record<number, any>,
  previous: null as string | null,
  refetch: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/lib/trpc", () => {
  const cache = { invalidate: state.invalidate };
  // Like TanStack Query: a disabled query has no data and stays pending.
  const query = (name: string, data: (input: any) => unknown, error: () => unknown = () => null) => ({
    useQuery: (input: any, options?: { enabled?: boolean; refetchInterval?: unknown; refetchOnWindowFocus?: unknown }) => {
      (state.enabled[name] ??= []).push(options?.enabled);
      (state.intervals[name] ??= []).push(options?.refetchInterval);
      (state.focusRefetch[name] ??= []).push(options?.refetchOnWindowFocus);
      const base = { refetch: state.refetch };
      if (options?.enabled === false) return { ...base, data: undefined, isPending: true, isError: false };
      const value = data(input);
      if (error()) return { ...base, data: undefined, isPending: false, isError: true };
      if (value === undefined) return { ...base, data: undefined, isPending: true, isError: false };
      return { ...base, data: value, isPending: false, isError: false, dataUpdatedAt: state.polledAt };
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
            useMutation: (options?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => ({
              mutate: (
                vars: unknown,
                callOptions?: { onSuccess?: () => void; onError?: (error: unknown) => void }
              ) => {
                state.marks.push(vars);
                if (state.markError) {
                  options?.onError?.(state.markError);
                  callOptions?.onError?.(state.markError);
                } else {
                  options?.onSuccess?.();
                  callOptions?.onSuccess?.();
                }
              },
              isPending: false,
            }),
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
          getPublicProfile: query("profile", (input) => state.profiles[input.userId]),
        },
      },
    },
  };
});

// direct_messages is not in the Realtime publication: the component must not subscribe.
const realtime = vi.hoisted(() => ({ channel: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { channel: realtime.channel, removeChannel: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/in-app-history", () => ({ previousInAppPath: () => state.previous }));
// Radix ScrollArea measures itself; jsdom has no ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state.visibility });

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

function renderIn(ui: React.ReactElement, path = "/messages") {
  const location = memoryLocation({ path, record: true });
  // A new element each time, so a rerender renders the page again (as a poll does).
  const tree = () => (
    <Router hook={location.hook} searchHook={location.searchHook}>
      {cloneElement(ui)}
    </Router>
  );
  const { rerender } = render(tree());
  // What a 5 s poll of the open chat does: the same messages, fetched again.
  const poll = () => {
    state.polledAt += 1;
    rerender(tree());
  };
  return Object.assign(location, { poll });
}

const setVisibility = (visibility: DocumentVisibilityState) => {
  state.visibility = visibility;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
};

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
    state.intervals = {};
    state.focusRefetch = {};
    state.sends = [];
    state.sendError = null;
    state.marks = [];
    state.markError = null;
    state.polledAt = 1;
    state.visibility = "visible";
    state.searches = [];
    state.profiles = {};
    state.previous = null;
    state.refetch.mockClear();
    state.invalidate.mockClear();
    realtime.channel.mockClear();
    vi.mocked(toast.error).mockClear();
  });

  describe("header link", () => {
    it("no Realtime subscription (direct_messages is not published): the unread count asks again once a minute", () => {
      renderIn(<DirectMessages mode="link" />);
      expect(realtime.channel).not.toHaveBeenCalled();
      expect(new Set(state.intervals.unreadCount)).toEqual(new Set([60_000]));
      expect(new Set(state.focusRefetch.unreadCount)).toEqual(new Set([true]));
    });

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

    it("the open chat polls every 5 s while the page is on screen, the list once a minute", () => {
      renderIn(<DirectMessages mode="page" />);
      expect(realtime.channel).not.toHaveBeenCalled();
      expect(new Set(state.intervals.recent)).toEqual(new Set([60_000]));
      expect(new Set(state.focusRefetch.recent)).toEqual(new Set([true]));
      expect(state.intervals.conversation.at(-1)).toBe(5_000);
    });

    it("the open chat stops polling while the page is hidden and starts again when it is back", () => {
      renderIn(<DirectMessages mode="page" />);
      setVisibility("hidden");
      expect(state.intervals.conversation.at(-1)).toBe(false);
      setVisibility("visible");
      expect(state.intervals.conversation.at(-1)).toBe(5_000);
    });

    it("a forwarded post is a card with the author, the preview and «Apri il post»", () => {
      state.recent = [
        {
          ...conversation(5, "Ada Rossi", "Post inoltrato da Bea", 0, 1),
          lastMessage: {
            ...conversation(5, "Ada Rossi", "Post inoltrato da Bea", 0, 1).lastMessage,
            messageType: "forward_post",
          },
        },
      ];
      const forward = msg(3, 5, 4, "Post inoltrato da Bea\n\nGuarda che vasca");
      forward.message.messageType = "forward_post";
      (forward.message as { metadata: unknown }).metadata = {
        targetType: "post",
        targetId: 42,
        ownerName: "Bea",
        previewText: "Mille metri a stile",
        previewMediaUrl: null,
      };
      state.chats = { 5: [forward] };
      renderIn(<DirectMessages mode="page" />);

      // The list says what it is, not the fallback text.
      expect(screen.getByRole("button", { name: /^Ada Rossi .*Post inoltrato$/ })).toBeInTheDocument();
      const log = screen.getByRole("log", { name: "Messaggi con Ada Rossi" });
      expect(within(log).getByText("Bea")).toBeInTheDocument();
      expect(within(log).getByText("Mille metri a stile")).toBeInTheDocument();
      expect(within(log).getByRole("link", { name: "Apri il post" })).toHaveAttribute("href", "/post/42");
    });

    it("a forward whose metadata is unreadable shows its text", () => {
      const forward = msg(3, 5, 4, "Post inoltrato da Bea");
      forward.message.messageType = "forward_post";
      state.chats = { 5: [forward] };
      renderIn(<DirectMessages mode="page" />);
      const log = screen.getByRole("log", { name: "Messaggi con Ada Rossi" });
      expect(within(log).getByText("Post inoltrato da Bea")).toBeInTheDocument();
      expect(within(log).queryByRole("link", { name: "Apri il post" })).toBeNull();
    });

    it("marks read once per new message; a failed attempt is tried again on the next poll", () => {
      state.markError = new Error("boom");
      const location = renderIn(<DirectMessages mode="page" />);
      expect(state.marks).toEqual([{ senderId: 5 }]);

      state.markError = null;
      location.poll();
      expect(state.marks).toEqual([{ senderId: 5 }, { senderId: 5 }]);
      // Done: further polls of the same messages ask nothing.
      location.poll();
      expect(state.marks).toEqual([{ senderId: 5 }, { senderId: 5 }]);
    });

    it("a chat on a hidden page is not marked read until the page is visible again", () => {
      state.visibility = "hidden";
      const location = renderIn(<DirectMessages mode="page" />);
      expect(screen.getByRole("log", { name: "Messaggi con Ada Rossi" })).toHaveTextContent("Ci sei domani?");
      location.poll();
      expect(state.marks).toEqual([]);

      setVisibility("visible");
      expect(state.marks).toEqual([{ senderId: 5 }]);
    });

    it("the message log can be reached and scrolled by keyboard, between the chat's name and the field", async () => {
      renderIn(<DirectMessages mode="page" />);
      const log = screen.getByRole("log", { name: "Messaggi con Ada Rossi" });
      expect(log).toHaveAttribute("tabindex", "0");
      screen.getByRole("link", { name: "Ada Rossi" }).focus();
      await userEvent.tab();
      expect(log).toHaveFocus();
      await userEvent.tab();
      expect(screen.getByRole("textbox", { name: "Messaggio" })).toHaveFocus();
    });

    it("the list dates a conversation briefly: the time today, «27 ott» before", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60_000);
      const day = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(threeDaysAgo);
      state.recent = [conversation(5, "Ada Rossi", "Ci sei domani?", 0, 1), conversation(6, "Bruno", "Ok!", 0, 3 * 24 * 60)];
      renderIn(<DirectMessages mode="page" />);
      expect(screen.getByRole("button", { name: /^Ada Rossi/ })).toHaveAccessibleName(/^Ada Rossi \d\d:\d\d Ci sei domani\?$/);
      expect(screen.getByRole("button", { name: /^Bruno/ })).toHaveAccessibleName(`Bruno ${day} Ok!`);
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
      // Desktop: the next step is writing, and there is no on-screen keyboard to pop up.
      expect(screen.getByRole("textbox", { name: "Messaggio" })).toHaveFocus();

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
      // The chat's name, not the message field: focusing it would pop up the keyboard.
      expect(screen.getByRole("heading", { level: 2, name: "Ada Rossi" })).toHaveFocus();
      expect(screen.getByRole("textbox", { name: "Messaggio" })).not.toHaveFocus();
      await userEvent.click(screen.getByRole("button", { name: "Torna alle conversazioni" }));
      expect(screen.getByRole("heading", { level: 2, name: "Conversazioni" })).toHaveFocus();
      expect(screen.queryByRole("log")).toBeNull();
    });

    it("on a phone a person picked in «Nuovo messaggio» opens their chat with focus on its name", async () => {
      setPhone(true);
      state.people = [{ userId: 8, name: "Carla Bianchi", username: "carla", avatarUrl: null, level: 3 }];
      state.chats[8] = [];
      renderIn(<DirectMessages mode="page" />, "/messages?new=1");
      await userEvent.type(screen.getByRole("searchbox", { name: "Cerca un nuotatore" }), "car");
      await userEvent.click(await screen.findByRole("button", { name: "Carla Bianchi @carla" }));
      expect(screen.getByRole("heading", { level: 2, name: "Carla Bianchi" })).toHaveFocus();
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

    it("a chat that cannot load offers «Riprova», without a card inside the Messages card", () => {
      state.chatError = new Error("boom");
      renderIn(<DirectMessages mode="page" />);
      expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a caricare i dati");
      expect(screen.getByRole("alert")).not.toHaveClass("surface-panel");
    });
  });

  describe("the URL says what is open", () => {
    it("on desktop the newest chat opens in place of the list's URL: no extra history entry", () => {
      const location = renderIn(<DirectMessages mode="page" />);
      expect(screen.getByRole("heading", { level: 2, name: "Ada Rossi" })).toBeInTheDocument();
      expect(location.history).toEqual(["/messages?con=5"]);
    });

    it("?con= opens that chat, on desktop and on a phone", () => {
      renderIn(<DirectMessages mode="page" />, "/messages?con=6");
      expect(screen.getByRole("heading", { level: 2, name: "Bruno" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Bruno/ })).toHaveAttribute("aria-current", "true");
      expect(screen.getByText("Nessun messaggio: scrivi il primo.")).toBeInTheDocument();
      cleanup();

      setPhone(true);
      renderIn(<DirectMessages mode="page" />, "/messages?con=5");
      expect(screen.getByRole("heading", { level: 2, name: "Ada Rossi" })).toBeInTheDocument();
      expect(screen.getByRole("log", { name: "Messaggi con Ada Rossi" })).toBeInTheDocument();
    });

    it("?con= of someone not in the recent conversations: their name from the profile", () => {
      state.profiles[8] = { name: "Carla Bianchi", username: "carla", avatarUrl: null };
      state.chats[8] = [];
      renderIn(<DirectMessages mode="page" />, "/messages?con=8");
      expect(screen.getByRole("heading", { level: 2, name: "Carla Bianchi" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Carla Bianchi" })).toHaveAttribute("href", "/u/8");
    });

    it("«Crea» → «Messaggio» (?new=1) opens «Nuovo messaggio», and no chat opens by itself", () => {
      const location = renderIn(<DirectMessages mode="page" />, "/messages?new=1");
      expect(screen.getByRole("heading", { level: 2, name: "Nuovo messaggio" })).toBeInTheDocument();
      expect(screen.getByRole("searchbox", { name: "Cerca un nuotatore" })).toBeInTheDocument();
      expect(screen.getByText("Scrivi un nome per cercare un nuotatore.")).toBeInTheDocument();
      expect(screen.queryByRole("log")).toBeNull();
      expect(location.history).toEqual(["/messages?new=1"]);
    });

    it("on a phone a chat is a history entry: back (Android, browser) returns to the list", async () => {
      setPhone(true);
      const location = renderIn(<DirectMessages mode="page" />);
      await userEvent.click(screen.getByRole("button", { name: /^Ada Rossi/ }));
      expect(location.history).toEqual(["/messages", "/messages?con=5"]);
      expect(screen.getByRole("log", { name: "Messaggi con Ada Rossi" })).toBeInTheDocument();

      // What history.back() does: the URL of the list again.
      act(() => location.navigate("/messages"));
      expect(screen.getByRole("heading", { level: 2, name: "Conversazioni" })).toBeInTheDocument();
      expect(screen.queryByRole("log")).toBeNull();
    });

    it("«Torna alle conversazioni» goes back in history when the list is the previous entry", async () => {
      setPhone(true);
      state.previous = "/messages";
      const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
      const location = renderIn(<DirectMessages mode="page" />, "/messages?con=5");
      await userEvent.click(screen.getByRole("button", { name: "Torna alle conversazioni" }));
      expect(back).toHaveBeenCalled();
      expect(location.history).toEqual(["/messages?con=5"]);
      back.mockRestore();
    });

    it("«Torna alle conversazioni» after a link from elsewhere replaces the chat with the list", async () => {
      setPhone(true);
      state.previous = "/home";
      const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
      const location = renderIn(<DirectMessages mode="page" />, "/messages?con=5");
      await userEvent.click(screen.getByRole("button", { name: "Torna alle conversazioni" }));
      expect(back).not.toHaveBeenCalled();
      expect(location.history).toEqual(["/messages"]);
      expect(screen.getByRole("heading", { level: 2, name: "Conversazioni" })).toBeInTheDocument();
      back.mockRestore();
    });

    it("a person picked in «Nuovo messaggio» takes the search's place in the history", async () => {
      state.people = [{ userId: 8, name: "Carla Bianchi", username: "carla", avatarUrl: null, level: 3 }];
      state.chats[8] = [];
      const location = renderIn(<DirectMessages mode="page" />);
      await userEvent.click(screen.getByRole("button", { name: "Nuovo messaggio" }));
      expect(location.history).toEqual(["/messages?con=5", "/messages?con=5&new=1"]);
      await userEvent.type(screen.getByRole("searchbox", { name: "Cerca un nuotatore" }), "car");
      await userEvent.click(await screen.findByRole("button", { name: "Carla Bianchi @carla" }));
      expect(location.history).toEqual(["/messages?con=5", "/messages?con=8"]);
      expect(screen.getByRole("heading", { level: 2, name: "Carla Bianchi" })).toBeInTheDocument();
    });

    it("«Annulla» goes back in history when the previous entry is the page without the search", async () => {
      const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
      renderIn(<DirectMessages mode="page" />);
      await userEvent.click(screen.getByRole("button", { name: "Nuovo messaggio" }));
      state.previous = "/messages?con=5";
      await userEvent.click(screen.getByRole("button", { name: "Annulla" }));
      expect(back).toHaveBeenCalled();
      back.mockRestore();
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
      // Focus starts in the message field, not on the (focusable) message log above it.
      await waitFor(() => expect(within(dialog).getByRole("textbox", { name: "Messaggio" })).toHaveFocus());
      expect(within(dialog).getByRole("log", { name: "Messaggi con Ada Rossi" })).toHaveTextContent("Ci sei domani?");
      await userEvent.type(within(dialog).getByRole("textbox", { name: "Messaggio" }), "Sì!{Enter}");
      expect(state.sends).toEqual([{ receiverId: 5, content: "Sì!" }]);

      await userEvent.click(within(dialog).getByRole("button", { name: "Chiudi" }));
      await waitFor(() => expect(trigger).toHaveFocus());
    });
  });
});
