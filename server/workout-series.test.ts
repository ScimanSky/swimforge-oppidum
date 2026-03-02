import { describe, expect, it } from "vitest";
import { normalizeWorkoutPlanForRender, normalizeWorkoutSeriesItem, parseRepsSpec } from "../shared/workout-series";

describe("workout-series helpers", () => {
  it("parses reps with spaced format", () => {
    expect(parseRepsSpec("8 x 50")).toEqual({ repsCount: 8, distancePerRepMeters: 50 });
    expect(parseRepsSpec("4x100")).toEqual({ repsCount: 4, distancePerRepMeters: 100 });
    expect(parseRepsSpec("invalid")).toBeNull();
  });

  it("auto-fixes mismatch between series distance and reps", () => {
    const normalized = normalizeWorkoutSeriesItem(
      {
        label: "SL ritmo",
        reps: "8x100",
        seriesDistanceMeters: 400,
        sendoff: "1:45",
      },
      {
        isLastInBlock: false,
        defaultBetweenSetsRest: "20s",
      },
    );

    expect(normalized.item.seriesDistanceMeters).toBe(800);
    expect(normalized.item.seriesDistanceLabel).toBe("800m");
    expect(normalized.hardIssues).toContain("series_distance_mismatch");
    expect(normalized.warnings).toContain("series_distance_autofixed_from_reps");
  });

  it("keeps between sets recovery only before next series", () => {
    const first = normalizeWorkoutSeriesItem(
      {
        label: "Serie 1",
        reps: "4x100",
        sendoff: "1:45",
      },
      {
        isLastInBlock: false,
        defaultBetweenSetsRest: "25s",
      },
    );
    const last = normalizeWorkoutSeriesItem(
      {
        label: "Serie 2",
        reps: "4x50",
        sendoff: "1:05",
        betweenSetsRest: "20s",
      },
      {
        isLastInBlock: true,
      },
    );

    expect(first.item.betweenSetsRest).toBe("25s");
    expect(last.item.betweenSetsRest).toBeUndefined();
    expect(last.warnings).toContain("trailing_between_sets_rest_removed");
  });

  it("defaults missing stroke when a fallback stroke is provided", () => {
    const normalized = normalizeWorkoutSeriesItem(
      {
        label: "Serie senza stile",
        reps: "6x50",
        sendoff: "1:10",
      },
      {
        isLastInBlock: false,
        defaultStroke: "Stile Libero",
        defaultBetweenSetsRest: "20s",
      },
    );

    expect(normalized.item.stroke).toBe("Stile Libero");
    expect(normalized.warnings).toContain("stroke_defaulted");
  });

  it("normalizes legacy workout JSON for render", () => {
    const plan = normalizeWorkoutPlanForRender({
      title: "Test",
      blocks: [
        {
          phase: "main",
          label: "Main",
          items: [
            {
              label: "Serie legacy",
              reps: "4x100",
              distance: "400m",
              rest: "20s",
              sendoff: "1:45",
            },
            {
              label: "Serie finale",
              reps: "4x50",
              distance: "200m",
              sendoff: "1:10",
            },
          ],
        },
      ],
    });

    expect(plan).not.toBeNull();
    expect(plan?.blocks[0].items[0].seriesDistanceLabel).toBe("400m");
    expect(plan?.blocks[0].items[0].betweenSetsRest).toBe("20s");
    expect(plan?.blocks[0].items[1].betweenSetsRest).toBeUndefined();
  });
});
