import { BRAND, PRODUCT_DESCRIPTIONS, type FaqItem } from "@/data/product-content";
import type { VariantStatus } from "./queries";

// schema.org availability URLs. "unknown" maps to nothing (we don't assert it).
const AVAILABILITY: Record<string, string> = {
  in_stock: "https://schema.org/InStock",
  out_of_stock: "https://schema.org/OutOfStock",
  pre_orderable: "https://schema.org/PreOrder",
};

const euro = (cents: number) => (cents / 100).toFixed(2);

/**
 * One Product node per variant. Offers are attributed to the actual retailer
 * (seller) and link to the retailer's page — we're a price/availability
 * aggregator, not the seller. Multiple priced offers become an AggregateOffer
 * (the "comparing several shops" signal); otherwise the offers are listed as-is.
 */
export function buildProductJsonLd(statuses: VariantStatus[], baseUrl: string): Record<string, unknown>[] {
  return statuses.map((s) => {
    const offers = s.offers.map((o) => {
      const offer: Record<string, unknown> = {
        "@type": "Offer",
        url: o.url,
        priceCurrency: "EUR",
        seller: { "@type": "Organization", name: o.retailerName },
      };
      if (o.priceCents != null) offer.price = euro(o.priceCents);
      if (AVAILABILITY[o.status]) offer.availability = AVAILABILITY[o.status];
      return offer;
    });

    const prices = s.offers.map((o) => o.priceCents).filter((p): p is number => p != null);

    const product: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: s.variant.name,
      description: PRODUCT_DESCRIPTIONS[s.variant.slug] ?? "",
      brand: { "@type": "Brand", name: BRAND },
      category: "Mobile Klimaanlage",
      url: baseUrl,
    };

    if (offers.length) {
      product.offers = prices.length
        ? {
            "@type": "AggregateOffer",
            priceCurrency: "EUR",
            lowPrice: euro(Math.min(...prices)),
            highPrice: euro(Math.max(...prices)),
            offerCount: offers.length,
            offers,
          }
        : offers;
    }

    return product;
  });
}

export function buildFaqJsonLd(items: FaqItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

/** Serialize JSON-LD for a <script> tag, escaping `<` to prevent XSS injection. */
export function jsonLdScript(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}
