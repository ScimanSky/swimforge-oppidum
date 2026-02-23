import { describe, expect, it } from "vitest";
import { parseCsvRowsFromBase64, parseSwimTimeToCentiseconds } from "./db_club_meets";

describe("parseSwimTimeToCentiseconds", () => {
  it("parses mm:ss.cc format", () => {
    expect(parseSwimTimeToCentiseconds("1:05.32")).toBe(6532);
    expect(parseSwimTimeToCentiseconds("0:59.9")).toBe(5990);
  });

  it("parses ss.cc format", () => {
    expect(parseSwimTimeToCentiseconds("34.12")).toBe(3412);
    expect(parseSwimTimeToCentiseconds("45")).toBe(4500);
  });

  it("returns null for invalid or disqualified values", () => {
    expect(parseSwimTimeToCentiseconds("dq")).toBeNull();
    expect(parseSwimTimeToCentiseconds("abc")).toBeNull();
    expect(parseSwimTimeToCentiseconds("")).toBeNull();
  });
});

describe("parseCsvRowsFromBase64", () => {
  it("parses CSV payload with headers", () => {
    const csv = [
      "event_label,athlete_name,final_time,rank,points",
      "50 SL,Mario Rossi,0:30.11,1,890",
      "100 SL,Luca Bianchi,1:06.50,3,710",
    ].join("\n");

    const encoded = Buffer.from(csv, "utf8").toString("base64");
    const rows = parseCsvRowsFromBase64(encoded);

    expect(rows).toHaveLength(2);
    expect(rows[0].event_label).toBe("50 SL");
    expect(rows[0].athlete_name).toBe("Mario Rossi");
    expect(rows[1].final_time).toBe("1:06.50");
  });
});
