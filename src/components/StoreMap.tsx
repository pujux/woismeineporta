"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, CircleMarker, Circle } from "leaflet";
import type { NearbyStore } from "@/lib/queries";

const AUSTRIA_CENTER: [number, number] = [47.6, 14.1];
const AUSTRIA_ZOOM = 7;

export interface MapFocus {
  center: { lat: number; lng: number };
  radiusKm: number;
}

export function StoreMap({ stores, focus }: Readonly<{ stores: NearbyStore[]; focus: MapFocus | null }>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<CircleMarker[]>([]);
  const radiusRef = useRef<Circle | null>(null);

  // init once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        center: AUSTRIA_CENTER,
        zoom: AUSTRIA_ZOOM,
        scrollWheelZoom: false, // don't hijack page scroll
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // markers + focus
  useEffect(() => {
    (async () => {
      const L = await import("leaflet");
      const map = mapRef.current;
      if (!map) return;

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = stores.map((s) =>
        L.circleMarker([s.lat, s.lng], {
          radius: s.inStock ? 8 : 6,
          color: s.inStock ? "#15803d" : "#b91c1c",
          fillColor: s.inStock ? "#22c55e" : "#ef4444",
          fillOpacity: 0.85,
          weight: 1.5,
        })
          .bindPopup(
            `<strong>${s.retailerName} ${s.name}</strong><br>${s.zip} ${s.city}<br>` +
              (s.inStock ? '<span style="color:#15803d;font-weight:600">Lagernd ✓</span>' : '<span style="color:#b91c1c">Ausverkauft</span>'),
          )
          .addTo(map),
      );

      radiusRef.current?.remove();
      radiusRef.current = null;
      if (focus) {
        radiusRef.current = L.circle([focus.center.lat, focus.center.lng], {
          radius: focus.radiusKm * 1000,
          color: "#0284c7",
          weight: 1.5,
          fillColor: "#0ea5e9",
          fillOpacity: 0.06,
          dashArray: "4 6",
          interactive: false, // don't let the radius overlay swallow marker clicks
        }).addTo(map);
        map.fitBounds(radiusRef.current.getBounds(), { padding: [20, 20] });
      } else {
        map.setView(AUSTRIA_CENTER, AUSTRIA_ZOOM);
      }
    })();
  }, [stores, focus]);

  return (
    <div
      ref={containerRef}
      className="z-0 h-64 w-full overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800 dark:[&_.leaflet-tile]:brightness-[0.7] dark:[&_.leaflet-tile]:contrast-[1.05] dark:[&_.leaflet-tile]:hue-rotate-180 dark:[&_.leaflet-tile]:invert"
      aria-label="Karte der Filialen mit PortaSplit-Verfügbarkeit"
    />
  );
}
