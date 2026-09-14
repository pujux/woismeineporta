import { describe, expect, it } from "vitest";
import { mediamarktAdapter } from "@/lib/retailers/mediamarkt";
import { fixture, fixtureFetch } from "./helpers";

const mmFetch = fixtureFetch([
  ["-2075674.html", fixture("mediamarkt-pdp-portasplit.html")],
  ["-2080923.html", fixture("mediamarkt-pdp-portasplit-cool.html")],
]);

describe("mediamarktAdapter", () => {
  it("has the right identity", () => {
    expect(mediamarktAdapter.slug).toBe("mediamarkt");
    expect(mediamarktAdapter.tier).toBe("slow");
  });

  it("parses both variants from PDP fixtures", async () => {
    const result = await mediamarktAdapter.check(mmFetch);

    expect(result.retailerSlug).toBe("mediamarkt");
    expect(result.storeStock).toBeNull();
    expect(result.offers).toHaveLength(2);

    const base = result.offers.find((o) => o.variant === "portasplit")!;
    // fixture: JSON-LD OutOfStock, onlineStatus TEMPORARILY_NOT_AVAILABLE
    expect(base.status).toBe("out_of_stock");
    expect(base.priceCents).toBe(95900);
    // No pickup note is emitted at all (the store-pickup signal is unverifiable and
    // misled — it stayed PARTIALLY_AVAILABLE even for permanently sold-out items).
    expect(base).not.toHaveProperty("pickupNote");

    const cool = result.offers.find((o) => o.variant === "portasplit-cool")!;
    expect(cool.status).toBe("out_of_stock");
    expect(cool.priceCents).toBeGreaterThan(0);
  });

  it("throws when the PDP is blocked", async () => {
    const blocked = fixtureFetch([["mediamarkt.at", "<html>403</html>", 403]]);
    await expect(mediamarktAdapter.check(blocked)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("falls back to onlineStatus when a discontinued product has dropped its JSON-LD", async () => {
    // 2080923 lost its Product JSON-LD (permanently not available); onlineStatus is still
    // present, so it must resolve to out_of_stock (price null) rather than throw.
    const noLd = `<html><body>"CofrOnlineStatusFeature","id":"Media:de:2080923","onlineStatus":"PERMANENTLY_NOT_AVAILABLE"</body></html>`;
    const result = await mediamarktAdapter.check(
      fixtureFetch([
        ["-2075674.html", fixture("mediamarkt-pdp-portasplit.html")],
        ["-2080923.html", noLd],
      ]),
    );
    const cool = result.offers.find((o) => o.variant === "portasplit-cool")!;
    expect(cool.status).toBe("out_of_stock");
    expect(cool.priceCents).toBeNull();
    // the healthy variant still parses normally
    expect(result.offers.find((o) => o.variant === "portasplit")!.status).toBe("out_of_stock");
  });

  it("throws when a product page has neither JSON-LD nor onlineStatus (blocked / layout change)", async () => {
    const junk = fixtureFetch([
      ["-2075674.html", "<html><body>nothing useful</body></html>"],
      ["-2080923.html", "<html><body>nothing useful</body></html>"],
    ]);
    await expect(mediamarktAdapter.check(junk)).rejects.toThrow(/no product data/i);
  });
});
