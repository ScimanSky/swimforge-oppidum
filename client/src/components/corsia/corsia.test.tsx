import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { Surface } from "@/components/ui/surface";
import { HUB_TABS } from "@/lib/navigation";
import { ActivityCard, type ActivityCardData } from "./ActivityCard";
import { Chip } from "./Chip";
import { LevelCard } from "./LevelCard";
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
    const { container } = render(<Metric value="142" label="FC media" />);
    expect(container.querySelector("span")).toBeNull();
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

  it("LevelCard mostra livello, XP mancanti e totali", () => {
    render(
      <LevelCard
        level={12}
        totalXp={8420}
        nextLevelXp={9000}
        xpToNextLevel={580}
      />
    );
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("580 XP")).toBeInTheDocument();
    expect(screen.getByText("al livello 13")).toBeInTheDocument();
    expect(screen.getByText("8.420 XP totali")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "94"
    );
  });

  it("LevelCard al livello massimo non mostra il prossimo livello", () => {
    render(
      <LevelCard level={50} totalXp={120000} nextLevelXp={null} xpToNextLevel={0} />
    );
    expect(screen.queryByText(/al livello/)).toBeNull();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100"
    );
  });

  it("ActivityCard: senza FC niente «FC media», chip XP, link al dettaglio", () => {
    render(withRouter("/track", <ActivityCard activity={activity} />));
    expect(screen.queryByText("FC media")).toBeNull();
    expect(screen.getByText("+180")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/track/7");
    expect(screen.getByText("Soglia 10×200")).toBeInTheDocument();
    expect(
      screen.getByText("lun 26 ott · 10:47 · Vasca 25m")
    ).toBeInTheDocument();
    expect(screen.getByText("1:02")).toBeInTheDocument();
    expect(screen.getByText("1:52")).toBeInTheDocument();
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

  it("ActivityCard selezionabile diventa un pulsante", () => {
    let selected = 0;
    render(
      <ActivityCard
        activity={{ ...activity, isOpenWater: true }}
        onSelect={() => (selected += 1)}
        selected
      />
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Acque libere/)).toBeInTheDocument();
    button.click();
    expect(selected).toBe(1);
  });

  it("Surface è piatta: nessun movimento al passaggio del mouse", () => {
    render(<Surface>contenuto</Surface>);
    const surface = screen.getByText("contenuto");
    expect(surface).toHaveClass("surface-panel");
    expect(surface.className).not.toMatch(/translate|transform/);
  });
});
