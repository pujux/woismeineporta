import { describe, expect, it } from "vitest";
import { distanceKm, plzToLatLng } from "@/lib/geo";

describe("plzToLatLng", () => {
  it("resolves Vienna city center", () => {
    const p = plzToLatLng("1010")!;
    expect(p.lat).toBeCloseTo(48.2, 1);
    expect(p.lng).toBeCloseTo(16.37, 1);
  });

  it("returns null for unknown ZIPs", () => {
    expect(plzToLatLng("0000")).toBeNull();
    expect(plzToLatLng("99999")).toBeNull();
  });
});

describe("distanceKm", () => {
  it("computes Vienna–Linz roughly", () => {
    const wien = plzToLatLng("1010")!;
    const linz = plzToLatLng("4020")!;
    const d = distanceKm(wien.lat, wien.lng, linz.lat, linz.lng);
    expect(d).toBeGreaterThan(140);
    expect(d).toBeLessThan(170);
  });

  it("is zero for identical points", () => {
    expect(distanceKm(48.2, 16.37, 48.2, 16.37)).toBe(0);
  });
});
