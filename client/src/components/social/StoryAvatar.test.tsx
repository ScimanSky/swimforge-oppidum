import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StoryAvatar } from "./StoryAvatar";

afterEach(() => {
  cleanup();
});

describe("StoryAvatar", () => {
  it("shows centered add overlay for current user with no stories", () => {
    const { container } = render(
      <StoryAvatar
        userId={1}
        userName="Mario Rossi"
        hasUnviewed={false}
        hasStories={false}
        isCurrentUser
      />
    );

    const plusIcon = container.querySelector("svg.lucide-plus");
    expect(plusIcon).not.toBeNull();
    expect(plusIcon?.parentElement).toHaveClass("inset-0");
    expect(plusIcon?.parentElement).toHaveClass("m-auto");
    expect(container.querySelector(".story-ring-animated")).toBeNull();
  });

  it("shows corner add overlay when current user already has stories", () => {
    const { container } = render(
      <StoryAvatar
        userId={1}
        userName="Mario Rossi"
        hasUnviewed={false}
        hasStories
        isCurrentUser
      />
    );

    const plusIcon = container.querySelector("svg.lucide-plus");
    expect(plusIcon).not.toBeNull();
    expect(plusIcon?.parentElement).toHaveClass("-bottom-0.5");
    expect(plusIcon?.parentElement).toHaveClass("-right-0.5");
    expect(plusIcon?.parentElement).not.toHaveClass("inset-0");
  });

  it("uses animated ring when story has unviewed content", () => {
    const { container } = render(
      <StoryAvatar userId={2} userName="Luca Bianchi" hasUnviewed hasStories />
    );

    expect(container.querySelector(".story-ring-animated")).not.toBeNull();
  });

  it("hides add overlay for non-current users", () => {
    const { container } = render(
      <StoryAvatar userId={2} userName="Luca Bianchi" hasUnviewed={false} hasStories />
    );

    expect(container.querySelector("svg.lucide-plus")).toBeNull();
  });

  it("renders current user label as 'La tua' in default size", () => {
    render(
      <StoryAvatar
        userId={3}
        userName="Utente Corrente"
        hasUnviewed={false}
        hasStories={false}
        isCurrentUser
      />
    );

    expect(screen.getByText("La tua")).toBeInTheDocument();
  });

  it("hides label in small size variant", () => {
    render(
      <StoryAvatar
        userId={4}
        userName="Anna Verdi"
        hasUnviewed={false}
        hasStories={false}
        size="sm"
      />
    );

    expect(screen.queryByText("Anna")).not.toBeInTheDocument();
  });
});
