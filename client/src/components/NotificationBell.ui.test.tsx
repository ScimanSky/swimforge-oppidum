import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import NotificationBell from "./NotificationBell";

const state = vi.hoisted(() => ({
  profile: { userId: 4, notificationSettings: null } as any,
  unread: 2 as unknown,
  list: [] as any[],
  listError: null as unknown,
  listLoading: false,
  marks: [] as unknown[],
  markError: null as unknown,
  refetch: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/lib/trpc", () => {
  const cache = { setData: vi.fn(), invalidate: state.invalidate };
  return {
    trpc: {
      useUtils: () => ({ community: { notifications: { unreadCount: cache, list: cache } } }),
      profile: { get: { useQuery: () => ({ data: state.profile }) } },
      community: {
        notifications: {
          unreadCount: { useQuery: () => ({ data: { count: state.unread } }) },
          list: {
            // Like TanStack Query: a disabled query has no data and stays pending.
            useQuery: (_input: unknown, options?: { enabled?: boolean }) => {
              const base = { refetch: state.refetch };
              if (options?.enabled === false || state.listLoading) return { ...base, isPending: true, isError: false };
              if (state.listError) return { ...base, isPending: false, isError: true };
              return { ...base, data: state.list, isPending: false, isError: false };
            },
          },
          markRead: {
            useMutation: (options?: { onSuccess?: () => void; onError?: (error: unknown, vars: unknown) => void }) => ({
              mutate: (vars: unknown, callOptions?: { onSuccess?: () => void }) => {
                state.marks.push(vars);
                if (state.markError) {
                  options?.onError?.(state.markError, vars);
                  return;
                }
                options?.onSuccess?.();
                callOptions?.onSuccess?.();
              },
              isPending: false,
            }),
          },
        },
      },
    },
  };
});

// Like realtime-js: channel(topic) hands back the channel with that topic while it is still in
// the client's list, removeChannel only starts leaving (asynchronous), and adding a callback to
// a channel already subscribed throws.
const realtime = vi.hoisted(() => {
  type FakeChannel = { topic: string; subscribed: boolean; inserts: Array<() => void>; on: any; subscribe: any };
  const channels = new Map<string, FakeChannel>();
  const channel = (topic: string) => {
    const existing = channels.get(topic);
    if (existing) return existing;
    const created: FakeChannel = {
      topic,
      subscribed: false,
      inserts: [],
      on(_type: string, _filter: unknown, callback: () => void) {
        if (created.subscribed) {
          throw new Error(`cannot add \`postgres_changes\` callbacks for realtime:${topic} after \`subscribe()\`.`);
        }
        created.inserts.push(callback);
        return created;
      },
      subscribe() {
        created.subscribed = true;
        return created;
      },
    };
    channels.set(topic, created);
    return created;
  };
  return { channels, channel, removeChannel: async () => "ok", latest: () => Array.from(channels.values()).at(-1) };
});
vi.mock("@/lib/supabase", () => ({
  supabase: { channel: realtime.channel, removeChannel: realtime.removeChannel },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// The popover's ScrollArea measures itself; jsdom has no ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const notification = (overrides: Record<string, unknown> = {}) => ({
  id: 11,
  type: "comment",
  title: "Nuovo commento",
  message: "Ada: bella nuotata!",
  link: "/post/5",
  isRead: false,
  createdAt: new Date(Date.now() - 5 * 60_000),
  ...overrides,
});

function renderBell() {
  const location = memoryLocation({ path: "/home", record: true });
  render(
    <Router hook={location.hook}>
      <NotificationBell />
    </Router>
  );
  return location;
}

describe("NotificationBell (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.profile = { userId: 4, notificationSettings: null };
    state.unread = 2;
    state.list = [notification(), notification({ id: 12, type: "follow", title: "Nuovo follower", link: "/u/8", isRead: true })];
    state.listError = null;
    state.listLoading = false;
    state.marks = [];
    state.markError = null;
    state.refetch.mockClear();
    state.invalidate.mockClear();
    realtime.channels.clear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("a quick remount subscribes anew (never to a channel still leaving): a new notification refreshes the bell", () => {
    renderBell();
    cleanup();
    renderBell();
    expect(realtime.channels.size).toBe(2);
    const channel = realtime.latest()!;
    expect(channel.topic).toMatch(/^notifications:4:/);

    channel.inserts.forEach((insert) => insert());
    expect(state.invalidate).toHaveBeenCalledTimes(2);
  });

  it("the bell says how many are unread; nothing when in-app notifications are off", () => {
    renderBell();
    expect(screen.getByRole("button", { name: "Notifiche, 2 non lette" })).toBeInTheDocument();
    cleanup();

    state.unread = 0;
    renderBell();
    expect(screen.getByRole("button", { name: "Notifiche" })).toBeInTheDocument();
    cleanup();

    state.profile = { userId: 4, notificationSettings: { in_app_notifications: false } };
    renderBell();
    expect(screen.queryByRole("button", { name: /Notifiche/ })).toBeNull();
  });

  it("opens the list: title, message, time, and which ones are unread", async () => {
    renderBell();
    await userEvent.click(screen.getByRole("button", { name: "Notifiche, 2 non lette" }));
    expect(screen.getByRole("heading", { level: 2, name: "Notifiche" })).toBeInTheDocument();
    const [first, second] = screen.getAllByRole("listitem");
    expect(within(first).getByRole("button")).toHaveAccessibleName("Nuovo commento Ada: bella nuotata! 5 min fa, non letta");
    expect(within(second).getByRole("button")).not.toHaveAccessibleName(/non letta/);
  });

  it("a tap marks it read and opens its page", async () => {
    const location = renderBell();
    await userEvent.click(screen.getByRole("button", { name: "Notifiche, 2 non lette" }));
    await userEvent.click(screen.getByRole("button", { name: /Nuovo commento/ }));
    expect(state.marks).toEqual([{ notificationIds: [11] }]);
    expect(location.history?.at(-1)).toBe("/post/5");
  });

  it("one notification that cannot be marked read says so in the singular, and still opens", async () => {
    state.markError = Object.assign(new Error("FORBIDDEN"), { data: { code: "FORBIDDEN" } });
    const location = renderBell();
    await userEvent.click(screen.getByRole("button", { name: "Notifiche, 2 non lette" }));
    await userEvent.click(screen.getByRole("button", { name: /Nuovo commento/ }));
    expect(toast.error).toHaveBeenCalledWith("Impossibile segnare la notifica come letta");
    expect(location.history?.at(-1)).toBe("/post/5");
  });

  it.each(["https://evil.example/x", "//evil.example/x", "/\\evil.example", "/%5Cevil.example"])(
    "an external link (%s) never leaves the app: the page of its type instead",
    async (link) => {
      state.list = [notification({ link, referenceId: 9 })];
      const location = renderBell();
      await userEvent.click(screen.getByRole("button", { name: "Notifiche, 2 non lette" }));
      await userEvent.click(screen.getByRole("button", { name: /Nuovo commento/ }));
      expect(location.history?.at(-1)).toBe("/post/9");
    }
  );

  it("«Segna tutte come lette» confirms only after the server agreed", async () => {
    renderBell();
    await userEvent.click(screen.getByRole("button", { name: "Notifiche, 2 non lette" }));
    await userEvent.click(screen.getByRole("button", { name: "Segna tutte come lette" }));
    expect(state.marks).toEqual([{}]);
    expect(toast.success).toHaveBeenCalledWith("Tutte le notifiche segnate come lette");

    state.markError = Object.assign(new Error("FORBIDDEN"), { data: { code: "FORBIDDEN" } });
    vi.mocked(toast.success).mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Segna tutte come lette" }));
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Impossibile segnare le notifiche come lette");
  });

  it("loading, error with «Riprova» and empty are three different answers", async () => {
    state.listLoading = true;
    renderBell();
    await userEvent.click(screen.getByRole("button", { name: /Notifiche/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Caricamento delle notifiche…");
    cleanup();

    state.listLoading = false;
    state.listError = new Error("boom");
    renderBell();
    await userEvent.click(screen.getByRole("button", { name: /Notifiche/ }));
    expect(screen.queryByText("Nessuna notifica")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch).toHaveBeenCalled();
    cleanup();

    state.listError = null;
    state.list = [];
    renderBell();
    await userEvent.click(screen.getByRole("button", { name: /Notifiche/ }));
    expect(screen.getByText("Nessuna notifica")).toBeInTheDocument();
  });
});
