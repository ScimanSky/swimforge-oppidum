import { describe, expect, it } from "vitest"
import { recordChipLabels } from "./feed-records"

describe("recordChipLabels", () => {
  it("«Record 200 SL 3:12 (−4 s)», by distance, best time per event", () => {
    expect(
      recordChipLabels([
        { record_type: "pb_200_25_t", stroke_type: "freestyle", value: 19240, previous_value: 19640 },
        { record_type: "pb_200_25_t", stroke_type: "freestyle", value: 19300, previous_value: 19640 },
        { record_type: "pb_50_25_t", stroke_type: "butterfly", value: "3245", previous_value: "3290" },
        { record_type: "pb_400_25_t", stroke_type: "freestyle", value: 41000, previous_value: null },
      ]),
    ).toEqual(["Record 50 FA 32,45 (−0,5 s)", "Record 200 SL 3:12 (−4 s)", "Record 400 SL 6:50"])
  })

  it("JSON text from the database and other record types", () => {
    expect(recordChipLabels('[{"record_type":"longest_swim","stroke_type":null,"value":5000,"previous_value":null}]')).toEqual([])
    expect(recordChipLabels(null)).toEqual([])
  })
})
