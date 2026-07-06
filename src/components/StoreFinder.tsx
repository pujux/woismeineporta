"use client";

import { useState } from "react";
import type { NearbyStore } from "@/lib/queries";

const RADII = [10, 25, 50, 100] as const;

const INPUT_CLASSES =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

export function StoreFinder() {
  const [zip, setZip] = useState("");
  const [radius, setRadius] = useState<number>(50);
  const [stores, setStores] = useState<NearbyStore[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
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
      setStores((await res.json()).stores);
    } catch {
      setError("Suche fehlgeschlagen — bitte später nochmal versuchen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={search} className="flex flex-wrap items-center gap-2">
        <input
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          placeholder="PLZ, z. B. 1010"
          aria-label="Postleitzahl"
          className={`w-32 ${INPUT_CLASSES}`}
        />
        <select
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          aria-label="Umkreis"
          className={INPUT_CLASSES}
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
      </form>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {stores !== null && !error && (
        <div className="mt-4">
          {stores.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Keine Filiale mit Verfügbarkeitsdaten im Umkreis gefunden. 😞
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {stores.map((s, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.inStock ? "animate-pulse-dot bg-green-500" : "bg-red-400"}`}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {s.retailerName} {s.name}
                    </span>
                    <span className="ml-2 text-slate-500 dark:text-slate-400">
                      {s.zip} {s.city}
                    </span>
                  </div>
                  <span className="ml-auto shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                    {s.distanceKm.toFixed(0)} km
                  </span>
                  <span
                    className={`w-24 shrink-0 text-right text-xs font-medium ${s.inStock ? "text-green-700 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}
                  >
                    {s.inStock ? "Lagernd" : "Ausverkauft"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Filialdaten derzeit von OBI (79 Märkte). BAUHAUS &amp; MediaMarkt geben keine
            Filialdaten für Server frei.
          </p>
        </div>
      )}
    </div>
  );
}
