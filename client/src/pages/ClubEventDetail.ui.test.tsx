import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ClubEventDetail from "./ClubEventDetail";

const state = vi.hoisted(() => ({
  club: null as any,
  event: null as any,
  eventError: null as any,
  eventLoading: false,
  attendees: [] as any[] | undefined,
  attendeesError: null as any,
  me: { userId: 4 } as any,
  calls: {} as Record<string, any[]>,
  refetch: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

const helpers = vi.hoisted(() => {
  // Like TanStack Query: a disabled query has no data and stays pending.
  const query = (
    name: string,
    data: () => unknown,
    error: () => unknown = () => null,
    loading: () => boolean = () => false
  ) => ({
    useQuery: (_input?: unknown, options?: { enabled?: boolean }) => {
      state.refetch[name] ??= vi.fn();
      const base = { refetch: state.refetch[name] };
      if (options?.enabled === false || loading()) {
        return { ...base, data: undefined, isPending: true, isError: false, error: null };
      }
      const failure = error();
      if (failure) return { ...base, data: undefined, isPending: false, isError: true, error: failure };
      return { ...base, data: data(), isPending: false, isError: false, error: null };
    },
  });
  // The mutation runs its onSuccess at once, as if the server agreed.
  const mutation = (name: string) => ({
    useMutation: (options?: { onSuccess?: (data: any) => void }) => ({
      mutate: (vars: any) => {
        (state.calls[name] ??= []).push(vars);
        options?.onSuccess?.({});
      },
      isPending: false,
    }),
  });
  return { query, mutation };
});

vi.mock("@/lib/trpc", () => {
  const { query, mutation } = helpers;
  const invalidate = { invalidate: () => Promise.resolve() };
  return {
    trpc: {
      community: {
        clubs: {
          get: query("club", () => state.club),
          events: {
            get: query("event", () => state.event, () => state.eventError, () => state.eventLoading),
            attendees: query("attendees", () => state.attendees, () => state.attendeesError),
            rsvp: mutation("rsvp"),
            delete: mutation("delete"),
            refreshWeather: mutation("refreshWeather"),
            update: mutation("update"),
          },
        },
      },
      profile: { get: query("profile", () => state.me) },
      useUtils: () => ({
        community: { clubs: { events: { attendees: invalidate, list: invalidate, get: invalidate } } },
      }),
    },
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/club/EventMapEditor", () => ({ default: () => null }));

const person = (id: number, status: string, fullName: string | null, username: string | null) => ({
  id,
  status,
  user: { id, fullName, username, profilePicture: null },
});

function renderEvent() {
  const location = memoryLocation({ path: "/community/club/7/event/3", record: true });
  render(
    <Router hook={location.hook}>
      <ClubEventDetail />
    </Router>
  );
  return location;
}

describe("ClubEventDetail (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.club = { id: 7, member_role: "member" };
    state.event = {
      event: {
        id: 3,
        title: "Traversata del golfo",
        description: "Ritrovo in spiaggia.",
        location: "Cala Gonone",
        startTime: "2026-11-07T09:00:00.000Z",
        endTime: "2026-11-07T11:00:00.000Z",
        location_lat: null,
        location_lng: null,
        weather_snapshot: null,
      },
    };
    state.eventError = null;
    state.eventLoading = false;
    state.attendees = [
      person(4, "going", "Ada Rossi", "ada"),
      person(5, "going", null, "bruno"),
      person(6, "maybe", "Carla Bianchi", null),
    ];
    state.attendeesError = null;
    state.me = { userId: 4 };
    state.calls = {};
    for (const refetch of Object.values(state.refetch)) refetch.mockClear();
  });

  it("senza h1: titolo dell'evento come h2, quando, dove e numeri delle risposte", () => {
    renderEvent();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    const header = screen.getByRole("heading", { level: 2, name: "Traversata del golfo" }).closest("section")!;
    expect(within(header).getByText("Cala Gonone")).toBeTruthy();
    expect(within(header).getByText("Ritrovo in spiaggia.")).toBeTruthy();
    expect(within(header).getByText(/^sab 7 nov · \d\d:00 – \d\d:00$/)).toBeTruthy();

    const rsvp = screen.getByRole("heading", { level: 3, name: "Partecipazione" }).closest("section")!;
    expect(within(rsvp).getByText("Risposte").previousElementSibling?.textContent).toBe("3");
    expect(within(rsvp).getByText("Partecipano").previousElementSibling?.textContent).toBe("2");
    // Deleting is for the staff only.
    expect(screen.queryByRole("button", { name: "Elimina evento" })).toBeNull();
  });

  it("la propria risposta è premuta e si cambia con un tocco", async () => {
    renderEvent();
    const group = screen.getByRole("group", { name: "La tua risposta" });
    expect(within(group).getByRole("button", { name: "Partecipo" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(group).getByRole("button", { name: "Forse" }).getAttribute("aria-pressed")).toBe("false");
    await userEvent.setup({ delay: null }).click(within(group).getByRole("button", { name: "Forse" }));
    expect(state.calls.rsvp).toEqual([{ eventId: 3, status: "maybe" }]);
  });

  it("partecipanti per risposta, il @nome solo sotto un nome vero", () => {
    renderEvent();
    const people = screen.getByRole("heading", { level: 3, name: "Partecipanti" }).closest("section")!;
    expect(within(people).getByRole("heading", { level: 4, name: "Partecipano (2)" })).toBeTruthy();
    expect(within(people).getByText("Ada Rossi")).toBeTruthy();
    expect(within(people).getByText("@ada")).toBeTruthy();
    expect(within(people).getByText("bruno")).toBeTruthy();
    expect(within(people).queryByText("@bruno")).toBeNull();
    expect(within(people).getByRole("heading", { level: 4, name: "Non partecipano (0)" })).toBeTruthy();
    expect(within(people).getByText("Nessuno ancora.")).toBeTruthy();
  });

  it("in caricamento: scheletri, non «non trovato»", () => {
    state.eventLoading = true;
    renderEvent();
    expect(screen.getByRole("status").textContent).toContain("Caricamento dell'evento");
    expect(screen.queryByText("Evento non trovato.")).toBeNull();
  });

  it("un errore di rete si riprova, NOT_FOUND resta «Evento non trovato»", async () => {
    state.event = undefined;
    state.eventError = { data: { code: "INTERNAL_SERVER_ERROR" } };
    renderEvent();
    expect(screen.queryByText("Evento non trovato.")).toBeNull();
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch.event).toHaveBeenCalled();

    cleanup();
    state.eventError = { data: { code: "NOT_FOUND" } };
    renderEvent();
    expect(screen.getByText("Evento non trovato.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Torna al club" }).getAttribute("href")).toBe("/community/club/7");
    expect(screen.queryByRole("button", { name: "Riprova" })).toBeNull();
  });

  it("partecipanti non caricati: Riprova, nessun numero a zero", async () => {
    state.attendees = undefined;
    state.attendeesError = { data: { code: "INTERNAL_SERVER_ERROR" } };
    renderEvent();
    expect(screen.queryByText("Risposte")).toBeNull();
    expect(screen.queryByText("Nessuno ancora.")).toBeNull();
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch.attendees).toHaveBeenCalled();
  });

  it("lo staff elimina l'evento dopo la conferma e torna al club", async () => {
    state.club = { id: 7, member_role: "admin" };
    const user = userEvent.setup({ delay: null });
    const location = renderEvent();
    await user.click(screen.getByRole("button", { name: "Elimina evento" }));
    const dialog = screen.getByRole("alertdialog", { name: "Eliminare «Traversata del golfo»?" });
    expect(state.calls.delete).toBeUndefined();
    await user.click(within(dialog).getByRole("button", { name: "Elimina" }));
    expect(state.calls.delete).toEqual([{ eventId: 3 }]);
    expect(location.history.at(-1)).toBe("/community/club/7");
  });

  it("meteo con la virgola decimale e il pulsante per aggiornarlo", async () => {
    state.event.event.location_lat = 40.2;
    state.event.event.location_lng = 9.6;
    state.event.event.weather_snapshot = {
      general: { temperatureC: 18.46, weatherCode: 0 },
      wind: { speedMps: 3.25, directionDeg: 45 },
      waves: { heightM: 0.4, directionDeg: null, periodSeconds: 6 },
    };
    renderEvent();
    const weather = screen.getByRole("heading", { level: 3, name: "Meteo mare" }).closest("section")!;
    expect(within(weather).getByText("Sereno · 18,5 °C")).toBeTruthy();
    expect(within(weather).getByText("3,3 m/s")).toBeTruthy();
    expect(within(weather).getByText("Direzione: NE (45°)")).toBeTruthy();
    expect(within(weather).getByText("0,40 m")).toBeTruthy();
    expect(within(weather).getByText("Direzione: — · Periodo: 6,0 s")).toBeTruthy();
    await userEvent.setup({ delay: null }).click(within(weather).getByRole("button", { name: "Aggiorna il meteo" }));
    expect(state.calls.refreshWeather).toEqual([{ eventId: 3 }]);
  });
});
