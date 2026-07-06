import type { VariantSlug } from "./retailers/types";

export const VARIANT_SLUGS = ["portasplit", "portasplit-cool"] as const satisfies readonly VariantSlug[];

export const VARIANT_NAMES: Record<VariantSlug, string> = {
  portasplit: "Midea PortaSplit",
  "portasplit-cool": "Midea PortaSplit Cool",
};
