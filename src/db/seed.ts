import type { DataSource } from "typeorm";
import { RetailerEntity, VariantEntity } from "./entities";

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
      { slug: "hornbach", name: "HORNBACH", homepage: "https://www.hornbach.at" },
      { slug: "mediamarkt", name: "MediaMarkt", homepage: "https://www.mediamarkt.at" },
      { slug: "tepto", name: "Tepto", homepage: "https://www.tepto.at" },
    ],
    ["slug"],
  );
}
