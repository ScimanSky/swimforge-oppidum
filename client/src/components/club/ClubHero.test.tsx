import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClubHero from "./ClubHero";

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

  it("renders the external site link when the website is present", () => {
    renderClubHero();
    const siteLink = screen.getByRole("link", { name: /sito del club/i });
    expect(siteLink).toHaveAttribute("href", "https://swimmasters.example.com");
  });

  it("does not render the external site link when the website is missing", () => {
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

  it("renders the club name as an h2, no h1, with meta chips in Italian", () => {
    renderClubHero({ is_member: true, member_role: "owner", visibility: "invite" });
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Swim Masters" })).toBeInTheDocument();
    expect(screen.getByText("12 membri")).toBeInTheDocument();
    expect(screen.getByText("Privato")).toBeInTheDocument();
    expect(screen.getByText("Proprietario")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /lascia club/i })).not.toBeInTheDocument();
  });

  it("renders gare link when meets link is provided", () => {
    renderClubHero({}, { meetsPageHref: "/community/club/1/meet/10" });
    const gareLink = screen.getByRole("link", { name: /gare/i });
    expect(gareLink).toHaveAttribute("href", "/community/club/1/meet/10");
  });

  it("hides gare link when meets link is missing", () => {
    renderClubHero({}, { meetsPageHref: null });
    expect(screen.queryByRole("link", { name: /gare/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Sezioni del club" })).not.toBeInTheDocument();
  });

  it("renders coach link only for staff", () => {
    renderClubHero(
      { is_member: true, member_role: "admin" },
      { coachPageHref: "/community/club/1/coach" }
    );
    const coachLink = screen.getByRole("link", { name: /area coach/i });
    expect(coachLink).toHaveAttribute("href", "/community/club/1/coach");
    expect(screen.getByRole("button", { name: "Impostazioni del club" })).toBeInTheDocument();
    cleanup();

    renderClubHero(
      { is_member: true, member_role: "member" },
      { coachPageHref: "/community/club/1/coach" }
    );
    expect(screen.queryByRole("link", { name: /area coach/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Impostazioni del club" })).not.toBeInTheDocument();
  });

  it("does not render duplicate eventi link when events and meets route is the same", () => {
    renderClubHero(
      {},
      {
        meetsPageHref: "/community/club/1/meet/10",
        eventsPageHref: "/community/club/1/meet/10",
      }
    );
    expect(screen.queryByRole("link", { name: /eventi/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /gare/i })).toBeInTheDocument();
  });

  it("marks the gare link when there is an active meet", () => {
    renderClubHero(
      {},
      {
        meetsPageHref: "/community/club/1/meet/10",
        hasActiveMeet: true,
      }
    );
    // Also a published meet whose registrations are not open yet: never «iscrizioni aperte».
    expect(screen.getByRole("link", { name: "Gare, gara in programma" })).toBeInTheDocument();
    expect(screen.queryByText(/iscrizioni aperte/i)).not.toBeInTheDocument();
  });

  it("opens the members sheet from the members button", async () => {
    const { onOpenMembers } = renderClubHero();
    await userEvent.click(screen.getByRole("button", { name: "Membri" }));
    expect(onOpenMembers).toHaveBeenCalledOnce();
  });

  it("shows the create menu to members only, the owner without «Lascia club»", () => {
    const createMenu = <button type="button">Crea nel club</button>;
    renderClubHero({}, { createMenu });
    expect(screen.queryByRole("button", { name: "Crea nel club" })).not.toBeInTheDocument();
    cleanup();

    renderClubHero({ is_member: true, member_role: "member" }, { createMenu });
    expect(screen.getByRole("button", { name: "Crea nel club" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /lascia club/i })).toBeInTheDocument();
    cleanup();

    renderClubHero({ is_member: true, member_role: "owner" }, { createMenu });
    expect(screen.getByRole("button", { name: "Crea nel club" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /lascia club/i })).not.toBeInTheDocument();
  });

  it("renders club records link when provided", () => {
    renderClubHero({}, { pbLeaderboardHref: "/community/club/1/pb" });
    const pbLink = screen.getByRole("link", { name: /record del club/i });
    expect(pbLink).toHaveAttribute("href", "/community/club/1/pb");
  });
});
