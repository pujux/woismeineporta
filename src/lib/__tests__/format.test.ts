import { describe, expect, it } from "vitest";
import { formatPrice, formatRelativeTime } from "@/lib/format";

describe("formatPrice", () => {
  it("formats Austrian style", () => {
    expect(formatPrice(119900)).toBe("1.199,00 €");
    expect(formatPrice(89999)).toBe("899,99 €");
    expect(formatPrice(0)).toBe("0,00 €");
  });
  it("renders null as dash", () => {
    expect(formatPrice(null)).toBe("–");
  });
});

describe("formatRelativeTime", () => {
  const now = 10 * 24 * 3600 * 1000;
  it.each([
    [now - 30_000, "gerade eben"],
    [now - 5 * 60_000, "vor 5 Min"],
    [now - 3 * 3600_000, "vor 3 Std"],
    [now - 26 * 3600_000, "vor 1 Tag"],
    [now - 3 * 24 * 3600_000, "vor 3 Tagen"],
  ])("%d -> %s", (ts, expected) => {
    expect(formatRelativeTime(ts, now)).toBe(expected);
  });
});
