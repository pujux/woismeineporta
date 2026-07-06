import { formatPrice, formatRelativeTime } from "@/lib/format";
import type { FeedEvent } from "@/lib/queries";

function line(event: FeedEvent): { icon: string; text: string } {
  const where = event.storeName ? ` (${event.storeName})` : "";
  switch (event.type) {
    case "online_restock":
      return { icon: "🟢", text: `${event.retailerName}: ${event.variantName} wieder bestellbar` };
    case "online_soldout":
      return { icon: "🔴", text: `${event.retailerName}: ${event.variantName} ausverkauft` };
    case "price_change":
      return {
        icon: "💶",
        text: `${event.retailerName}: ${event.variantName} jetzt ${formatPrice(event.priceCents)}`,
      };
    case "store_restock":
      return { icon: "🟢", text: `${event.retailerName}${where}: ${event.variantName} lagernd` };
    case "store_soldout":
      return { icon: "🔴", text: `${event.retailerName}${where}: ${event.variantName} nicht mehr lagernd` };
    default:
      return { icon: "ℹ️", text: `${event.retailerName}: ${event.variantName}` };
  }
}

export function EventFeed({ events, now }: { events: FeedEvent[]; now: number }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Noch keine Änderungen beobachtet — sobald sich bei einem Händler etwas tut, steht es hier.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {events.map((event, i) => {
        const l = line(event);
        return (
          <li key={i} className="flex items-baseline gap-2 text-sm">
            <span aria-hidden>{l.icon}</span>
            <span className="text-slate-800">{l.text}</span>
            <span className="ml-auto shrink-0 text-xs text-slate-400">
              {formatRelativeTime(event.createdAt, now)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
