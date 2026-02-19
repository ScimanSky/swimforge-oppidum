import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClubHero from "./ClubHero";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

const baseClub = {
  id: 1,
  name: "Swim Masters",
  description: "Club description",
  cover_image_url: null,
  website_url: "https://swimmasters.example.com",
  theme_color: "cyan",
  logo_url: null,
  tagline: "Train hard",
  visibility: "public",
  member_count: 12,
  member_role: null,
  is_member: false,
  owner_id: 5,
};

function renderClubHero(overrideClub: Partial<typeof baseClub> = {}, overrideProps: Record<string, unknown> = {}) {
  const onOpenMembers = vi.fn();
  const onOpenSettings = vi.fn();
  const onJoin = vi.fn();
  const onLeave = vi.fn();

  render(
    <ClubHero
      club={{ ...baseClub, ...overrideClub }}
      onOpenMembers={onOpenMembers}
      onOpenSettings={onOpenSettings}
      onJoin={onJoin}
      onLeave={onLeave}
      {...overrideProps}
    />
  );

  return { onOpenMembers, onOpenSettings, onJoin, onLeave };
}

describe("ClubHero", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders external site link in full variant when website is present", () => {
    renderClubHero();
    const siteLink = screen.getByRole("link", { name: /sito del club/i });
    expect(siteLink).toHaveAttribute("href", "https://swimmasters.example.com");
  });

  it("does not render external site link in full variant when website is missing", () => {
    renderClubHero({ website_url: null });
    expect(screen.queryByRole("link", { name: /sito del club/i })).not.toBeInTheDocument();
  });

  it("calls onJoin for a public non-member club", async () => {
    const { onJoin } = renderClubHero();
    await userEvent.click(screen.getByRole("button", { name: /unisciti/i }));
    expect(onJoin).toHaveBeenCalledOnce();
  });

  it("calls onLeave for a member who is not owner", async () => {
    const { onLeave } = renderClubHero({ is_member: true, member_role: "member" });
    await userEvent.click(screen.getByRole("button", { name: /lascia club/i }));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it("renders compact variant site button when website is present", () => {
    renderClubHero({}, { variant: "compactSticky" });
    const compactSiteLink = screen.getByRole("link", { name: /sito/i });
    expect(compactSiteLink).toHaveAttribute("href", "https://swimmasters.example.com");
  });

  it("hides compact variant site button when website is missing", () => {
    renderClubHero({ website_url: null }, { variant: "compactSticky" });
    expect(screen.queryByRole("link", { name: /sito/i })).not.toBeInTheDocument();
  });
});
