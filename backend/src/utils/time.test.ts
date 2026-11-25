import { describe, expect, it } from "vitest";
import { isBeforeTodayInTimeZone, isPastDateTime, isWholeDayRange } from "./time.js";

describe("isPastDateTime", () => {
  const now = new Date("2026-11-17T10:00:00.000Z");

  it("rejects dates before now", () => {
    expect(isPastDateTime(new Date("2026-11-17T09:59:59.999Z"), now)).toBe(true);
  });

  it("allows now and future dates", () => {
    expect(isPastDateTime(now, now)).toBe(false);
    expect(isPastDateTime(new Date("2026-11-17T10:00:00.001Z"), now)).toBe(false);
  });

  it("compares calendar dates in the user's time zone", () => {
    expect(isBeforeTodayInTimeZone(new Date("2026-11-17T04:59:00Z"), "America/New_York", new Date("2026-11-17T15:00:00Z"))).toBe(true);
    expect(isBeforeTodayInTimeZone(new Date("2026-11-17T05:00:00Z"), "America/New_York", new Date("2026-11-17T15:00:00Z"))).toBe(false);
  });

  it("accepts only ranges covering complete local calendar days", () => {
    expect(isWholeDayRange(new Date("2026-11-17T05:00:00Z"), new Date("2026-11-18T05:00:00Z"), "America/New_York")).toBe(true);
    expect(isWholeDayRange(new Date("2026-11-17T14:00:00Z"), new Date("2026-11-17T15:00:00Z"), "America/New_York")).toBe(false);
  });
});
