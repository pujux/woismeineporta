"use client";

import { useMemo, useState } from "react";
import { formatDateTime, formatDuration, formatPrice, formatRelativeTime } from "@/lib/format";
import type { FeedEvent } from "@/lib/queries";
import { RelativeTime } from "./RelativeTime";

const AVAILABILITY = new Set([
  "online_restock",
  "online_soldout",
  "store_restock",
  "store_soldout",
]);
const RESTOCK = new Set(["online_restock", "store_restock"]);
const SOLDOUT = new Set(["online_soldout", "store_soldout"]);

type FilterKey = "all" | "availability" | "price";

const FILTERS: Array<{ key: FilterKey; label: string; active: string }> = [
  { key: "all", label: "Alle", active: "bg-slate-900 text-white dark:bg-white dark:text-slate-900" },
  { key: "availability", label: "Verfügbarkeit", active: "bg-green-600 text-white" },
  { key: "price", label: "Preis", active: "bg-sky-600 text-white" },
];

const PAGE_SIZE = 8;
const NEW_WINDOW_MS = 30 * 60_000;

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3.5 w-3.5" aria-hidden>
    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3.5 w-3.5" aria-hidden>
    <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function meta(type: string) {
  if (RESTOCK.has(type))
    return { label: "Bestellbar", circle: "bg-green-500", labelClass: "text-green-700 dark:text-green-400", icon: <CheckIcon /> };
  if (SOLDOUT.has(type))
    return { label: "Ausverkauft", circle: "bg-slate-400 dark:bg-slate-600", labelClass: "text-slate-500 dark:text-slate-400", icon: <XIcon /> };
  return { label: "Preis geändert", circle: "bg-sky-500", labelClass: "text-sky-700 dark:text-sky-400", icon: <span className="text-[11px] font-bold">€</span> };
}

export function EventFeed({ events, now }: { events: FeedEvent[]; now: number }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [shown, setShown] = useState(PAGE_SIZE);

  // For each sold-out event, how long it had been available (gap to the matching
  // earlier restock of the same offer). Keyed by event reference.
  const durations = useMemo(() => {
    const map = new Map<FeedEvent, number | null>();
    events.forEach((e, i) => {
      if (!SOLDOUT.has(e.type)) return;
      for (let j = i + 1; j < events.length; j++) {
        const p = events[j];
        if (
          RESTOCK.has(p.type) &&
          p.retailerName === e.retailerName &&
          p.variantName === e.variantName &&
          p.storeName === e.storeName
        ) {
          map.set(e, e.createdAt - p.createdAt);
          break;
        }
      }
    });
    return map;
  }, [events]);

  const filtered = useMemo(
    () =>
      events.filter((e) =>
        filter === "all"
          ? true
          : filter === "availability"
            ? AVAILABILITY.has(e.type)
            : e.type === "price_change",
      ),
    [events, filter],
  );

  const visible = filtered.slice(0, shown);

  if (events.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Noch keine Änderungen beobachtet — sobald sich bei einem Händler etwas tut, steht es hier.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => {
              setFilter(f.key);
              setShown(PAGE_SIZE);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === f.key
                ? f.active
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Keine Einträge in dieser Kategorie.</p>
      ) : (
        <div className="relative">
          <div className="absolute bottom-4 left-[13px] top-4 w-px bg-slate-200 dark:bg-slate-800" aria-hidden />
          <ul className="space-y-2.5">
            {visible.map((event, i) => {
              const m = meta(event.type);
              const showPrice =
                event.priceCents !== null && (RESTOCK.has(event.type) || event.type === "price_change");
              const duration = durations.get(event);
              const isNew = i === 0 && filter === "all" && now - event.createdAt < NEW_WINDOW_MS;
              return (
                <li key={i} className="relative flex items-start gap-3">
                  <span
                    className={`relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${m.circle}`}
                  >
                    {m.icon}
                  </span>
                  <div className="flex flex-1 items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                        <span className={`font-semibold uppercase tracking-wide ${m.labelClass}`}>
                          {m.label}
                        </span>
                        {isNew && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                            Neu
                          </span>
                        )}
                        <span className="text-slate-400 dark:text-slate-500">
                          bei{" "}
                          <span className="text-slate-600 dark:text-slate-300">
                            {event.retailerName}
                            {event.storeName ? ` ${event.storeName}` : ""}
                          </span>
                        </span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span className="text-slate-400 dark:text-slate-500">
                          {formatDateTime(event.createdAt)}
                        </span>
                        {duration != null && (
                          <>
                            <span className="text-slate-300 dark:text-slate-600">·</span>
                            <span className="text-slate-400 dark:text-slate-500">
                              {formatDuration(duration)} verfügbar
                            </span>
                          </>
                        )}
                      </div>
                      <p className="mt-0.5 truncate font-medium text-slate-900 dark:text-slate-100">
                        {event.variantName}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">
                        <RelativeTime
                          timestamp={event.createdAt}
                          initial={formatRelativeTime(event.createdAt, now)}
                        />
                      </p>
                    </div>
                    {showPrice && (
                      <div className="shrink-0 self-center tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {formatPrice(event.priceCents)}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {shown < filtered.length && (
        <div className="mt-4 text-center">
          <button
            onClick={() => setShown((s) => s + PAGE_SIZE)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Mehr laden
          </button>
        </div>
      )}
    </div>
  );
}
