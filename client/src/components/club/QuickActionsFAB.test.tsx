import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import QuickActionsFAB from "./QuickActionsFAB";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => true,
}));

describe("QuickActionsFAB", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders only event and post actions for non-staff members", async () => {
    render(
      <QuickActionsFAB
        isMember
        isStaff={false}
        onPost={vi.fn()}
        onCreateEvent={vi.fn()}
        onInvite={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
    });

    const [toggleButton] = screen.getAllByRole("button");
    await userEvent.click(toggleButton);

    expect(screen.getByText("Posta")).toBeInTheDocument();
    expect(screen.getByText("Nuovo evento (1/g)")).toBeInTheDocument();
    expect(screen.queryByText("Invita")).not.toBeInTheDocument();
    expect(screen.queryByText("Nuova convocazione")).not.toBeInTheDocument();
    expect(screen.queryByText("Eventi")).not.toBeInTheDocument();
  });

  it("renders staff actions and triggers callbacks", async () => {
    const onInvite = vi.fn();
    const onCreateMeet = vi.fn();

    render(
      <QuickActionsFAB
        isMember
        isStaff
        onPost={vi.fn()}
        onCreateEvent={vi.fn()}
        onCreateMeet={onCreateMeet}
        onInvite={onInvite}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
    });

    const [toggleButton] = screen.getAllByRole("button");
    await userEvent.click(toggleButton);

    expect(screen.getByText("Invita")).toBeInTheDocument();
    expect(screen.getByText("Nuova convocazione")).toBeInTheDocument();
    expect(screen.getByText("Nuovo evento")).toBeInTheDocument();

    const inviteRow = screen.getByText("Invita").parentElement;
    expect(inviteRow).not.toBeNull();
    await userEvent.click(within(inviteRow as HTMLElement).getByRole("button"));
    expect(onInvite).toHaveBeenCalledOnce();

    await userEvent.click(toggleButton);
    const meetRow = screen.getByText("Nuova convocazione").parentElement;
    expect(meetRow).not.toBeNull();
    await userEvent.click(within(meetRow as HTMLElement).getByRole("button"));
    expect(onCreateMeet).toHaveBeenCalledOnce();
  });

  it("does not render when the user is not a member", () => {
    render(
      <QuickActionsFAB
        isMember={false}
        isStaff
        onPost={vi.fn()}
        onCreateEvent={vi.fn()}
        onCreateMeet={vi.fn()}
        onInvite={vi.fn()}
      />
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
