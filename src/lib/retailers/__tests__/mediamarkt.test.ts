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
});
