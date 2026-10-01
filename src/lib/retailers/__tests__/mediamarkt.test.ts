import { describe, expect, it } from "vitest";
import { mediamarktAdapter } from "@/lib/retailers/mediamarkt";
import { fixture, fixtureFetch } from "./helpers";

const mmFetch = fixtureFetch([["-2075674.html", fixture("mediamarkt-pdp-portasplit.html")]]);

describe("mediamarktAdapter", () => {
  it("has the right identity", () => {
    expect(mediamarktAdapter.slug).toBe("mediamarkt");
    expect(mediamarktAdapter.tier).toBe("slow");
  });

  it("parses the tracked PortaSplit variant from the PDP fixture", async () => {
    const result = await mediamarktAdapter.check(mmFetch);

    expect(result.retailerSlug).toBe("mediamarkt");
    expect(result.storeStock).toBeNull();
    // Only the 12k variant is tracked; MediaMarkt delisted the Cool variant (HTTP 410).
    expect(result.offers).toHaveLength(1);

    const base = result.offers[0];
    expect(base.variant).toBe("portasplit");
    // fixture: JSON-LD OutOfStock, onlineStatus TEMPORARILY_NOT_AVAILABLE
    expect(base.status).toBe("out_of_stock");
    expect(base.priceCents).toBe(95900);
    // No pickup note is emitted at all (the store-pickup signal is unverifiable and
    // misled — it stayed PARTIALLY_AVAILABLE even for permanently sold-out items).
    expect(base).not.toHaveProperty("pickupNote");
  });

  it("throws when the PDP is blocked", async () => {
    const blocked = fixtureFetch([["mediamarkt.at", "<html>403</html>", 403]]);
    await expect(mediamarktAdapter.check(blocked)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("falls back to onlineStatus when the page has dropped its Product JSON-LD", async () => {
    // A page can lose its Product JSON-LD while still exposing onlineStatus; that must
    // resolve to a real status (price null) rather than throw.
    const noLd = `<html><body>"CofrOnlineStatusFeature","id":"Media:de:2075674","onlineStatus":"PERMANENTLY_NOT_AVAILABLE"</body></html>`;
    const result = await mediamarktAdapter.check(fixtureFetch([["-2075674.html", noLd]]));
    expect(result.offers[0].status).toBe("out_of_stock");
    expect(result.offers[0].priceCents).toBeNull();
  });

  it("throws when a product page has neither JSON-LD nor onlineStatus (blocked / layout change)", async () => {
    const junk = fixtureFetch([["-2075674.html", "<html><body>nothing useful</body></html>"]]);
    await expect(mediamarktAdapter.check(junk)).rejects.toThrow(/no product data/i);
  });
});
