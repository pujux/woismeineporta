import { FAQ_ITEMS, PRODUCT_DESCRIPTIONS } from "@/data/product-content";
import { formatPrice } from "@/lib/format";

interface VariantInfo {
  slug: string;
  name: string;
  uvpCents: number;
}

/**
 * Static, server-rendered info + FAQ. Gives crawlers real prose to match against
 * long-tail queries, and pairs with the Product/FAQ JSON-LD on the page. The
 * FAQ uses native <details> so the answers stay in the HTML (crawlable) without JS.
 */
export function ProductInfo({ variants }: Readonly<{ variants: VariantInfo[] }>) {
  return (
    <>
      <div className="grid mb-3 gap-3 sm:grid-cols-2">
        {variants.map((v) => (
          <div key={v.slug} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">{v.name}</h3>
              <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">UVP {formatPrice(v.uvpCents)}</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{PRODUCT_DESCRIPTIONS[v.slug]}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Häufige Fragen</h3>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {FAQ_ITEMS.map((f) => (
            <details key={f.question} className="group py-2.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                {f.question}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180"
                  aria-hidden
                >
                  <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{f.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </>
  );
}
