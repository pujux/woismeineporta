"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps the page fresh without polling: subscribes to the /api/live SSE stream
 * and refreshes only when the server signals a real change. Between changes no
 * work happens on either side. A slow fallback interval and a focus refresh
 * cover the case where a proxy blocks SSE.
 */
export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };

    let es: EventSource | null = null;
    let firstOpen = true;
    if (typeof EventSource !== "undefined") {
      es = new EventSource("/api/live");
      es.addEventListener("change", refresh);
      es.addEventListener("open", () => {
        // Skip the initial connect (page is already fresh); on a reconnect,
        // catch any change missed while we were disconnected.
        if (firstOpen) firstOpen = false;
        else refresh();
      });
    }

    // Degraded-mode safety net (SSE blocked): occasional + on-focus refresh.
    const fallback = setInterval(refresh, 120_000);
    const onVisible = () => refresh();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      es?.close();
      clearInterval(fallback);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
