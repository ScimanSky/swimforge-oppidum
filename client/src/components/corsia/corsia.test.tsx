import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { Surface } from "@/components/ui/surface";
import { HUB_TABS } from "@/lib/navigation";
import { ActivityCard, type ActivityCardData } from "./ActivityCard";
import { Chip } from "./Chip";
import { LevelCard, LevelStrip } from "./LevelCard";
import { Metric } from "./Metric";
import { SectionTabs } from "./SectionTabs";

const withRouter = (path: string, ui: ReactNode) => (
  <Router hook={memoryLocation({ path }).hook}>{ui}</Router>
);

const activity: ActivityCardData = {
  id: 7,
  activityName: "Soglia 10×200",
  activityDate: new Date(2026, 9, 26, 10, 47),
  distanceMeters: 3200,
  durationSeconds: 3720,
  avgPacePer100m: 112,
  avgHeartRate: null,
  xpEarned: 180,
  isOpenWater: false,
  poolLengthMeters: 25,
};

describe("primitivi Corsia", () => {
  afterEach(cleanup);

  it("Metric mostra valore, unità ed etichetta", () => {
    render(<Metric value="3,2" unit="km" label="Distanza" />);
    expect(screen.getByText("3,2")).toBeInTheDocument();
    expect(screen.getByText("km")).toBeInTheDocument();
    expect(screen.getByText("Distanza")).toBeInTheDocument();
  });

  it("Metric senza unità non mostra lo spazio dell'unità", () => {
    render(<Metric value="142" label="FC media" />);
    expect(screen.getByText("142").children).toHaveLength(0);
  });

  it("Chip con tono xp contiene il testo", () => {
    render(<Chip tone="xp">+180 XP</Chip>);
    const chip = screen.getByText("+180 XP");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveClass("text-xp");
  });

  it("SectionTabs segna la sezione attiva", () => {
    render(
      withRouter(
        "/goals",
        <SectionTabs tabs={HUB_TABS.train} ariaLabel="Sezioni di Allena" />
      )
    );
    expect(
      screen.getByRole("navigation", { name: "Sezioni di Allena" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Obiettivi" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Attività" })).not.toHaveAttribute(
      "aria-current"
    );
    expect(screen.getByRole("link", { name: "Coach AI" })).toHaveAttribute(
      "data-tour",
      "ai-coach-btn"
    );
  });

  it("SectionTabs ignora query e barra finale", () => {
    render(
      withRouter(
        "/track/?filter=pool",
        <SectionTabs tabs={HUB_TABS.train} ariaLabel="Sezioni di Allena" />
      )
    );
    expect(screen.getByRole("link", { name: "Attività" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("Metric size sm per le card strette, valore senza a capo", () => {
    render(<Metric value="1:02" unit="h" label="Durata" size="sm" />);
    const value = screen.getByText("1:02");
    expect(value).toHaveClass("text-[24px]", "whitespace-nowrap");
  });

  const level12 = {
    level: 12,
    totalXp: 8420,
    currentLevelXp: 8000,
    nextLevelXp: 9000,
    xpToNextLevel: 580,
  };

  it("LevelCard mostra livello, XP mancanti e totali", () => {
    render(<LevelCard {...level12} />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("580 XP")).toBeInTheDocument();
    expect(screen.getByText("al livello 13")).toBeInTheDocument();
    expect(screen.getByText("8.420 XP totali")).toBeInTheDocument();
  });

  it("LevelCard: avanzamento dentro il livello attuale, barra accessibile", () => {
    render(<LevelCard {...level12} />);
    const bar = screen.getByRole("progressbar", {
      name: "Avanzamento al livello 13",
    });
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar).toHaveAttribute("aria-valuetext", "580 XP mancanti");
  });

  it("LevelCard al livello massimo non mostra il prossimo livello", () => {
    render(
      <LevelCard
        level={50}
        totalXp={120000}
        currentLevelXp={100000}
        nextLevelXp={null}
        xpToNextLevel={0}
      />
    );
    expect(screen.queryByText(/al livello/)).toBeNull();
    expect(
      screen.getByRole("progressbar", { name: "Livello massimo" })
    ).toHaveAttribute("aria-valuenow", "100");
  });

  it("LevelCard: soglie incoerenti e XP negativi non rompono la barra", () => {
    render(
      <LevelCard
        level={3}
        totalXp={900}
        currentLevelXp={1000}
        nextLevelXp={1000}
        xpToNextLevel={-20}
      />
    );
    expect(screen.getByText("0 XP")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100"
    );
  });

  it("LevelCard: XP sotto la soglia del livello → 0%", () => {
    render(<LevelCard {...level12} totalXp={7900} xpToNextLevel={1100} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0"
    );
  });

  it("LevelStrip: link al profilo e barra accessibile", () => {
    render(withRouter("/today", <LevelStrip {...level12} />));
    expect(screen.getByRole("link")).toHaveAttribute("href", "/profile");
    const bar = screen.getByRole("progressbar", {
      name: "Avanzamento al livello 13",
    });
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar).toHaveAttribute("aria-valuetext", "580 XP mancanti");
  });

  it("ActivityCard: senza FC niente «FC media», chip XP, link al dettaglio", () => {
    render(withRouter("/track", <ActivityCard activity={activity} />));
    expect(screen.queryByText("FC media")).toBeNull();
    expect(screen.getByText("+180")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Soglia 10×200" });
    expect(link).toHaveAttribute("href", "/track/7");
    expect(link).toHaveAccessibleDescription("lun 26 ott · 10:47 · Vasca 25m");
    expect(screen.getByText("1:02")).toBeInTheDocument();
    expect(screen.getByText("1:52")).toHaveClass("text-[24px]");
  });

  it("ActivityCard con FC e senza XP", () => {
    render(
      withRouter(
        "/track",
        <ActivityCard
          activity={{ ...activity, avgHeartRate: 141.6, xpEarned: 0 }}
        />
      )
    );
    expect(screen.getByText("FC media")).toBeInTheDocument();
    expect(screen.getByText("142")).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it("ActivityCard: vasca senza lunghezza, data non valida, icona decorativa", () => {
    const { container } = render(
      withRouter(
        "/track",
        <ActivityCard
          activity={{
            ...activity,
            activityDate: "non una data",
            poolLengthMeters: null,
          }}
        />
      )
    );
    expect(screen.getByRole("link")).toHaveAccessibleDescription("— · Vasca");
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
    svgs.forEach(svg => expect(svg).toHaveAttribute("aria-hidden", "true"));
  });

  it("ActivityCard selezionabile: pulsante con solo contenuto inline", () => {
    let selected = 0;
    render(
      <ActivityCard
        activity={{ ...activity, isOpenWater: true }}
        onSelect={() => (selected += 1)}
        selected
      />
    );
    const button = screen.getByRole("button", { name: "Soglia 10×200" });
    expect(button).toHaveAttribute("aria-current", "true");
    expect(button).not.toHaveAttribute("aria-pressed");
    expect(button).toHaveAccessibleDescription(
      "lun 26 ott · 10:47 · Acque libere"
    );
    expect(button.querySelector("div, p, section, ul")).toBeNull();
    button.click();
    expect(selected).toBe(1);
  });

  it("ActivityCard non selezionata: niente aria-current", () => {
    render(<ActivityCard activity={activity} onSelect={() => {}} />);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-current");
  });

  it("ActivityCard: href e onSelect si escludono (solo tipi)", () => {
    // @ts-expect-error a card is either a link or a selectable button
    const both = <ActivityCard activity={activity} href="/x" onSelect={() => {}} />;
    // @ts-expect-error selected only makes sense with onSelect
    const selectedLink = <ActivityCard activity={activity} selected />;
    expect(both).toBeTruthy();
    expect(selectedLink).toBeTruthy();
  });

  it("Surface è piatta: nessun movimento al passaggio del mouse", () => {
    render(<Surface>contenuto</Surface>);
    const surface = screen.getByText("contenuto");
    expect(surface).toHaveClass("surface-panel");
    expect(surface.className).not.toMatch(/translate|transform/);
  });
});
