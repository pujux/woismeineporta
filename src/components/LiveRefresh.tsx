"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps the server-rendered data fresh without a manual reload: refreshes every
 * 30s while the tab is visible, and immediately when the tab regains focus.
 */
export function LiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30_000);

    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
