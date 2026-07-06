"use client";

import { useEffect, useState } from "react";
import { formatRelativeTime } from "@/lib/format";

/**
 * Renders a relative timestamp that updates itself, so the label stays correct
 * regardless of when the (possibly cached) HTML was generated, and ticks
 * between the page's periodic refreshes. `initial` is the server-rendered value
 * to keep the first client paint identical (no hydration mismatch).
 */
export function RelativeTime({ timestamp, initial }: { timestamp: number; initial: string }) {
  const [label, setLabel] = useState(initial);
  useEffect(() => {
    const tick = () => setLabel(formatRelativeTime(timestamp, Date.now()));
    tick();
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, [timestamp]);
  return <>{label}</>;
}
