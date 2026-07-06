import { formatPrice, formatRelativeTime } from "@/lib/format";
import type { VariantStatus } from "@/lib/queries";

const STATUS_META = {
  in_stock: { label: "Bestellbar", dot: "bg-green-500", text: "text-green-700" },
  out_of_stock: { label: "Ausverkauft", dot: "bg-red-500", text: "text-red-700" },
  unknown: { label: "Status unbekannt", dot: "bg-gray-400", text: "text-gray-500" },
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
      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-slate-300 hover:shadow"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
          <span className="font-semibold text-slate-900">{offer.retailerName}</span>
          <span className={`text-sm font-medium ${meta.text}`}>{meta.label}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {offer.pickupNote ? `${offer.pickupNote} · ` : ""}
          {offer.lastCheckedAt === 0
            ? "noch nicht geprüft"
            : `geprüft ${formatRelativeTime(offer.lastCheckedAt, now)}`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-semibold tabular-nums text-slate-900">{formatPrice(offer.priceCents)}</div>
        <div className="text-xs text-sky-700">Zum Shop →</div>
      </div>
    </a>
  );
}
