import { describe, expect, it, vi } from "vitest";
import { AdapterHttpError, politeFetch } from "@/lib/retailers/fetch";

describe("politeFetch", () => {
  it("sends browser-like headers and resolves on 200", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const res = await politeFetch("https://example.at/x", undefined, fetchFn);
    expect(res.status).toBe(200);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://example.at/x");
    const headers = new Headers(init.headers);
    expect(headers.get("user-agent")).toMatch(/Chrome/);
    expect(headers.get("accept-language")).toContain("de-AT");
  });

  it("throws AdapterHttpError with status on non-2xx", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("nope", { status: 403 }));
    await expect(politeFetch("https://example.at/x", undefined, fetchFn)).rejects.toMatchObject({
      name: "AdapterHttpError",
      status: 403,
    });
    await expect(
      politeFetch("https://example.at/x", undefined, fetchFn),
    ).rejects.toBeInstanceOf(AdapterHttpError);
  });

  it("merges caller headers over defaults", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await politeFetch("https://example.at/x", { headers: { Accept: "application/json" } }, fetchFn);
    const headers = new Headers(fetchFn.mock.calls[0][1].headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("user-agent")).toMatch(/Chrome/);
  });
});
