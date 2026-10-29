import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClubCreateMenu from "./ClubCreateMenu";

function renderMenu(role: string | null, meetsEnabled = true) {
  const handlers = {
    onPost: vi.fn(),
    onCreateEvent: vi.fn(),
    onCreateMeet: vi.fn(),
    onInvite: vi.fn(),
  };
  render(<ClubCreateMenu role={role} meetsEnabled={meetsEnabled} {...handlers} />);
  return handlers;
}

async function openMenu() {
  await userEvent.click(screen.getByRole("button", { name: "Crea nel club" }));
  return within(await screen.findByRole("menu"));
}

const itemNames = (menu: ReturnType<typeof within>) =>
  menu.getAllByRole("menuitem").map((item: HTMLElement) => item.textContent);

describe("ClubCreateMenu", () => {
  afterEach(cleanup);

  it("«Crea» is a closed menu button with a name of its own", () => {
    renderMenu("member");
    const trigger = screen.getByRole("button", { name: "Crea nel club" });
    expect(trigger.textContent).toBe("Crea");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("a member creates posts and events only", async () => {
    renderMenu("member");
    expect(itemNames(await openMenu())).toEqual(["Nuovo post", "Nuovo evento"]);
  });

  it("a coach also creates meet calls, but does not invite (the server refuses)", async () => {
    renderMenu("coach");
    expect(itemNames(await openMenu())).toEqual(["Nuovo post", "Nuova convocazione", "Nuovo evento"]);
  });

  it("the staff gets every action; no meet call with the meets flag off", async () => {
    for (const role of ["owner", "admin", "moderator"]) {
      renderMenu(role);
      expect(itemNames(await openMenu())).toEqual(["Nuovo post", "Nuova convocazione", "Nuovo evento", "Invita"]);
      cleanup();
    }
    renderMenu("admin", false);
    expect(itemNames(await openMenu())).toEqual(["Nuovo post", "Nuovo evento", "Invita"]);
  });

  it("each item runs its action once, after the menu has closed", async () => {
    const handlers = renderMenu("owner");
    const cases = [
      ["Nuovo post", handlers.onPost],
      ["Nuova convocazione", handlers.onCreateMeet],
      ["Nuovo evento", handlers.onCreateEvent],
      ["Invita", handlers.onInvite],
    ] as const;
    for (const [name, handler] of cases) {
      const menu = await openMenu();
      await userEvent.click(menu.getByRole("menuitem", { name }));
      await waitFor(() => expect(handler).toHaveBeenCalledOnce());
      expect(screen.queryByRole("menu")).toBeNull();
    }
    expect(handlers.onPost).toHaveBeenCalledOnce();
  });

  it("Escape closes the menu without running anything and focuses «Crea» again", async () => {
    const handlers = renderMenu("owner");
    await openMenu();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Crea nel club" })).toHaveFocus());
    expect(screen.queryByRole("menu")).toBeNull();
    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled();
  });
});
