"use client";

import { useState } from "react";
import type { NearbyStore } from "@/lib/queries";
import { StoreMap, type MapFocus } from "./StoreMap";

const RADII = [10, 25, 50, 100] as const;

const INPUT_CLASSES =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

export function StoreFinder() {
  const [zip, setZip] = useState("");
  const [radius, setRadius] = useState<number>(50);
  const [stores, setStores] = useState<NearbyStore[]>([]);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [mode, setMode] = useState<"none" | "search" | "all">("none");
  const [retailer, setRetailer] = useState<string | null>(null); // null = alle
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!/^\d{4}$/.test(zip)) {
      setError("Bitte eine 4-stellige PLZ eingeben.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stores?zip=${zip}&radius=${radius}`);
      if (!res.ok) throw new Error();
      const d = await res.json();
      setStores(d.stores);
      setFocus(d.center ? { center: d.center, radiusKm: d.radiusKm } : null);
      setRetailer(null);
      setMode("search");
    } catch {
      setError("Suche fehlgeschlagen — bitte später nochmal probieren.");
    } finally {
      setLoading(false);
    }
  }

  async function showAll() {
    setLoading(true);
    setError(null);
    try {
      const d = await fetch("/api/stores").then((r) => r.json());
      setStores(d.stores ?? []);
      setFocus(null);
      setRetailer(null);
      setMode("all");
    } finally {
      setLoading(false);
    }
  }

  const retailerNames = [...new Set(stores.map((s) => s.retailerName))].sort();
  const visible = retailer ? stores.filter((s) => s.retailerName === retailer) : stores;
  const inStockCount = visible.filter((s) => s.inStock).length;

  return (
    <div>
      <form onSubmit={search} className="flex flex-wrap items-center gap-2">
        <input
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          placeholder="PLZ, z. B. 1010"
          aria-label="Postleitzahl"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "plz-error" : undefined}
          className={`w-32 ${INPUT_CLASSES}`}
        />
        <select
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          aria-label="Umkreis"
          className={`${INPUT_CLASSES} select-chevron appearance-none pr-9`}
        >
          {RADII.map((r) => (
            <option key={r} value={r}>
              {r} km
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:opacity-50"
        >
          {loading ? "Suche…" : "Filialen suchen"}
        </button>
        {mode !== "all" && (
          <button
            type="button"
            onClick={showAll}
            disabled={loading}
            className="text-sm text-sky-700 underline hover:text-sky-800 disabled:opacity-50 dark:text-sky-400 dark:hover:text-sky-300"
          >
            {mode === "search" ? "alle Filialen anzeigen" : "oder alle auf der Karte zeigen"}
          </button>
        )}
      </form>
      {error && (
        <p id="plz-error" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {mode !== "none" && (
        <div className="mt-4">
          {retailerNames.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {[null, ...retailerNames].map((r) => (
                <button
                  key={r ?? "all"}
                  onClick={() => setRetailer(r)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    retailer === r
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  {r ?? "Alle Händler"}
                </button>
              ))}
            </div>
          )}

          <StoreMap stores={visible} focus={focus} />
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            {visible.length} Filialen
            {inStockCount > 0 ? (
              <span className="font-medium text-green-700 dark:text-green-400"> — {inStockCount} davon lagernd 🟢</span>
            ) : (
              " — derzeit keine lagernd"
            )}
            . Filialdaten von OBI &amp; BAUHAUS; MediaMarkt gibt keine Filialdaten für Server frei.
          </p>
        </div>
      )}

      {mode === "search" && (
        <div className="mt-4">
          {visible.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Keine Filiale mit Verfügbarkeitsdaten im Umkreis gefunden. 😞</p>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {visible.map((s) => (
                <li
                  key={`${s.retailerName}-${s.zip}-${s.name}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm"
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.inStock ? "animate-pulse-dot bg-green-500" : "bg-red-400"}`} aria-hidden />
                  <div className="min-w-0">
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {s.retailerName} {s.name}
                    </span>
                    <span className="ml-2 text-slate-500 dark:text-slate-400">
                      {s.zip} {s.city}
                    </span>
                  </div>
                  {s.distanceKm !== null && (
                    <span className="ml-auto shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{s.distanceKm.toFixed(0)} km</span>
                  )}
                  <span
                    className={`w-24 shrink-0 text-right text-xs font-medium ${s.inStock ? "text-green-700 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}
                  >
                    {s.inStock ? "Lagernd" : "Ausverkauft"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
