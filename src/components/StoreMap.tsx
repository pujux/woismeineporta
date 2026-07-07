"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Circle, CircleMarker, MarkerClusterGroup } from "leaflet";
import type { NearbyStore } from "@/lib/queries";

const AUSTRIA_CENTER: [number, number] = [47.6, 14.1];
const AUSTRIA_ZOOM = 7;

export interface MapFocus {
  center: { lat: number; lng: number };
  radiusKm: number;
}

/** Stable id for a store, shared by the list rows and the map markers. */
export const storeKey = (s: Pick<NearbyStore, "retailerName" | "zip" | "name">) => `${s.retailerName}-${s.zip}-${s.name}`;

// Popups are built from retailer-API / seed data; escape before dropping into HTML.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function StoreMap({
  stores,
  focus,
  selected,
  onSelectedChange,
}: Readonly<{ stores: NearbyStore[]; focus: MapFocus | null; selected?: string | null; onSelectedChange?: (key: string | null) => void }>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const clusterRef = useRef<MarkerClusterGroup | null>(null);
  const markerByKeyRef = useRef<Map<string, CircleMarker>>(new Map());
  const radiusRef = useRef<Circle | null>(null);
  // Latest callback, read from inside Leaflet event handlers bound in another effect.
  const onSelectRef = useRef(onSelectedChange);
  useEffect(() => {
    onSelectRef.current = onSelectedChange;
  }, [onSelectedChange]);

  // init once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
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
      const L = (await import("leaflet")).default;
      // markercluster augments Leaflet's default export; expose it as window.L so
      // the plugin patches the same object we call markerClusterGroup on.
      (window as unknown as { L: typeof L }).L = L;
      await import("leaflet.markercluster");
      const map = mapRef.current;
      if (!map) return;

      // Cluster nearby markers; they split into individual dots as you zoom in,
      // and stacked stores (e.g. several in Vienna) spiderfy on click.
      clusterRef.current?.remove();
      const cluster = L.markerClusterGroup({
        maxClusterRadius: 45,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
      });
      markerByKeyRef.current = new Map();
      for (const s of stores) {
        const marker = L.circleMarker([s.lat, s.lng], {
          radius: s.inStock ? 8 : 6,
          color: s.inStock ? "#15803d" : "#b91c1c",
          fillColor: s.inStock ? "#22c55e" : "#ef4444",
          fillOpacity: 0.85,
          weight: 1.5,
        }).bindPopup(
          `<strong>${esc(s.retailerName)} ${esc(s.name)}</strong><br>${esc(s.zip)} ${esc(s.city)}<br>` +
            (s.inStock ? '<span style="color:#15803d;font-weight:600">Lagernd ✓</span>' : '<span style="color:#b91c1c">Ausverkauft</span>'),
        );
        const key = storeKey(s);
        // Selecting on the map ↔ selecting in the list. Opening a popup selects
        // this store; closing it clears the selection.
        marker.on("popupopen", () => onSelectRef.current?.(key));
        marker.on("popupclose", () => onSelectRef.current?.(null));
        cluster.addLayer(marker);
        markerByKeyRef.current.set(key, marker);
      }
      cluster.addTo(map);
      clusterRef.current = cluster;

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

  // Pan/zoom to a store picked from the list. zoomToShowLayer breaks it out of
  // its cluster (zooming as needed), centers it, then opens its popup.
  useEffect(() => {
    if (!selected) return;
    const marker = markerByKeyRef.current.get(selected);
    const cluster = clusterRef.current;
    if (!marker || !cluster) return;
    // Already open means this selection came *from* the map (marker click) —
    // don't re-pan; just let the list highlight. Only list-driven selections pan.
    if (marker.isPopupOpen()) return;
    cluster.zoomToShowLayer(marker, () => marker.openPopup());
  }, [selected]);

  return (
    <div
      ref={containerRef}
      className="z-0 h-96 w-full overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800 dark:[&_.leaflet-tile]:brightness-[0.7] dark:[&_.leaflet-tile]:contrast-[1.05] dark:[&_.leaflet-tile]:hue-rotate-180 dark:[&_.leaflet-tile]:invert"
      aria-label="Karte der Filialen mit PortaSplit-Verfügbarkeit"
    />
  );
}
