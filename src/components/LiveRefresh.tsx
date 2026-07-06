"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Refreshes the server-rendered data every 30s while the tab is visible. */
export function LiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30_000);
    return () => clearInterval(interval);
  }, [router]);
  return null;
}
