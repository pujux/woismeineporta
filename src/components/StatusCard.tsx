import { formatPrice, formatRelativeTime } from "@/lib/format";
import type { VariantStatus } from "@/lib/queries";

const STATUS_META = {
  in_stock: {
    label: "Bestellbar",
    chip: "bg-green-100 text-green-800 ring-green-600/20 dark:bg-green-500/10 dark:text-green-400 dark:ring-green-500/30",
    dot: "bg-green-500",
  },
  out_of_stock: {
    label: "Ausverkauft",
    chip: "bg-red-100 text-red-700 ring-red-600/10 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20",
    dot: "bg-red-500",
  },
  unknown: {
    label: "Status unbekannt",
    chip: "bg-slate-100 text-slate-500 ring-slate-500/10 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20",
    dot: "bg-slate-400",
  },
} as const;

export function StatusCard({
  offer,
  now,
}: {
  offer: VariantStatus["offers"][number];
  now: number;
}) {
  const meta = STATUS_META[offer.status];
  return (
    <a
      href={offer.url}
      target="_blank"
      rel="nofollow noopener"
      className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-px hover:border-sky-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-sky-700"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {offer.retailerName}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.chip}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${offer.status === "in_stock" ? "animate-pulse-dot" : ""}`}
              aria-hidden
            />
            {meta.label}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
          {offer.pickupNote ? `${offer.pickupNote} · ` : ""}
          {offer.lastCheckedAt === 0
            ? "noch nicht geprüft"
            : `geprüft ${formatRelativeTime(offer.lastCheckedAt, now)}`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {formatPrice(offer.priceCents)}
        </div>
        <div className="text-xs text-sky-600 transition group-hover:translate-x-0.5 dark:text-sky-400">
          Zum Shop →
        </div>
      </div>
    </a>
  );
}
