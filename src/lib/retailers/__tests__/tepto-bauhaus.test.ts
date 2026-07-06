import { describe, expect, it } from "vitest";
import { teptoAdapter } from "@/lib/retailers/tepto";
import { bauhausAdapter } from "@/lib/retailers/bauhaus";
import { fixture, fixtureFetch } from "./helpers";

describe("teptoAdapter", () => {
  it("parses the base variant from the PDP fixture", async () => {
    const result = await teptoAdapter.check(
      fixtureFetch([["tepto.at", fixture("tepto-pdp-portasplit.html")]]),
    );
    expect(result.retailerSlug).toBe("tepto");
    expect(teptoAdapter.tier).toBe("slow");
    expect(result.storeStock).toBeNull();
    expect(result.offers).toEqual([
      {
        variant: "portasplit",
        url: "https://www.tepto.at/Midea-Klimageraet-PortaSplit",
        priceCents: 82679,
        status: "out_of_stock", // SoldOut
      },
    ]);
  });

  it("throws on server error", async () => {
    await expect(
      teptoAdapter.check(fixtureFetch([["tepto.at", "oops", 500]])),
    ).rejects.toMatchObject({ status: 500 });
  });
});

describe("bauhausAdapter", () => {
  it("parses JSON-LD when not blocked", async () => {
    const result = await bauhausAdapter.check(
      fixtureFetch([["bauhaus.at", fixture("bauhaus-pdp-portasplit-synthetic.html")]]),
    );
    expect(bauhausAdapter.tier).toBe("slow");
    expect(result.offers).toEqual([
      {
        variant: "portasplit",
        url: "https://www.bauhaus.at/klimaanlagen/midea-klimasplitgeraet-portasplit-12000-btu/p/31934233",
        priceCents: 74900,
        status: "out_of_stock",
      },
    ]);
  });

  it("throws AdapterHttpError on the usual Cloudflare 403", async () => {
    await expect(
      bauhausAdapter.check(fixtureFetch([["bauhaus.at", "Sicherheitsprüfung", 403]])),
    ).rejects.toMatchObject({ name: "AdapterHttpError", status: 403 });
  });
});
