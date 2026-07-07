import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit, then blocks within the window", () => {
    const limited = createRateLimiter(3, 1000);
    expect(limited("a", 0)).toBe(false); // 1
    expect(limited("a", 100)).toBe(false); // 2
    expect(limited("a", 200)).toBe(false); // 3
    expect(limited("a", 300)).toBe(true); // 4th -> blocked
  });

  it("resets after the window passes", () => {
    const limited = createRateLimiter(1, 1000);
    expect(limited("a", 0)).toBe(false);
    expect(limited("a", 500)).toBe(true); // still in window
    expect(limited("a", 1500)).toBe(false); // window elapsed
  });

  it("tracks keys independently", () => {
    const limited = createRateLimiter(1, 1000);
    expect(limited("a", 0)).toBe(false);
    expect(limited("b", 0)).toBe(false); // different key unaffected
    expect(limited("a", 0)).toBe(true);
  });
});

describe("clientIp", () => {
  it("takes the first XFF entry, trimmed", () => {
    const req = new Request("https://x.at", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } });
    expect(clientIp(req)).toBe("203.0.113.9");
  });
  it("falls back to 'local' without XFF", () => {
    expect(clientIp(new Request("https://x.at"))).toBe("local");
  });
});
