import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClubHero from "./ClubHero";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

type ClubHeroProps = ComponentProps<typeof ClubHero>;
type ClubHeroClub = ClubHeroProps["club"];
type ClubHeroOverrideProps = Partial<Omit<ClubHeroProps, "club" | "onOpenMembers" | "onOpenSettings" | "onJoin" | "onLeave">>;

const baseClub: ClubHeroClub = {
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

function renderClubHero(overrideClub: Partial<ClubHeroClub> = {}, overrideProps: ClubHeroOverrideProps = {}) {
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

  it("renders compact variant gare button when meets link is provided", () => {
    renderClubHero({}, { variant: "compactSticky", meetsPageHref: "/community/club/1/meet/10" });
    const compactGareLink = screen.getByRole("link", { name: /gare/i });
    expect(compactGareLink).toHaveAttribute("href", "/community/club/1/meet/10");
  });

  it("hides compact variant gare button when meets link is missing", () => {
    renderClubHero({}, { variant: "compactSticky", meetsPageHref: null });
    expect(screen.queryByRole("link", { name: /gare/i })).not.toBeInTheDocument();
  });

  it("renders coach link in compact variant only for staff", () => {
    renderClubHero(
      { is_member: true, member_role: "admin" },
      { variant: "compactSticky", coachPageHref: "/community/club/1/coach" }
    );
    const coachLink = screen.getByRole("link", { name: /coach/i });
    expect(coachLink).toHaveAttribute("href", "/community/club/1/coach");
  });

  it("does not render duplicate eventi button when events and meets route is the same", () => {
    renderClubHero(
      {},
      {
        variant: "compactSticky",
        meetsPageHref: "/community/club/1/meet/10",
        eventsPageHref: "/community/club/1/meet/10",
      }
    );
    expect(screen.queryByRole("link", { name: /eventi/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /gare/i })).toBeInTheDocument();
  });

  it("adds pulse class to compact gare button when there is an active meet", () => {
    renderClubHero(
      {},
      {
        variant: "compactSticky",
        meetsPageHref: "/community/club/1/meet/10",
        hasActiveMeet: true,
      }
    );
    const gareButton = screen.getByRole("button", { name: /gare/i });
    expect(gareButton.className).toContain("animate-pulse");
  });

  it("renders pb leaderboard link when provided", () => {
    renderClubHero({}, { pbLeaderboardHref: "/community/club/1/pb" });
    const pbLink = screen.getByRole("link", { name: /pb club/i });
    expect(pbLink).toHaveAttribute("href", "/community/club/1/pb");
  });
});
