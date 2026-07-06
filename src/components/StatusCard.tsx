import { formatPrice, formatRelativeTime } from "@/lib/format";
import type { VariantStatus } from "@/lib/queries";
import { RelativeTime } from "./RelativeTime";

const STATUS_META = {
  in_stock: {
    label: "Bestellbar",
    chip: "bg-green-100 text-green-800 ring-green-600/20 dark:bg-green-500/15 dark:text-green-300 dark:ring-green-500/30",
    dot: "bg-green-500",
    cta: "Jetzt bestellen →",
    ctaClass: "font-semibold text-sky-600 dark:text-sky-400",
    priceClass: "text-lg font-bold text-slate-900 dark:text-slate-100",
  },
  out_of_stock: {
    label: "Ausverkauft",
    chip: "bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600/40",
    dot: "bg-red-500",
    cta: "Beim Händler ansehen",
    ctaClass: "text-slate-400 dark:text-slate-500",
    priceClass: "text-sm font-normal text-slate-400 dark:text-slate-500",
  },
  unknown: {
    label: "Status unbekannt",
    chip: "bg-slate-100 text-slate-500 ring-slate-500/10 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-600/30",
    dot: "bg-slate-400",
    cta: "Beim Händler ansehen",
    ctaClass: "text-slate-400 dark:text-slate-500",
    priceClass: "text-sm font-normal text-slate-400 dark:text-slate-500",
  },
} as const;

export function StatusCard({ offer, now }: Readonly<{ offer: VariantStatus["offers"][number]; now: number }>) {
  const meta = STATUS_META[offer.status];

  return (
    <a
      href={offer.url}
      target="_blank"
      rel="nofollow noopener"
      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-[border-color,box-shadow] hover:border-sky-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-sky-700"
    >
      <div className="min-w-0 flex-1">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${meta.chip}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${offer.status === "in_stock" ? "animate-pulse-dot" : ""}`} aria-hidden />
          {meta.label}
        </span>
        <p className="mt-1.5 font-medium text-slate-900 dark:text-slate-100">{offer.retailerName}</p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {offer.pickupNote && <span className="text-sky-700 dark:text-sky-400">{offer.pickupNote} · </span>}
          {offer.lastCheckedAt === 0 ? (
            "noch nicht geprüft"
          ) : (
            <>
              <RelativeTime timestamp={offer.lastCheckedAt} initial={formatRelativeTime(offer.lastCheckedAt, now)} /> geprüft
            </>
          )}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <div className={`tabular-nums ${meta.priceClass}`}>{formatPrice(offer.priceCents)}</div>
        <div className={`text-xs ${meta.ctaClass}`}>{meta.cta}</div>
      </div>
    </a>
  );
}
