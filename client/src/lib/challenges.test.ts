import { describe, expect, it } from "vitest";
import { challengeProgressParts } from "./challenges";

describe("challengeProgressParts", () => {
  it("formatta il progresso per obiettivo", () => {
    expect(challengeProgressParts("total_distance", 3200)).toEqual({ value: "3,2", unit: "km" });
    expect(challengeProgressParts("longest_session", 800)).toEqual({ value: "800", unit: "m" });
    expect(challengeProgressParts("total_distance", 0)).toEqual({ value: "0", unit: "km" });
    expect(challengeProgressParts("total_time", 3720)).toEqual({ value: "1:02", unit: "h" });
    expect(challengeProgressParts("total_time", null)).toEqual({ value: "0", unit: "min" });
    expect(challengeProgressParts("avg_pace", 112)).toEqual({ value: "1:52", unit: "/100 m" });
    expect(challengeProgressParts("avg_pace", 0)).toEqual({ value: "—" });
    expect(challengeProgressParts("total_sessions", 1)).toEqual({ value: "1", unit: "nuotata" });
    expect(challengeProgressParts("consistency", 12)).toEqual({ value: "12", unit: "giorni" });
    expect(challengeProgressParts("total_sessions", 1234)).toEqual({ value: "1.234", unit: "nuotate" });
  });
});
