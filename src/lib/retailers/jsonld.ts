import type { StockStatus } from "./types";

export interface LdOffer {
  priceCents: number | null;
  status: StockStatus;
}

const IN_STOCK = new Set(["InStock", "LimitedAvailability", "OnlineOnly", "PreSale"]);
const OUT_OF_STOCK = new Set(["OutOfStock", "SoldOut", "Discontinued", "InStoreOnly"]);

function mapAvailability(availability: string | undefined): StockStatus {
  if (!availability) return "unknown";
  const name = availability.split("/").pop() ?? "";
  if (IN_STOCK.has(name)) {
    return "in_stock";
  }
  if (OUT_OF_STOCK.has(name)) {
    return "out_of_stock";
  }
  return "unknown";
}

/**
 * Extracts the first schema.org Product offer from JSON-LD script blocks in an
 * HTML page. Returns null when no Product with offers is present.
 */
export function parseProductLd(html: string): LdOffer | null {
  const scriptRe = /<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs;
  for (const match of html.matchAll(scriptRe)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      continue;
    }
    const stack: unknown[] = [parsed];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) {
        stack.push(...node);
        continue;
      }
      if (typeof node !== "object" || node === null) continue;
      const obj = node as Record<string, unknown>;
      if (obj["@type"] === "Product" && obj.offers) {
        const offers = obj.offers;
        const offer = (Array.isArray(offers) ? offers[0] : offers) as Record<string, unknown>;
        const price = offer?.price;
        const priceCents =
          typeof price === "number"
            ? Math.round(price * 100)
            : typeof price === "string" && price !== ""
              ? Math.round(parseFloat(price) * 100)
              : null;
        return {
          priceCents: Number.isFinite(priceCents) ? priceCents : null,
          status: mapAvailability(offer?.availability as string | undefined),
        };
      }
      stack.push(...Object.values(obj));
    }
  }
  return null;
}
