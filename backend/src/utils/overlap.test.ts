import { describe, expect, it } from "vitest";
import { rangesOverlap } from "./overlap.js";

const at = (hour: number) => new Date(`2026-02-01T${String(hour).padStart(2, "0")}:00:00Z`);
describe("rangesOverlap", () => {
  it("detects partial and contained overlap", () => {
    expect(rangesOverlap({ startDateTime: at(9), endDateTime: at(12) }, { startDateTime: at(11), endDateTime: at(13) })).toBe(true);
    expect(rangesOverlap({ startDateTime: at(9), endDateTime: at(14) }, { startDateTime: at(10), endDateTime: at(12) })).toBe(true);
  });
  it("allows adjacent ranges and unrelated time slots", () => {
    expect(rangesOverlap({ startDateTime: at(9), endDateTime: at(10) }, { startDateTime: at(10), endDateTime: at(11) })).toBe(false);
    expect(rangesOverlap({ startDateTime: at(9), endDateTime: at(10) }, { startDateTime: at(11), endDateTime: at(12) })).toBe(false);
  });
});
