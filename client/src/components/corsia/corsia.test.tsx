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
import { LoadError } from "./LoadState";
import { Metric } from "./Metric";
import { SectionTabs } from "./SectionTabs";
import { WeekCard } from "./WeekCard";
import { summarizeWeek } from "@/lib/week-summary";

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

  it("LevelCard: «Livello» è un titolo h2 che dà il nome alla sezione", () => {
    render(<LevelCard {...level12} />);
    const heading = screen.getByRole("heading", { level: 2, name: "Livello" });
    expect(screen.getByRole("region", { name: "Livello" })).toContainElement(heading);
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
    // Date and place, XP, then the metrics.
    expect(link).toHaveAccessibleDescription(
      "lun 26 ott · 10:47 · Vasca 25m +180 XP 3,2 km Distanza 1:02 h Durata 1:52 Passo /100"
    );
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
    // No XP chip: the description goes from the place straight to the metrics.
    expect(screen.getByRole("link")).toHaveAccessibleDescription(
      "lun 26 ott · 10:47 · Vasca 25m 3,2 km Distanza 1:02 h Durata 1:52 Passo /100 142 FC media"
    );
  });

  it("ActivityCard: una distanza non valida non diventa «— km»", () => {
    render(
      withRouter(
        "/track",
        <ActivityCard activity={{ ...activity, distanceMeters: Number.NaN }} />
      )
    );
    expect(screen.queryByText("Distanza")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("ActivityCard: sotto 1 km la distanza è in metri", () => {
    render(
      withRouter("/track", <ActivityCard activity={{ ...activity, distanceMeters: 800 }} />)
    );
    expect(screen.getByRole("link")).toHaveAccessibleDescription(/800 m Distanza/);
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
    // No date: the segment is left out, never «— ·».
    expect(screen.getByRole("link")).toHaveAccessibleDescription(
      "Vasca +180 XP 3,2 km Distanza 1:02 h Durata 1:52 Passo /100"
    );
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
      "lun 26 ott · 10:47 · Acque libere +180 XP 3,2 km Distanza 1:02 h Durata 1:52 Passo /100"
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

  it("WeekCard: totali come testo, singolare, XP solo se ci sono", () => {
    const now = new Date(2026, 9, 28, 18);
    const summary = summarizeWeek(
      [{ activityDate: new Date(2026, 9, 27, 8), distanceMeters: 12_700, xpEarned: 0 }],
      now
    );
    render(<WeekCard summary={summary} />);
    const card = screen.getByRole("region", { name: "Questa settimana" });
    expect(card).toHaveTextContent("12,7 km");
    expect(screen.getByText("1 nuotata")).toBeInTheDocument();
    expect(screen.queryByText(/XP/)).toBeNull();
  });

  it("LoadError: una card da sola, senza bordo né fondo propri dentro un'altra card", () => {
    render(<LoadError onRetry={() => {}} />);
    expect(screen.getByRole("alert")).toHaveClass("surface-panel");
    cleanup();

    render(<LoadError variant="inline" onRetry={() => {}} className="p-4" />);
    const inline = screen.getByRole("alert");
    expect(inline).toHaveTextContent("Non riesco a caricare i dati");
    expect(inline).not.toHaveClass("surface-panel");
    expect(inline).toHaveClass("p-4");
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
  });

  it("Surface è piatta: nessun movimento al passaggio del mouse", () => {
    render(<Surface>contenuto</Surface>);
    const surface = screen.getByText("contenuto");
    expect(surface).toHaveClass("surface-panel");
    expect(surface.className).not.toMatch(/translate|transform/);
  });
});
