import type { DataSource } from "typeorm";
import { OfferEntity, RetailerEntity, VariantEntity } from "./entities";

export async function seed(db: DataSource): Promise<void> {
  await db.getRepository(VariantEntity).upsert(
    [
      { slug: "portasplit", name: "Midea PortaSplit", uvpCents: 119900 },
      { slug: "portasplit-cool", name: "Midea PortaSplit Cool", uvpCents: 89900 },
    ],
    ["slug"],
  );
  await db.getRepository(RetailerEntity).upsert(
    [
      { slug: "bauhaus", name: "BAUHAUS", homepage: "https://www.bauhaus.at" },
      { slug: "obi", name: "OBI", homepage: "https://www.obi.at" },
      { slug: "mediamarkt", name: "MediaMarkt", homepage: "https://www.mediamarkt.at" },
      { slug: "tepto", name: "Tepto", homepage: "https://www.tepto.at" },
      { slug: "amazon", name: "Amazon", homepage: "https://www.amazon.de" },
      { slug: "pv24", name: "PV-24", homepage: "https://www.pv-24.at" },
      { slug: "online-batterien", name: "Online-Batterien", homepage: "https://online-batterien.at" },
    ],
    ["slug"],
  );

  // Placeholder offers (status unknown) so every tracked retailer/variant pair
  // shows up in the UI with its deep link even before the first check runs.
  const knownOffers = [
    {
      retailerSlug: "bauhaus",
      variantSlug: "portasplit",
      url: "https://www.bauhaus.at/klimaanlagen/midea-klimasplitgeraet-portasplit-12000-btu/p/31934233",
    },
    {
      retailerSlug: "obi",
      variantSlug: "portasplit",
      url: "https://www.obi.at/p/3586245/midea-mobile-split-klimaanlage-portasplit",
    },
    {
      retailerSlug: "obi",
      variantSlug: "portasplit-cool",
      url: "https://www.obi.at/p/4593455/midea-split-klimaanlage-portasplit-cool-mobil-weissgrau",
    },
    {
      retailerSlug: "mediamarkt",
      variantSlug: "portasplit",
      url: "https://www.mediamarkt.at/de/product/_midea-portasplit-mobile-klimaanlage-max-raumgrosse-42-m-eek-a-12000-btuh-weiss-2075674.html",
    },
    {
      retailerSlug: "mediamarkt",
      variantSlug: "portasplit-cool",
      url: "https://www.mediamarkt.at/de/product/_midea-portasplit-cool-mobile-split-klimaanlage-8000btu-mobile-split-klimaanlage-a-28-m-8000-btuh-weiss-2080923.html",
    },
    {
      retailerSlug: "tepto",
      variantSlug: "portasplit",
      url: "https://www.tepto.at/Midea-Klimageraet-PortaSplit",
    },
    {
      retailerSlug: "amazon",
      variantSlug: "portasplit",
      url: "https://www.amazon.de/dp/B0GX16LKSC",
    },
    {
      retailerSlug: "amazon",
      variantSlug: "portasplit-cool",
      url: "https://www.amazon.de/dp/B0GXDWTFR5",
    },
    {
      retailerSlug: "pv24",
      variantSlug: "portasplit",
      url: "https://www.pv-24.at/products/midea-porta-split-mobile-klimaanlage-mit-ausseneinheit/",
    },
    {
      retailerSlug: "online-batterien",
      variantSlug: "portasplit",
      url: "https://online-batterien.at/17837/midea-portasplit-klimageraet-diy-mobile-split-klimaanlage-12k-eek-a/a",
    },
  ];
  await db
    .createQueryBuilder()
    .insert()
    .into(OfferEntity)
    .values(
      knownOffers.map((o) => ({
        ...o,
        priceCents: null,
        status: "unknown" as const,
        pickupNote: null,
        lastCheckedAt: 0,
        lastChangedAt: 0,
      })),
    )
    .orIgnore()
    .updateEntity(false)
    .execute();
}
