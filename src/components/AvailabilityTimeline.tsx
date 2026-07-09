"use client";

import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import type { TimelineSeries, VariantTimeline } from "@/lib/queries";

const DATE_FMT = new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", day: "2-digit", month: "2-digit", year: "numeric" });
const MONTH_FMT = new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", month: "short" });
const fmtDate = (ms: number) => DATE_FMT.format(new Date(ms));

const W = 700;
const H = 150;

function Chart({ series }: Readonly<{ series: TimelineSeries }>) {
  const { buckets } = series;
  const n = buckets.length;
  const gap = 3;
  const bw = (W - gap * (n - 1)) / n;
  const [pMin, pMax] = series.priceRange ?? [0, 0];
  const bandTop = 0.18 * H;
  const bandBot = 0.82 * H;
  const priceY = (c: number) => (pMax === pMin ? (bandTop + bandBot) / 2 : bandBot - ((c - pMin) / (pMax - pMin)) * (bandBot - bandTop));

  const linePts = buckets
    .map((b, i) => (b.priceCents === null ? null : `${(i * (bw + gap) + bw / 2).toFixed(1)},${priceY(b.priceCents).toFixed(1)}`))
    .filter(Boolean)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" preserveAspectRatio="none" role="img" aria-label="Verfügbarkeits- und Preisverlauf">
      {buckets.map((b, i) => {
        const x = i * (bw + gap);
        const green = b.avail > 0;
        // grey-blue = not available; green with rising opacity = longer available
        const fill = green ? "#22c55e" : "#475569";
        const opacity = green ? 0.3 + 0.6 * b.avail : 0.35;
        return <rect key={i} x={x.toFixed(1)} y={0} width={bw.toFixed(1)} height={H} rx={2} fill={fill} opacity={opacity} />;
      })}
      {series.priceRange && linePts && (
        <polyline points={linePts} fill="none" stroke="#f8fafc" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
      )}
    </svg>
  );
}

function Pill({ active, onClick, children }: Readonly<{ active: boolean; onClick: () => void; children: React.ReactNode }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
        active
          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

export function AvailabilityTimeline({ data }: Readonly<{ data: VariantTimeline[] }>) {
  const withData = data.filter((v) => v.since !== null);
  const initial = (withData[0] ?? data[0])?.slug;
  const [variantSlug, setVariantSlug] = useState<string | undefined>(initial);
  const [shop, setShop] = useState("all");

  const variant = useMemo(() => data.find((v) => v.slug === variantSlug) ?? data[0], [data, variantSlug]);
  if (!variant) return null;

  const series = variant.series[shop] ?? variant.series.all;
  const range = series?.priceRange;

  const selectVariant = (slug: string) => {
    setVariantSlug(slug);
    setShop("all");
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Verfügbarkeits-Verlauf</h2>

      {/* product toggle */}
      {data.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {data.map((v) => (
            <Pill key={v.slug} active={v.slug === variant.slug} onClick={() => selectVariant(v.slug)}>
              {v.name.replace("Midea ", "")}
            </Pill>
          ))}
        </div>
      )}

      {variant.since === null || !series ? (
        <p className="mt-6 rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
          Wir sammeln gerade Verfügbarkeitsdaten — der Verlauf erscheint, sobald genug beobachtet wurde.
        </p>
      ) : (
        <>
          {/* shop tabs */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill active={shop === "all"} onClick={() => setShop("all")}>
              Alle Shops
            </Pill>
            {variant.shops.map((s) => (
              <Pill key={s.slug} active={shop === s.slug} onClick={() => setShop(s.slug)}>
                {s.name}
              </Pill>
            ))}
          </div>

          <p className="mt-5 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Verfügbarkeitsverlauf <span className="font-normal text-slate-400">(seit {fmtDate(variant.since)})</span>
          </p>
          <div className="mt-2">
            <Chart series={series} />
            <div className="mt-1 flex justify-between text-xs text-slate-400">
              <span>{MONTH_FMT.format(new Date(variant.since))}</span>
              <span>{MONTH_FMT.format(new Date(variant.now))}</span>
            </div>
          </div>

          {/* legend */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-slate-500/40" /> nicht verfügbar
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-6 rounded-sm bg-gradient-to-r from-green-500/30 to-green-500/90" /> verfügbar (kräftiger = länger)
            </span>
            {range && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-5 rounded bg-slate-900 dark:bg-slate-100" /> Preis:{" "}
                {range[0] === range[1] ? formatPrice(range[0]) : `${formatPrice(range[0])} – ${formatPrice(range[1])}`}
              </span>
            )}
          </div>

          <p className="mt-4 text-xs text-slate-400">Basis: {variant.eventCount} Verfügbarkeits-Events seit {fmtDate(variant.since)}.</p>
        </>
      )}
    </section>
  );
}
